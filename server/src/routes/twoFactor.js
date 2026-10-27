import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { generateRecoveryCodes, hashRecoveryCode } from '../lib/recoveryCodes.js';
import { generateSecret, otpauthUrl, verifyTotp } from '../lib/totp.js';

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Koden skal være 6 cifre.') });

function save(session) {
  return new Promise((resolve, reject) => session.save((err) => (err ? reject(err) : resolve())));
}

export function twoFactorRouter({ pool, encryption, codeLimit = 10 }) {
  const router = Router();
  router.use(requireAuth);

  // Højst 10 forsøg med en kode pr. 15 minutter, så ingen kan prøve alle én million muligheder.
  const codeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: codeLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'For mange forsøg. Prøv igen om lidt.' },
  });

  router.get('/status', async (req, res) => {
    const { rows } = await pool.query('SELECT totp_enabled_at FROM users WHERE id = $1', [req.session.user.id]);
    res.json({ enabled: Boolean(rows[0]?.totp_enabled_at) });
  });

  // Trin 1: lav en ny hemmelighed og vis den som QR-kode.
  // Hemmeligheden gemmes krypteret i sessionen, indtil brugeren har bevist, at appen virker.
  router.post('/setup', async (req, res) => {
    const { rows } = await pool.query('SELECT totp_enabled_at FROM users WHERE id = $1', [req.session.user.id]);
    if (rows[0]?.totp_enabled_at) {
      return res.status(409).json({ error: 'To-faktor er allerede slået til.' });
    }

    const secret = generateSecret();
    req.session.pendingTotpSecret = encryption.encrypt(secret);
    await save(req.session);

    const url = otpauthUrl(secret, req.session.user.email);
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
    // Hemmeligheden sendes også som tekst, så den kan skrives ind i appen, hvis QR-koden ikke kan scannes.
    res.set('Cache-Control', 'no-store');
    res.json({ qr, secret });
  });

  // Trin 2: brugeren skriver den første kode fra appen. Passer den, slås to-faktor til.
  router.post('/enable', codeLimiter, async (req, res) => {
    const { code } = codeSchema.parse(req.body);
    const pending = req.session.pendingTotpSecret;
    if (!pending) {
      return res.status(400).json({ error: 'Start opsætningen forfra.' });
    }

    const step = verifyTotp(encryption.decrypt(pending), code);
    if (step === null) {
      return res.status(400).json({ error: 'Koden passer ikke. Tjek at telefonens ur er rigtigt, og prøv den næste kode.' });
    }

    const recoveryCodes = generateRecoveryCodes();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET totp_secret_enc = $1, totp_enabled_at = now(), totp_last_step = $2 WHERE id = $3`,
        [pending, step, req.session.user.id],
      );
      await client.query('DELETE FROM recovery_codes WHERE user_id = $1', [req.session.user.id]);
      for (const recoveryCode of recoveryCodes) {
        await client.query('INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)', [
          req.session.user.id,
          hashRecoveryCode(recoveryCode),
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    delete req.session.pendingTotpSecret;
    req.session.user.twoFactor = true;
    await save(req.session);

    // Gendannelseskoderne vises kun denne ene gang. Bagefter findes de kun som hash.
    res.set('Cache-Control', 'no-store');
    res.json({ enabled: true, recoveryCodes });
  });

  return router;
}
