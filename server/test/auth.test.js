// Integrationstest af login mod den rigtige testdatabase (pudseren_test).
// Kræver TEST_DATABASE_URL i server/.env og at SSH-tunnelen kører. Ellers springes de over.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { migrate } from '../scripts/migrate.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const config = { isProduction: false, sessionSecret: 'test-hemmelighed-der-er-mindst-32-tegn-lang' };
const PASSWORD = 'en lang test-adgangskode';

describe.skipIf(!databaseUrl)('login', () => {
  let pool;
  let app;

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    await migrate(pool);
    app = createApp({ pool, config, loginLimit: 1000, pruneSessions: false });
  });

  afterAll(async () => {
    await pool?.end();
  });

  // Hver test starter med en tom database og to kendte brugere.
  beforeEach(async () => {
    await pool.query('TRUNCATE users, "session" RESTART IDENTITY CASCADE');
    const hash = await hashPassword(PASSWORD);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES
         ('Chef', 'chef@test.dk', $1, 'chef'),
         ('Lars', 'lars@test.dk', $1, 'medarbejder')`,
      [hash],
    );
  });

  it('logger ind med rigtig e-mail og adgangskode', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 1, name: 'Chef', email: 'chef@test.dk', role: 'chef' });
  });

  it('sender aldrig hashen med i svaret', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD });
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });

  it('er ligeglad med store bogstaver og mellemrum i e-mailen', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: '  Chef@Test.dk ', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('afviser en forkert adgangskode', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'chef@test.dk', password: 'forkert' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Forkert e-mail eller adgangskode.');
  });

  it('giver samme svar, når e-mailen ikke findes', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ukendt@test.dk', password: 'forkert' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Forkert e-mail eller adgangskode.');
  });

  it('afviser ugyldige oplysninger', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ikke-en-email', password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('afviser forespørgsler, der ikke er JSON (CSRF)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`email=chef@test.dk&password=${PASSWORD}`);
    expect(res.status).toBe(415);
  });

  it('sætter en sikker cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^pudseren\.sid=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
  });

  it('gemmer sessionen i databasen og husker brugeren', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'lars@test.dk', password: PASSWORD }).expect(200);

    const { rowCount } = await pool.query('SELECT 1 FROM "session"');
    expect(rowCount).toBe(1);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.role).toBe('medarbejder');
  });

  it('sletter sessionen i databasen ved log ud', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD }).expect(200);
    await agent.post('/api/auth/logout').send({}).expect(204);

    const { rowCount } = await pool.query('SELECT 1 FROM "session"');
    expect(rowCount).toBe(0);
    await agent.get('/api/auth/me').expect(401);
  });

  it('stopper efter for mange forsøg', async () => {
    const limited = createApp({ pool, config, loginLimit: 3, pruneSessions: false });
    for (let i = 0; i < 3; i++) {
      await request(limited).post('/api/auth/login').send({ email: 'chef@test.dk', password: 'forkert' });
    }
    const res = await request(limited).post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD });
    expect(res.status).toBe(429);
  });
});
