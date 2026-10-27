import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from '../lib/password.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email()),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

// Bruges, når e-mailen ikke findes, så svaret tager lige så lang tid som ved en forkert
// adgangskode. Ellers kunne man måle sig frem til, hvilke e-mails der har en konto.
let dummyHash;
async function getDummyHash() {
  dummyHash ??= await hashPassword('ingen-bruger-har-denne-adgangskode');
  return dummyHash;
}

// Gør express-session's callback-funktioner til promises, så vi kan bruge await.
function regenerate(session) {
  return new Promise((resolve, reject) => session.regenerate((err) => (err ? reject(err) : resolve())));
}
function save(session) {
  return new Promise((resolve, reject) => session.save((err) => (err ? reject(err) : resolve())));
}

export function authRouter({ pool, loginLimit = 10 }) {
  const router = Router();

  // Højst 10 loginforsøg pr. 15 minutter pr. IP-adresse.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'For mange forsøg. Prøv igen om lidt.' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const { rows } = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    const valid = await verifyPassword(user ? user.password_hash : await getDummyHash(), password);

    // Det mest sandsynlige først: et korrekt login.
    if (user && valid) {
      // Nyt session-id efter login, så et gammelt id ikke kan genbruges (session fixation).
      await regenerate(req.session);
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      await save(req.session);
      return res.json({ user: req.session.user });
    }

    // Samme besked, uanset om e-mailen eller adgangskoden er forkert.
    res.status(401).json({ error: 'Forkert e-mail eller adgangskode.' });
  });

  router.post('/logout', (req, res, next) => {
    // Sessionen slettes i databasen, ikke kun i browseren.
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('pudseren.sid');
      res.status(204).end();
    });
  });

  router.get('/me', (req, res) => {
    if (req.session.user) return res.json({ user: req.session.user });
    res.status(401).json({ error: 'Ikke logget ind.' });
  });

  return router;
}
