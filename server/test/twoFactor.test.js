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

describe.skipIf(!databaseUrl)('login med to-faktor', () => {
  let pool;
  let app;
  let secret;
  let recoveryCodes;

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    await migrate(pool);
    app = createApp({ pool, config, loginLimit: 1000, codeLimit: 1000, pruneSessions: false });
  });

  afterAll(async () => {
    await pool?.end();
  });

  // Hver test starter med en chef, der allerede har slået to-faktor til.
  beforeEach(async () => {
    await pool.query('TRUNCATE users, "session" RESTART IDENTITY CASCADE');
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Chef', 'chef@test.dk', $1, 'chef')`,
      [await hashPassword(PASSWORD)],
    );
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD }).expect(200);
    const setup = await agent.post('/api/auth/2fa/setup').send({}).expect(200);
    secret = setup.body.secret;
    const enable = await agent.post('/api/auth/2fa/enable').send({ code: totp(secret) }).expect(200);
    recoveryCodes = enable.body.recoveryCodes;
    // Glem det tidsrum, opsætningen brugte, så testene kan bruge den aktuelle kode.
    await pool.query('UPDATE users SET totp_last_step = NULL');
    await pool.query('TRUNCATE "session"');
  });

  async function firstStep() {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email: 'chef@test.dk', password: PASSWORD }).expect(200);
    expect(res.body).toEqual({ twoFactorRequired: true });
    return agent;
  }

  it('logger ikke ind på adgangskoden alene', async () => {
    const agent = await firstStep();
    await agent.get('/api/auth/me').expect(401);
  });

  it('logger ind med adgangskode og kode fra appen', async () => {
    const agent = await firstStep();
    const res = await agent.post('/api/auth/2fa/verify').send({ code: totp(secret) }).expect(200);
    expect(res.body.user.twoFactor).toBe(true);
    await agent.get('/api/auth/me').expect(200);
  });

  it('afviser en forkert kode', async () => {
    const agent = await firstStep();
    await agent.post('/api/auth/2fa/verify').send({ code: '000000' }).expect(400);
    await agent.get('/api/auth/me').expect(401);
  });

  it('afviser den samme kode anden gang (replay)', async () => {
    const code = totp(secret);
    const first = await firstStep();
    await first.post('/api/auth/2fa/verify').send({ code }).expect(200);
    const second = await firstStep();
    await second.post('/api/auth/2fa/verify').send({ code }).expect(400);
  });

  it('kræver adgangskoden først', async () => {
    await request(app).post('/api/auth/2fa/verify').send({ code: totp(secret) }).expect(401);
  });

  it('kan bruge en gendannelseskode – men kun én gang', async () => {
    const first = await firstStep();
    const res = await first.post('/api/auth/2fa/verify').send({ recoveryCode: recoveryCodes[0] }).expect(200);
    expect(res.body.usedRecoveryCode).toBe(true);

    const second = await firstStep();
    await second.post('/api/auth/2fa/verify').send({ recoveryCode: recoveryCodes[0] }).expect(400);
  });

  it('accepterer gendannelseskoden uden bindestreg og med store bogstaver', async () => {
    const agent = await firstStep();
    const typed = recoveryCodes[1].replace('-', '').toUpperCase();
    await agent.post('/api/auth/2fa/verify').send({ recoveryCode: typed }).expect(200);
  });
});
