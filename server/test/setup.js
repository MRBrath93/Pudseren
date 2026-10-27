// Indlæser server/.env, så TEST_DATABASE_URL er tilgængelig i testene.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // Ingen .env: tests, der kræver databasen, springes over.
}
