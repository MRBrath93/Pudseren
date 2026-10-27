import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, currentStep, generateSecret, hotp, otpauthUrl, totp, verifyTotp } from '../src/lib/totp.js';

// Testværdier fra standarden RFC 6238, bilag B (SHA-1, hemmeligheden "12345678901234567890").
// Standarden bruger 8 cifre; de sidste 6 er de koder, appen viser.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('base32', () => {
  it('koder og afkoder som RFC 4648', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });

  it('afviser ugyldige tegn', () => {
    expect(() => base32Decode('ABC1')).toThrow();
  });
});

describe('TOTP', () => {
  it('giver de koder, standarden foreskriver', () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      expect(totp(RFC_SECRET, seconds * 1000)).toBe(expected);
    }
  });

  it('laver en ny hemmelighed på 160 bit hver gang', () => {
    const secret = generateSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateSecret()).not.toBe(secret);
  });

  it('godkender den aktuelle kode og fortæller hvilket tidsrum', () => {
    const time = 1_800_000_000_000;
    const code = totp(RFC_SECRET, time);
    expect(verifyTotp(RFC_SECRET, code, { timeMs: time })).toBe(currentStep(time));
  });

  it('accepterer et ur, der går 30 sekunder forkert', () => {
    const time = 1_800_000_000_000;
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, time - 30_000), { timeMs: time })).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, time + 30_000), { timeMs: time })).not.toBeNull();
  });

  it('afviser en kode, der er mere end et minut gammel', () => {
    const time = 1_800_000_000_000;
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, time - 90_000), { timeMs: time })).toBeNull();
  });

  it('afviser den samme kode anden gang (replay)', () => {
    const time = 1_800_000_000_000;
    const code = totp(RFC_SECRET, time);
    const step = verifyTotp(RFC_SECRET, code, { timeMs: time });
    expect(verifyTotp(RFC_SECRET, code, { timeMs: time, lastUsedStep: step })).toBeNull();
  });

  it('afviser koder, der ikke er 6 cifre', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', null]) {
      expect(verifyTotp(RFC_SECRET, code)).toBeNull();
    }
  });

  it('bruger HMAC-SHA1 som HOTP (RFC 4226)', () => {
    // RFC 4226, bilag D: tæller 0 og 1 med samme hemmelighed.
    const secret = Buffer.from('12345678901234567890');
    expect(hotp(secret, 0)).toBe('755224');
    expect(hotp(secret, 1)).toBe('287082');
  });

  it('laver en adresse, som authenticator-apps kan læse', () => {
    const url = otpauthUrl('ABCDEFGH', 'chef@test.dk');
    expect(url).toBe('otpauth://totp/Pudseren%3Achef%40test.dk?secret=ABCDEFGH&issuer=Pudseren&algorithm=SHA1&digits=6&period=30');
  });
});
