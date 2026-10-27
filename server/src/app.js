import express from 'express';

// Opretter selve Express-appen. Den er adskilt fra index.js,
// så testene senere kan bruge appen uden at starte en rigtig server.
export function createApp() {
  const app = express();

  // Gør det muligt at læse JSON i forespørgsler (req.body).
  app.use(express.json({ limit: '100kb' }));

  // Et simpelt tjek af, om serveren kører. Bruges også ved deployment.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  return app;
}
