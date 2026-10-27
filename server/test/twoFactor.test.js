// Integrationstest af opsætning af to-faktor mod testdatabasen.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { hashRecoveryCode } from '../src/lib/recoveryCodes.js';
import { totp } from '../src/lib/totp.js';
import { migrate } from '../scripts/migrate.js';
import { testConfig as config } from './helpers.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'en lang test-adgangskode';

describe.skipIf(!databaseUrl)('opsætning af to-faktor', () => {
  let pool;
  let app;

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    await migrate(pool);
    app = createApp({ pool, config, loginLimit: 1000, codeLimit: 1000, pruneSessions: false });
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE users, "session" RESTART IDENTITY CASCADE');
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Chef', 'chef@test.dk', $1, 'chef')`,
      [await hashPassword(PASSWORD)],
    );
  });

  async function loggedIn() {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD }).expect(200);
    return agent;
  }

  it('kræver login', async () => {
    await request(app).post('/api/auth/2fa/setup').send({}).expect(401);
  });

  it('viser en QR-kode og hemmeligheden', async () => {
    const agent = await loggedIn();
    const res = await agent.post('/api/auth/2fa/setup').send({}).expect(200);
    expect(res.body.qr.startsWith('data:image/png;base64,')).toBe(true);
    expect(res.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('gemmer ikke hemmeligheden i klar tekst i sessionen', async () => {
    const agent = await loggedIn();
    const { body } = await agent.post('/api/auth/2fa/setup').send({}).expect(200);
    const { rows } = await pool.query('SELECT sess FROM "session"');
    expect(JSON.stringify(rows[0].sess)).not.toContain(body.secret);
  });

  it('afviser en forkert kode', async () => {
    const agent = await loggedIn();
    await agent.post('/api/auth/2fa/setup').send({}).expect(200);
    const res = await agent.post('/api/auth/2fa/enable').send({ code: '000000' });
    expect(res.status).toBe(400);
    const status = await agent.get('/api/auth/2fa/status');
    expect(status.body.enabled).toBe(false);
  });

  it('slår to-faktor til med den rigtige kode og giver 8 gendannelseskoder', async () => {
    const agent = await loggedIn();
    const { body } = await agent.post('/api/auth/2fa/setup').send({}).expect(200);
    const res = await agent.post('/api/auth/2fa/enable').send({ code: totp(body.secret) }).expect(200);

    expect(res.body.recoveryCodes).toHaveLength(8);
    const status = await agent.get('/api/auth/2fa/status');
    expect(status.body.enabled).toBe(true);
  });

  it('gemmer hemmeligheden krypteret og gendannelseskoderne som hash', async () => {
    const agent = await loggedIn();
    const { body } = await agent.post('/api/auth/2fa/setup').send({}).expect(200);
    const res = await agent.post('/api/auth/2fa/enable').send({ code: totp(body.secret) }).expect(200);

    const user = await pool.query('SELECT totp_secret_enc FROM users WHERE id = 1');
    expect(user.rows[0].totp_secret_enc).not.toContain(body.secret);

    const codes = await pool.query('SELECT code_hash FROM recovery_codes WHERE user_id = 1');
    expect(codes.rowCount).toBe(8);
    const stored = JSON.stringify(codes.rows);
    expect(stored).not.toContain(res.body.recoveryCodes[0]);
    expect(stored).toContain(hashRecoveryCode(res.body.recoveryCodes[0]));
  });

  it('kan ikke sættes op igen, når den allerede er slået til', async () => {
    const agent = await loggedIn();
    const { body } = await agent.post('/api/auth/2fa/setup').send({}).expect(200);
    await agent.post('/api/auth/2fa/enable').send({ code: totp(body.secret) }).expect(200);
    await agent.post('/api/auth/2fa/setup').send({}).expect(409);
  });

  it('kræver at opsætningen er startet', async () => {
    const agent = await loggedIn();
    await agent.post('/api/auth/2fa/enable').send({ code: '123456' }).expect(400);
  });
});
