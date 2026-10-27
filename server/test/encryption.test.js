import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEncryption } from '../src/lib/encryption.js';

const key = crypto.randomBytes(32).toString('hex');

describe('kryptering af følsomme felter', () => {
  it('kan krypteres og dekrypteres igen', () => {
    const encryption = createEncryption(key);
    const stored = encryption.encrypt('JBSWY3DPEHPK3PXP');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(encryption.decrypt(stored)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('giver forskellig tekst hver gang, selv for samme værdi', () => {
    const encryption = createEncryption(key);
    expect(encryption.encrypt('4719')).not.toBe(encryption.encrypt('4719'));
  });

  it('afviser en ændret værdi', () => {
    const encryption = createEncryption(key);
    const [iv, tag] = encryption.encrypt('4719').split('.');
    expect(() => encryption.decrypt(`${iv}.${tag}.${Buffer.from('9999').toString('base64')}`)).toThrow();
  });

  it('kan ikke dekrypteres med en anden nøgle', () => {
    const stored = createEncryption(key).encrypt('4719');
    expect(() => createEncryption(crypto.randomBytes(32).toString('hex')).decrypt(stored)).toThrow();
  });

  it('nægter en for kort nøgle', () => {
    expect(() => createEncryption('abc')).toThrow();
  });
});
