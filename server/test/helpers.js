import crypto from 'node:crypto';
import request from 'supertest';
import { createEncryption } from '../src/lib/encryption.js';
import { hashPassword } from '../src/lib/password.js';
import { generateSecret, totp } from '../src/lib/totp.js';

// Fælles indstillinger til testene. Hemmelighederne er kun til test.
export const testConfig = {
  isProduction: false,
  sessionSecret: 'test-hemmelighed-der-er-mindst-32-tegn-lang',
  encryptionKey: crypto.randomBytes(32).toString('hex'),
};

export const TEST_PASSWORD = 'en lang test-adgangskode';

// Opretter en bruger direkte i databasen. Med twoFactor: true er to-faktor allerede slået til,
// og hemmeligheden returneres, så testen kan lave koder.
export async function createUser(pool, { name, email, role, twoFactor = false }) {
  const secret = twoFactor ? generateSecret() : null;
  const encrypted = twoFactor ? createEncryption(testConfig.encryptionKey).encrypt(secret) : null;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, totp_secret_enc, totp_enabled_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5::text IS NULL THEN NULL ELSE now() END)
     RETURNING id`,
    [name, email, await hashPassword(TEST_PASSWORD), role, encrypted],
  );
  return { id: rows[0].id, email, secret };
}

// Logger ind og klarer to-faktor, hvis brugeren har det. Returnerer en agent, der husker cookien.
export async function loginAs(app, user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  if (res.body.twoFactorRequired) {
    await agent.post('/api/auth/2fa/verify').send({ code: totp(user.secret) }).expect(200);
  }
  return agent;
}
