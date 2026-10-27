import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { requireJson } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { twoFactorRouter } from './routes/twoFactor.js';
import { createEncryption } from './lib/encryption.js';

// Opretter selve Express-appen. Den er adskilt fra index.js,
// så testene kan bruge appen uden at starte en rigtig server.
// Database (pool) og indstillinger (config) sendes ind udefra, så testene kan bruge en testdatabase.
export function createApp({ pool, config, loginLimit, codeLimit, pruneSessions = true }) {
  const app = express();
  const encryption = createEncryption(config.encryptionKey);
  const PgStore = connectPgSimple(session);

  if (config.isProduction) {
    // Bag Nginx: stol på den første proxy, så Secure-cookies og IP-adresser virker.
    app.set('trust proxy', 1);
  }

  // Sikkerheds-headers. Fjerner bl.a. X-Powered-By, forhindrer at siden vises i en ramme
  // på en fremmed side (clickjacking) og begrænser, hvilke scripts browseren må køre (CSP).
  // HTTPS-tvang (HSTS) slås kun til i produktion, så localhost virker over http.
  app.use(
    helmet({
      strictTransportSecurity: config.isProduction,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: config.isProduction ? [] : null },
      },
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(
    session({
      name: 'pudseren.sid',
      store: new PgStore({ pool, tableName: 'session', pruneSessionInterval: pruneSessions ? 15 * 60 : false }),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true, // JavaScript i browseren kan ikke læse cookien (beskytter mod XSS)
        sameSite: 'strict', // sendes ikke med fra andre hjemmesider (beskytter mod CSRF)
        secure: config.isProduction, // kun over HTTPS i produktion
        maxAge: 12 * 60 * 60 * 1000, // 12 timer – en arbejdsdag
      },
    }),
  );

  app.use('/api', requireJson);

  // Tjek af, om serveren kører og kan nå databasen. Bruges også ved deployment.
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, database: true });
    } catch {
      res.status(503).json({ ok: false, database: false });
    }
  });

  // Rækkefølgen betyder noget: /api/auth/2fa/verify skal nås uden at være logget ind,
  // så auth-routeren skal før to-faktor-routeren, der kræver login.
  app.use('/api/auth', authRouter({ pool, encryption, loginLimit, codeLimit }));
  app.use('/api/auth/2fa', twoFactorRouter({ pool, encryption, codeLimit }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Findes ikke.' });
  });

  // Fejl: valideringsfejl bliver til 400, alt andet til en generel 500 uden tekniske detaljer.
  app.use((error, req, res, next) => {
    if (error instanceof ZodError) {
      const fields = [];
      for (const issue of error.issues) {
        fields.push({ field: issue.path.join('.'), message: issue.message });
      }
      return res.status(400).json({ error: 'Ugyldige oplysninger.', fields });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Ugyldig JSON.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Der skete en fejl på serveren.' });
  });

  return app;
}
