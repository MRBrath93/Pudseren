import express from 'express';

// Opretter selve Express-appen. Den er adskilt fra index.js,
// så testene senere kan bruge appen uden at starte en rigtig server.
// Databasen (pool) sendes ind udefra, så testene kan bruge en testdatabase.
export function createApp({ pool }) {
  const app = express();

  // Gør det muligt at læse JSON i forespørgsler (req.body).
  app.use(express.json({ limit: '100kb' }));

  // Tjek af, om serveren kører og kan nå databasen. Bruges også ved deployment.
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, database: true });
    } catch {
      res.status(503).json({ ok: false, database: false });
    }
  });

  return app;
}
