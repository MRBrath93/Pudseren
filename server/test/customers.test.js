// Integrationstest af kunderegistret mod testdatabasen.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { migrate } from '../scripts/migrate.js';
import { createUser, loginAs, testConfig as config } from './helpers.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

const customer = {
  name: 'Testkunde',
  address: 'Testvej 1',
  postal_code: '6000',
  city: 'Kolding',
  interval_weeks: 4,
  last_cleaned_on: '2026-01-01',
  key_code: '4719',
};

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

describe.skipIf(!databaseUrl)('kunder', () => {
  let pool;
  let app;
  let chef;
  let worker;

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    await migrate(pool);
    app = createApp({ pool, config, loginLimit: 1000, codeLimit: 1000, pruneSessions: false });
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE users, customers, "session" RESTART IDENTITY CASCADE');
    chef = await createUser(pool, { name: 'Chef', email: 'chef@test.dk', role: 'chef', twoFactor: true });
    worker = await createUser(pool, { name: 'Lars', email: 'lars@test.dk', role: 'medarbejder' });
  });

  it('kræver login', async () => {
    await request(app).get('/api/customers').expect(401);
  });

  it('er kun for chefen', async () => {
    const agent = await loginAs(app, worker);
    await agent.get('/api/customers').expect(403);
  });

  it('opretter en kunde og beregner næste pudsning', async () => {
    const agent = await loginAs(app, chef);
    const res = await agent.post('/api/customers').send(customer).expect(201);
    expect(res.body.customer.name).toBe('Testkunde');
    expect(res.body.customer.next_due).toBe('2026-01-29');
    expect(res.body.customer.has_key_code).toBe(true);
  });

  it('gemmer nøglekoden krypteret og sender den aldrig med i listen', async () => {
    const agent = await loginAs(app, chef);
    await agent.post('/api/customers').send(customer).expect(201);

    const { rows } = await pool.query('SELECT key_code_enc FROM customers');
    expect(rows[0].key_code_enc).not.toContain('4719');

    const list = await agent.get('/api/customers').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('4719');
    expect(JSON.stringify(list.body)).not.toContain('key_code_enc');
  });

  it('viser nøglekoden for sig, uden cache, og logger hvem der så den', async () => {
    const agent = await loginAs(app, chef);
    const { body } = await agent.post('/api/customers').send(customer).expect(201);

    const res = await agent.get(`/api/customers/${body.customer.id}/key-code`).expect(200);
    expect(res.body.keyCode).toBe('4719');
    expect(res.headers['cache-control']).toBe('no-store');

    const log = await pool.query('SELECT user_id, customer_id FROM key_code_views');
    expect(log.rows).toEqual([{ user_id: chef.id, customer_id: body.customer.id }]);
  });

  it('afviser ugyldige oplysninger og fortæller hvilket felt', async () => {
    const agent = await loginAs(app, chef);
    const res = await agent.post('/api/customers').send({ ...customer, postal_code: '60' }).expect(400);
    expect(res.body.fields[0].field).toBe('postal_code');
  });

  it('søger på navn og adresse', async () => {
    const agent = await loginAs(app, chef);
    await agent.post('/api/customers').send({ ...customer, name: 'Birgit Lauridsen', address: 'Ærøvej 14' });
    await agent.post('/api/customers').send({ ...customer, name: 'Jens Kragh', address: 'Gudenåvej 3' });

    const byName = await agent.get('/api/customers?search=birgit').expect(200);
    expect(byName.body.customers).toHaveLength(1);
    const byAddress = await agent.get('/api/customers?search=gudenå').expect(200);
    expect(byAddress.body.customers[0].name).toBe('Jens Kragh');
  });

  it('beregner hvem der skal pudses', async () => {
    const agent = await loginAs(app, chef);
    await agent.post('/api/customers').send({ ...customer, name: 'Over tid', last_cleaned_on: daysAgo(35) });
    await agent.post('/api/customers').send({ ...customer, name: 'Lige pudset', last_cleaned_on: daysAgo(1) });
    await agent.post('/api/customers').send({ ...customer, name: 'Aldrig pudset', last_cleaned_on: null });

    const res = await agent.get('/api/customers/due').expect(200);
    const names = [];
    for (const c of res.body.customers) names.push(c.name);
    expect(names).toEqual(['Over tid', 'Aldrig pudset']);
    expect(res.body.customers[0].days_overdue).toBe(7);
  });

  it('retter kun de felter, der sendes med', async () => {
    const agent = await loginAs(app, chef);
    const { body } = await agent.post('/api/customers').send(customer).expect(201);
    const res = await agent.patch(`/api/customers/${body.customer.id}`).send({ interval_weeks: 8 }).expect(200);
    expect(res.body.customer.interval_weeks).toBe(8);
    expect(res.body.customer.name).toBe('Testkunde');
    expect(res.body.customer.has_key_code).toBe(true);
  });

  it('kan fjerne nøglekoden', async () => {
    const agent = await loginAs(app, chef);
    const { body } = await agent.post('/api/customers').send(customer).expect(201);
    const res = await agent.patch(`/api/customers/${body.customer.id}`).send({ key_code: '' }).expect(200);
    expect(res.body.customer.has_key_code).toBe(false);
  });

  it('sletter en kunde helt, også loggen over nøglekoden', async () => {
    const agent = await loginAs(app, chef);
    const { body } = await agent.post('/api/customers').send(customer).expect(201);
    await agent.get(`/api/customers/${body.customer.id}/key-code`).expect(200);
    await agent.delete(`/api/customers/${body.customer.id}`).expect(204);

    const left = await pool.query('SELECT (SELECT count(*) FROM customers) AS c, (SELECT count(*) FROM key_code_views) AS v');
    expect(left.rows[0]).toEqual({ c: '0', v: '0' });
  });

  it('svarer 404 for en kunde, der ikke findes', async () => {
    const agent = await loginAs(app, chef);
    await agent.get('/api/customers/9999').expect(404);
  });
});
