import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('adgangskoder', () => {
  it('gemmer aldrig adgangskoden i klar tekst', async () => {
    const hash = await hashPassword('en lang test-adgangskode');
    expect(hash).not.toContain('en lang test-adgangskode');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('godkender den rigtige adgangskode', async () => {
    const hash = await hashPassword('en lang test-adgangskode');
    expect(await verifyPassword(hash, 'en lang test-adgangskode')).toBe(true);
  });

  it('afviser en forkert adgangskode', async () => {
    const hash = await hashPassword('en lang test-adgangskode');
    expect(await verifyPassword(hash, 'En lang test-adgangskode')).toBe(false);
  });

  it('giver forskellige hashes for samme adgangskode (salt)', async () => {
    const first = await hashPassword('samme adgangskode');
    const second = await hashPassword('samme adgangskode');
    expect(first).not.toBe(second);
  });
});
