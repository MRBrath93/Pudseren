import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from '../lib/password.js';
import { hashRecoveryCode } from '../lib/recoveryCodes.js';
import { verifyTotp } from '../lib/totp.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email()),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

// Andet trin: enten en 6-cifret kode fra appen eller en gendannelseskode.
const verifySchema = z.union([
  z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Koden skal være 6 cifre.') }),
  z.object({ recoveryCode: z.string().trim().min(10).max(20) }),
]);

// Brugeren har 5 minutter fra adgangskoden er godkendt til at skrive koden.
const TWO_FACTOR_WINDOW_MS = 5 * 60 * 1000;

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

// Logger brugeren helt ind. Nyt session-id, så et gammelt id ikke kan genbruges (session fixation).
async function startSession(req, user) {
  await regenerate(req.session);
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    twoFactor: Boolean(user.totp_enabled_at),
  };
  await save(req.session);
}

function limiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'For mange forsøg. Prøv igen om lidt.' },
  });
}

export function authRouter({ pool, encryption, loginLimit = 10, codeLimit = 10 }) {
  const router = Router();

  // Højst 10 forsøg pr. 15 minutter pr. IP-adresse, for både adgangskode og kode.
  const loginLimiter = limiter(loginLimit);
  const codeLimiter = limiter(codeLimit);

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const { rows } = await pool.query(
      'SELECT id, name, email, role, password_hash, totp_enabled_at FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    const valid = await verifyPassword(user ? user.password_hash : await getDummyHash(), password);

    if (!user || !valid) {
      // Samme besked, uanset om e-mailen eller adgangskoden er forkert.
      return res.status(401).json({ error: 'Forkert e-mail eller adgangskode.' });
    }

    // Det mest sandsynlige for en medarbejder: ingen to-faktor, så logges han ind med det samme.
    if (!user.totp_enabled_at) {
      await startSession(req, user);
      return res.json({ user: req.session.user });
    }

    // Med to-faktor er adgangskoden kun første trin. Brugeren er ikke logget ind endnu.
    await regenerate(req.session);
    req.session.pendingTwoFactor = { userId: user.id, startedAt: Date.now() };
    await save(req.session);
    res.json({ twoFactorRequired: true });
  });

  // Andet trin af login: koden fra appen eller en gendannelseskode.
  router.post('/2fa/verify', codeLimiter, async (req, res) => {
    const pending = req.session.pendingTwoFactor;
    if (!pending || Date.now() - pending.startedAt > TWO_FACTOR_WINDOW_MS) {
      delete req.session.pendingTwoFactor;
      return res.status(401).json({ error: 'Log ind med din adgangskode igen.' });
    }

    const input = verifySchema.parse(req.body);
    const { rows } = await pool.query(
      'SELECT id, name, email, role, totp_secret_enc, totp_enabled_at, totp_last_step FROM users WHERE id = $1',
      [pending.userId],
    );
    const user = rows[0];
    if (!user?.totp_enabled_at) {
      return res.status(401).json({ error: 'Log ind med din adgangskode igen.' });
    }

    // Det mest sandsynlige først: en kode fra appen.
    if ('code' in input) {
      const lastUsedStep = user.totp_last_step === null ? null : Number(user.totp_last_step);
      const step = verifyTotp(encryption.decrypt(user.totp_secret_enc), input.code, { lastUsedStep });
      // Tidsrummet gemmes kun, hvis det er nyere end det sidste. Så kan to samtidige forsøg
      // med samme kode ikke begge lykkes.
      const used = step === null
        ? { rowCount: 0 }
        : await pool.query(
            `UPDATE users SET totp_last_step = $1
             WHERE id = $2 AND (totp_last_step IS NULL OR totp_last_step < $1)`,
            [step, user.id],
          );
      if (used.rowCount === 1) {
        await startSession(req, user);
        return res.json({ user: req.session.user });
      }
      return res.status(400).json({ error: 'Koden passer ikke.' });
    }

    // Gendannelseskode: hver kode kan kun bruges én gang.
    const { rowCount } = await pool.query(
      `UPDATE recovery_codes SET used_at = now()
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
      [user.id, hashRecoveryCode(input.recoveryCode)],
    );
    if (rowCount === 1) {
      await startSession(req, user);
      return res.json({ user: req.session.user, usedRecoveryCode: true });
    }
    res.status(400).json({ error: 'Gendannelseskoden passer ikke eller er brugt.' });
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
