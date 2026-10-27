import crypto from 'node:crypto';

// Krypterer følsomme felter, før de gemmes i databasen: to-faktor-hemmeligheder og senere nøglekoder.
// AES-256-GCM giver både hemmeligholdelse og integritet: en ændret værdi kan ikke dekrypteres.
// Gemt format: base64(iv).base64(authTag).base64(ciphertext)

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // anbefalet længde for GCM

export function createEncryption(keyHex) {
  if (!/^[0-9a-f]{64}$/i.test(keyHex ?? '')) {
    throw new Error('Krypteringsnøglen skal være 64 hex-tegn (32 bytes).');
  }
  const key = Buffer.from(keyHex, 'hex');

  return {
    encrypt(plainText) {
      if (plainText == null || plainText === '') return null;
      // Ny tilfældig IV hver gang, så samme værdi aldrig giver samme krypterede tekst.
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
    },

    decrypt(stored) {
      if (!stored) return null;
      const [iv, tag, encrypted] = stored.split('.');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}
