import crypto from 'node:crypto';

// Gendannelseskoder bruges, hvis chefen mister telefonen med authenticator-appen.
// Alfabetet udelader tegn, der let forveksles (0/o, 1/l/i), så koderne er lette at skrive af.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10; // 31^10 ≈ 2^49 muligheder
export const RECOVERY_CODE_COUNT = 8;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  // Vises som "abcde-fghjk", så den er lettere at læse.
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const codes = [];
  for (let i = 0; i < count; i++) codes.push(randomCode());
  return codes;
}

// Koderne er lange og tilfældige, så de kan ikke gættes eller slås op i en ordbog.
// Derfor er SHA-256 nok her. Den langsomme argon2 er kun nødvendig for adgangskoder,
// som mennesker selv vælger og derfor kan gættes.
export function hashRecoveryCode(code) {
  const normalized = String(code).toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
