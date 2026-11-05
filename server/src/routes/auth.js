// Login: ruterne til login med adgangskode, to-faktor, log ud og "hvem er jeg".
//
// Forløbet:
//   TRIN 1  POST /login       E-mail og adgangskode tjekkes.
//             ├─ 1A Uden to-faktor (medarbejderen) → logges ind med det samme. Færdig.
//             └─ 1B Med to-faktor (chefen)         → skal sende en kode. Fortsætter i TRIN 2.
//   TRIN 2  POST /2fa/verify  Chefens kode tjekkes.
//             ├─ 2A Kode fra appen   → logges ind.
//             └─ 2B Gendannelseskode → logges ind (hver kode kan kun bruges én gang).
//   Efter login: GET /me ("hvem er jeg?") og POST /logout.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from '../lib/password.js';
import { hashRecoveryCode } from '../lib/recoveryCodes.js';
import { verifyTotp } from '../lib/totp.js';

// Regler for det, der sendes ved login. Input tjekkes, før databasen bliver spurgt. E-mailen renses for mellemrum og store bogstaver, så den altid findes på samme måde. Der tjekkes også, at det er en gyldig e-mail. Adgangskoden har en øvre grænse, fordi argon2 er langsom, og en meget lang adgangskode ellers kunne bruges til at overbelaste serveren.
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email()),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

// Regler for TRIN 2: chefen sender enten den 6-cifrede kode fra appen eller en gendannelseskode, hvis telefonen er væk. Formatet tjekkes, før koden sammenlignes, så åbenlyst forkerte koder afvises med det samme. 
const verifySchema = z.union([
  z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Koden skal være 6 cifre.') }),
  z.object({ recoveryCode: z.string().trim().min(10).max(20) }),
]);

// Chefen har 5 minutter fra adgangskoden er godkendt til at skrive koden.
const TWO_FACTOR_WINDOW_MS = 5 * 60 * 1000;

// Bruges, når e-mailen ikke findes, så svaret tager lige så lang tid som ved en forkert adgangskode. Ellers kunne man måle sig frem til, hvilke e-mails der har en konto.
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

// Logger brugeren helt ind. Først får sessionen et nyt id, så et id, en angriber har plantet på forhånd, ikke virker (session fixation). Derefter gemmes det på serveren, hvem brugeren er, og hvilken rolle de har. Browseren får kun et id i cookien og brugeren kan derfor ikke selv ændre sin rolle.
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

// Begrænser antallet af forsøg pr. IP-adresse, så en angriber ikke kan gætte sig frem til adgangskoder eller koder. Tiden er sat til 15 minutter, så en angriber ikke kan prøve tusindvis af kombinationer på kort tid.
function limiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    // Send RateLimit-headers, så klienten kan se, hvor mange forsøg der er tilbage.
    standardHeaders: true,
    // Slå de gamle X-RateLimit-headers fra, da de ikke længere anbefales.
    legacyHeaders: false,
    message: { error: 'For mange forsøg. Prøv igen om lidt.' },
  });
}

