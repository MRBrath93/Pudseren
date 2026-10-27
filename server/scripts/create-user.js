// Opretter en bruger i databasen. Adgangskoden skrives skjult og gemmes kun som hash.
// Brug: npm run user:create
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createPool } from '../src/db.js';
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../src/lib/password.js';

const ROLES = ['medarbejder', 'chef'];

// Spørger om en adgangskode uden at vise den på skærmen.
// Terminalen sættes i "raw mode", så vi selv modtager hvert tastetryk og intet bliver vist.
function askHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    let value = '';
    const stop = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };

    function onData(chunk) {
      for (const char of chunk) {
        // Det mest sandsynlige først: et almindeligt tegn.
        if (char >= ' ' && char !== '\u007f') {
          value += char;
        } else if (char === '\r' || char === '\n') {
          stop();
          resolve(value);
          return;
        } else if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else if (char === '\u0003') {
          // Ctrl+C
          stop();
          process.exit(130);
        }
      }
    }

    stdin.on('data', onData);
  });
}

const rl = readline.createInterface({ input: stdin, output: stdout });
let rlClosed = false;
const pool = createPool(process.env.DATABASE_URL);

try {
  const name = (await rl.question('Navn: ')).trim();
  const email = (await rl.question('E-mail: ')).trim().toLowerCase();
  const role = (await rl.question(`Rolle (${ROLES.join('/')}): `)).trim();
  // readline lukkes, før vi selv læser tastetryk til adgangskoden.
  rl.close();
  rlClosed = true;
  const password = await askHidden(`Adgangskode (mindst ${MIN_PASSWORD_LENGTH} tegn, vises ikke): `);
  const repeat = await askHidden('Gentag adgangskode: ');

  // Det mest sandsynlige er, at alt er udfyldt korrekt, men vi tjekker alt, før noget gemmes.
  if (!name || !email.includes('@')) throw new Error('Navn og en gyldig e-mail skal udfyldes.');
  if (!ROLES.includes(role)) throw new Error(`Rollen skal være ${ROLES.join(' eller ')}.`);
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Adgangskoden skal være mindst ${MIN_PASSWORD_LENGTH} tegn.`);
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error(`Adgangskoden må højst være ${MAX_PASSWORD_LENGTH} tegn.`);
  if (password !== repeat) throw new Error('De to adgangskoder er ikke ens.');

  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, email, passwordHash, role],
  );
  console.log(`Brugeren er oprettet med id ${rows[0].id}.`);
} catch (error) {
  // 23505 = unique_violation: e-mailen findes allerede.
  const message = error.code === '23505' ? 'Der findes allerede en bruger med den e-mail.' : error.message;
  console.error(`Fejl: ${message}`);
  process.exitCode = 1;
} finally {
  if (!rlClosed) rl.close();
  await pool.end();
}
