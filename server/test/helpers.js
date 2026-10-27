import crypto from 'node:crypto';

// Fælles indstillinger til testene. Hemmelighederne er kun til test.
export const testConfig = {
  isProduction: false,
  sessionSecret: 'test-hemmelighed-der-er-mindst-32-tegn-lang',
  encryptionKey: crypto.randomBytes(32).toString('hex'),
};