// Opsætter ruter til login, to-faktor-verifikation, logout og at hente oplysninger om den loggede bruger. Login og to-faktor-verifikation er begrænset til et vist antal forsøg pr. IP-adresse. Pool bruges til at spørge databasen, encryption bruges til at dekryptere to-faktor-hemmeligheden, og loginLimit og codeLimit er antallet af forsøg pr. IP-adresse.
export function authRouter({ pool, encryption, loginLimit = 10, codeLimit = 10 }) {
  const router = Router();

  // Højst 10 forsøg pr. 15 minutter pr. IP-adresse, for både adgangskode og kode.
  const loginLimiter = limiter(loginLimit);
  const codeLimiter = limiter(codeLimit);


  // ════════ TRIN 1: E-mail og adgangskode (chefen og medarbejderne) ════════
  // Er de korrekte, logges medarbejderen ind med det samme (1A), mens chefen skal videre til TRIN 2 med en kode (1B).
  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    // Find brugeren med e-mailen.
    const { rows } = await pool.query(
      'SELECT id, name, email, role, password_hash, totp_enabled_at FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    // Tjek adgangskoden. Findes e-mailen ikke, tjekkes der mod en dummy-hash, så svaret tager lige så lang tid som ved en forkert adgangskode.
    const valid = await verifyPassword(user ? user.password_hash : await getDummyHash(), password);

    if (!user || !valid) {
      // Samme besked, uanset om e-mailen eller adgangskoden er forkert.
      return res.status(401).json({ error: 'Forkert e-mail eller adgangskode.' });
    }

    // ── 1A: Uden to-faktor (medarbejderen) → logges ind nu. Færdig. ──
    // Det mest sandsynlige tilfælde står først. En medarbejder kan vælge to-faktor til og går så vej 1B.
    if (!user.totp_enabled_at) {
      await startSession(req, user);
      return res.json({ user: req.session.user });
    }

    // ── 1B: Med to-faktor (chefen) → ikke logget ind endnu. Fortsætter i TRIN 2. ──
    // Sessionen husker kun, hvem der har klaret adgangskoden, og hvornår.
    await regenerate(req.session);
    req.session.pendingTwoFactor = { userId: user.id, startedAt: Date.now() };
    await save(req.session);
    res.json({ twoFactorRequired: true });
  });


  // ════════ TRIN 2: Kode (chefen, og medarbejdere der har valgt to-faktor) ════════
  // Chefen sender koden fra appen (2A) eller en gendannelseskode, hvis telefonen er væk (2B). Passer koden, logges han ind.
  router.post('/2fa/verify', codeLimiter, async (req, res) => {
    const pending = req.session.pendingTwoFactor;

    // Har chefen ikke klaret TRIN 1, eller er det mere end 5 minutter siden, skal han starte forfra med adgangskoden.
    if (!pending || Date.now() - pending.startedAt > TWO_FACTOR_WINDOW_MS) {
      delete req.session.pendingTwoFactor;
      return res.status(401).json({ error: 'Log ind med din adgangskode igen.' });
    }

    // Tjekker, at input er korrekt formateret, før databasen bliver spurgt. Det forhindrer åbenlyst forkerte koder i at blive sammenlignet med de rigtige.
    const input = verifySchema.parse(req.body);

    // Hent chefen, der klarede TRIN 1.
    const { rows } = await pool.query(
      'SELECT id, name, email, role, totp_secret_enc, totp_enabled_at, totp_last_step FROM users WHERE id = $1',
      [pending.userId],
    );
    const user = rows[0];
    // Sikkerhedsnet: er brugeren slettet, eller er to-faktor slået fra i minutterne siden TRIN 1, er der intet at tjekke koden imod. Så skal han starte forfra.
    if (!user?.totp_enabled_at) {
      return res.status(401).json({ error: 'Log ind med din adgangskode igen.' });
    }

    // ── 2A: Kode fra appen ──
    // Appen på chefens telefon og serveren kender den samme hemmelighed og laver hver 30. sekund en ny kode ud fra hemmeligheden og klokken. Hvert 30-sekunders vindue har et nummer.
    if ('code' in input) {
      // a) Hvilket vindue blev sidst brugt? (fx nr. 999, eller tomt hvis aldrig)
      const lastUsedStep = user.totp_last_step === null ? null : Number(user.totp_last_step);

      // b) Passer koden, og hører den til et nyere vindue end det sidst brugte? Hemmeligheden dekrypteres, og verifyTotp regner ud, hvilken kode appen viser lige nu. Passer den, får vi vinduets nummer (fx 1000). Ellers får vi null.
      const step = verifyTotp(encryption.decrypt(user.totp_secret_enc), input.code, { lastUsedStep });
      if (step === null) {
        return res.status(400).json({ error: 'Koden passer ikke.' });
      }

      // c) "Klip billetten": gem vinduets nummer, så koden ikke kan bruges igen. Der gemmes kun, hvis det gemte nummer er mindre. Sender to personer den samme kode på samme tid, kan kun den ene nå det, og den anden bliver afvist (beskytter mod replay).
      const { rowCount } = await pool.query(
        `UPDATE users SET totp_last_step = $1
         WHERE id = $2 AND (totp_last_step IS NULL OR totp_last_step < $1)`,
        [step, user.id],
      );
      if (rowCount === 0) {
        return res.status(400).json({ error: 'Koden passer ikke.' });
      }

      // d) Koden er godkendt, så chefen logges helt ind.
      await startSession(req, user);
      return res.json({ user: req.session.user });
    }


    // ── 2B: Gendannelseskode, hvis chefen har mistet telefonen ──
    // Koderne blev vist én gang ved opsætningen og er kun gemt som hash i databasen.

    // a) og b) i én forespørgsel: lav den indtastede kode om til en hash, find en ubrugt kode hos brugeren med samme hash, og marker den som brugt med det samme. "used_at IS NULL" betyder, at en kode, der allerede er brugt, ikke bliver fundet.
    const { rowCount } = await pool.query(
      `UPDATE recovery_codes SET used_at = now()
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
      [user.id, hashRecoveryCode(input.recoveryCode)],
    );

    // c) Blev en kode markeret som brugt, passede den. Chefen logges ind, og brugerfladen får besked om, at en gendannelseskode er brugt, så den kan minde ham om at sætte to-faktor op på en ny telefon.
    if (rowCount === 1) {
      await startSession(req, user);
      return res.json({ user: req.session.user, usedRecoveryCode: true });
    }

    // Ingen kode blev fundet: enten er den forkert, eller den er brugt før.
    res.status(400).json({ error: 'Gendannelseskoden passer ikke eller er brugt.' });
  });



  // ════════ Efter login (chefen og medarbejderne) ════════
  // Log ud: sessionen slettes i databasen og ikke kun i browseren.
  // Har nogen stjålet cookien, virker den ikke længere, fordi den ikke peger på noget.
  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      // Gik det galt at slette sessionen, sendes fejlen videre til den fælles fejlhåndtering i app.js.
      if (err) return next(err);
      // Fjern cookien fra browseren.
      res.clearCookie('pudseren.sid');
      // 204 betyder "det lykkedes, men der er ikke noget at sende tilbage".
      res.status(204).end();
    });
  });

  // "Hvem er jeg?": brugerfladen spørger her, når siden åbnes, for at vide, om brugeren allerede er logget ind (fx efter en genindlæsning af siden).
  router.get('/me', (req, res) => {
    if (req.session.user) return res.json({ user: req.session.user });
    res.status(401).json({ error: 'Ikke logget ind.' });
  });

  // Giv de færdige ruter tilbage til app.js, som sætter dem på /api/auth.
  return router;
}
