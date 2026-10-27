// Kører SQL-filerne i server/migrations i rækkefølge (001, 002, …).
// Hver fil køres kun én gang. Hvilke der er kørt, står i tabellen schema_migrations.
// Hver fil køres i en transaktion: fejler noget, bliver intet af filen gemt.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/db.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const ran = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migrationen ${file} fejlede: ${error.message}`);
    } finally {
      client.release();
    }
  }

  return ran;
}

// Køres filen direkte (npm run db:migrate), og ikke importeret fra en test:
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(process.env.DATABASE_URL);
  try {
    const ran = await migrate(pool);
    console.log(ran.length ? `Kørte: ${ran.join(', ')}` : 'Databasen er allerede opdateret.');
  } finally {
    await pool.end();
  }
}
