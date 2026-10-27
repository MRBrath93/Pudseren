import pg from 'pg';

// PostgreSQL returnerer "date" som tekst (ÅÅÅÅ-MM-DD) i stedet for et Date-objekt,
// så der ikke opstår tidszonefejl, når en dato sendes videre til klienten.
pg.types.setTypeParser(1082, (value) => value);

// En pool genbruger et lille antal forbindelser i stedet for at åbne en ny ved hver forespørgsel.
export function createPool(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL mangler. Se server/.env.example');
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    // Giv op efter 5 sekunder i stedet for at vente for evigt, hvis databasen ikke kan nås.
    connectionTimeoutMillis: 5000,
  });

  // Hvis en forbindelse, der ikke er i brug, bliver afbrudt (fx databasen genstarter
  // eller SSH-tunnelen lukker), sender pg en fejl. Uden denne lytter går hele serveren ned.
  // Poolen kasserer selv den døde forbindelse og åbner en ny ved næste forespørgsel.
  pool.on('error', (error) => {
    console.error('Databaseforbindelse afbrudt:', error.message);
  });

  return pool;
}
