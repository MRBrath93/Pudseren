import crypto from 'node:crypto';

// To-faktor med tidsbaserede engangskoder (TOTP, RFC 6238), som Google Authenticator,
// Microsoft Authenticator og 1Password bruger. Skrevet med Nodes indbyggede crypto,
// så vi ikke er afhængige af en ekstern pakke for den sikkerhedskritiske del.
//
// Princip: server og telefon deler en hemmelighed. Begge beregner en 6-cifret kode ud fra
// hemmeligheden og det aktuelle 30-sekunders tidsrum. Passer koderne, har brugeren telefonen.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Hemmeligheden vises og deles som base32 (RFC 4648), som authenticator-apps forventer.
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text) {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Ugyldigt tegn i base32.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// 20 tilfældige bytes = 160 bit, den længde RFC 4226 anbefaler.
export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// HOTP (RFC 4226): koden for et bestemt tæller-tal.
export function hotp(secretBuffer, counter, digits = DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(message).digest();

  // "Dynamic truncation": de sidste 4 bit vælger, hvor i HMAC'en de 4 bytes hentes.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const number =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(number % 10 ** digits).padStart(digits, '0');
}

export function currentStep(timeMs = Date.now()) {
  return Math.floor(timeMs / 1000 / STEP_SECONDS);
}

export function totp(secretBase32, timeMs = Date.now()) {
  return hotp(base32Decode(secretBase32), currentStep(timeMs));
}

// Tjekker en kode. Telefonens ur kan gå lidt forkert, så vi accepterer også tidsrummet
// lige før og lige efter. Det aktuelle tjekkes først, fordi det er det mest sandsynlige.
// Returnerer det tidsrum, koden passede til, eller null.
// lastUsedStep forhindrer, at den samme kode kan bruges to gange (replay).
export function verifyTotp(secretBase32, code, { timeMs = Date.now(), lastUsedStep = null } = {}) {
  if (!/^\d{6}$/.test(code ?? '')) return null;

  const secret = base32Decode(secretBase32);
  const now = currentStep(timeMs);
  const given = Buffer.from(code);

  for (const step of [now, now - 1, now + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    // Sammenligning i konstant tid, så svartiden ikke afslører, hvor mange cifre der passede.
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, step)), given)) return step;
  }
  return null;
}

// Adressen, som QR-koden indeholder. Appen læser navn, konto og hemmelighed herfra.
export function otpauthUrl(secretBase32, accountName, issuer = 'Pudseren') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}
