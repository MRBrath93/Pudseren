// Samler alle indstillinger fra miljøvariablerne (.env) ét sted
// og stopper serveren med det samme, hvis noget vigtigt mangler.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Miljøvariablen ${name} mangler. Se server/.env.example`);
  }
  return value;
}

export function loadConfig() {
  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET skal være mindst 32 tegn.');
  }

  return {
    port: Number(process.env.PORT ?? 3000),
    isProduction: process.env.NODE_ENV === 'production',
    databaseUrl: required('DATABASE_URL'),
    sessionSecret,
  };
}
