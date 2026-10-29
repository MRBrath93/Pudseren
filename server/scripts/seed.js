// Lægger opdigtede testkunder ind i udviklingsdatabasen (npm run db:seed).
// Alle navne er opdigtede. Vejene findes i Dronninglund og omegn, men husnumrene er tilfældige,
// og telefonnumrene starter med 10, som ikke bruges til almindelige numre i Danmark.
//
// Scriptet sletter ALLE kunder i databasen, før det lægger nye ind. Derfor kører det kun mod
// en database, hvis navn ender på _dev eller _test, og aldrig når NODE_ENV=production.
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/db.js';
import { createEncryption } from '../src/lib/encryption.js';

// dueIn = antal dage til kunden skal pudses næste gang. Negativ = over tid. null = aldrig pudset.
// Datoerne regnes ud fra dags dato, så listen ser realistisk ud, uanset hvornår scriptet køres.
const CUSTOMERS = [
  // 9330 Dronninglund
  { name: 'Karen Mølgaard', address: 'Stationsvej 14', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: -9, notes: 'Hund i haven. Luk lågen efter dig.' },
  { name: 'Ole Brix', address: 'Bytoften 7', postal: '9330', city: 'Dronninglund', weeks: 2, dueIn: -3 },
  { name: 'Hanne Vestergaard', address: 'Porsevej 22', postal: '9330', city: 'Dronninglund', weeks: 8, dueIn: -1, keyCode: '4711' },
  { name: 'Peter Damgaard', address: 'Idskovvej 5', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 0 },
  { name: 'Lone Sørensen', address: 'Otto Banners Vej 11', postal: '9330', city: 'Dronninglund', weeks: 6, dueIn: 2, notes: 'Kun udvendigt.' },
  { name: 'Mads Kirkegaard', address: 'Voergårdsvej 31', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 4 },
  { name: 'Birthe Thomsen', address: 'Agerstedvej 18', postal: '9330', city: 'Dronninglund', weeks: 12, dueIn: 6, notes: 'Vinterhaven på bagsiden skal med.' },
  { name: 'Jørgen Lauridsen', address: 'Præstbrogårdvej 3', postal: '9330', city: 'Dronninglund', weeks: 8, dueIn: 11, keyCode: '2580#' },
  { name: 'Susanne Holm', address: 'Thorup Hedevej 9', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 18 },
  { name: 'Niels Bach', address: 'Gl. Kirkvej 26', postal: '9330', city: 'Dronninglund', weeks: 6, dueIn: 25 },
  { name: 'Anja Riis', address: 'Voersåvej 40', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: null, notes: 'Ny kunde. Første pudsning.' },
  // 9320 Hjallerup
  { name: 'Henning Poulsen', address: 'Stadions Allé 6', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: -6 },
  { name: 'Mette Frandsen', address: 'Blichersvej 12', postal: '9320', city: 'Hjallerup', weeks: 2, dueIn: 1 },
  { name: 'Bent Iversen', address: 'Brorsonsvej 4', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 3, smsOptOut: true },
  { name: 'Tina Kjær', address: 'Christiansvej 19', postal: '9320', city: 'Hjallerup', weeks: 8, dueIn: 5, keyCode: '1966' },
  { name: 'Allan Søndergaard', address: 'Margrethevej 8', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 9 },
  { name: 'Gitte Nygaard', address: 'Sæbyvej 52', postal: '9320', city: 'Hjallerup', weeks: 6, dueIn: 13, notes: 'Ring 10 min. før. Arbejder hjemme.' },
  { name: 'Kurt Mortensen', address: 'Allerupvej 2', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 30 },
  { name: 'Rikke Andersen', address: 'Konstantinsvej 15', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: -2, status: 'opsigelse_anmodet' },
  // Klokkerholm (postnummer 9320 Hjallerup)
  { name: 'Erik Laursen', address: 'Hollenstedvej 12', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: -4 },
  { name: 'Inge Bjerregaard', address: 'Brøndlundvej 3', postal: '9320', city: 'Hjallerup', weeks: 8, dueIn: 1, notes: 'Høj stige til gavlvinduet.' },
  { name: 'Claus Winther', address: 'Ravnstrupvej 21', postal: '9320', city: 'Hjallerup', weeks: 6, dueIn: 8, keyCode: '0912' },
  { name: 'Dorthe Kristiansen', address: 'Lyngdrupvej 7', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 16 },
  // 9340 Asaa
  { name: 'Finn Madsen', address: 'Krogsvangvej 9', postal: '9340', city: 'Asaa', weeks: 4, dueIn: -1 },
  { name: 'Lis Jakobsen', address: 'Lundgårdsvej 4', postal: '9340', city: 'Asaa', weeks: 8, dueIn: 7, smsOptOut: true },
  // Flere kunder, så listerne ligner en rigtig hverdag
  { name: 'Poul Bertelsen', address: 'Stationsvej 33', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: -12, notes: 'Kunden har bedt om at blive ringet op, hvis vi er forsinket.' },
  { name: 'Grethe Nørgaard', address: 'Bytoften 21', postal: '9330', city: 'Dronninglund', weeks: 6, dueIn: -5 },
  { name: 'Jens Kragh', address: 'Porsevej 8', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 0, keyCode: '7300' },
  { name: 'Ulla Pedersen', address: 'Idskovhedevej 14', postal: '9330', city: 'Dronninglund', weeks: 8, dueIn: 1 },
  { name: 'Svend Aagaard', address: 'Otto Banners Vej 2', postal: '9330', city: 'Dronninglund', weeks: 2, dueIn: 3 },
  { name: 'Marianne Lund', address: 'Voergårdsvej 12', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 5, smsOptOut: true },
  { name: 'Torben Krogh', address: 'Præstbrogårdvej 19', postal: '9330', city: 'Dronninglund', weeks: 6, dueIn: 10 },
  { name: 'Kirsten Dahl', address: 'Thorup Hedevej 2', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 14, notes: 'Vinduerne i udestuen skal også med.' },
  { name: 'Leif Bruun', address: 'Gl. Kirkvej 8', postal: '9330', city: 'Dronninglund', weeks: 12, dueIn: 21 },
  { name: 'Annette Juhl', address: 'Agerstedvej 4', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 27 },
  { name: 'Morten Skov', address: 'Idskovvej 17', postal: '9330', city: 'Dronninglund', weeks: 6, dueIn: null },
  { name: 'Bodil Christensen', address: 'Voersåvej 12', postal: '9330', city: 'Dronninglund', weeks: 4, dueIn: 6, status: 'opsagt' },
  { name: 'Carsten Hviid', address: 'Richardsvej 5', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: -7 },
  { name: 'Lene Toft', address: 'Tylstrupvej 11', postal: '9320', city: 'Hjallerup', weeks: 8, dueIn: -2, keyCode: '3141' },
  { name: 'Frank Overgaard', address: 'Lembvej 6', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 2 },
  { name: 'Pia Svendsen', address: 'Blichersvej 27', postal: '9320', city: 'Hjallerup', weeks: 2, dueIn: 4 },
  { name: 'John Ravn', address: 'Christiansvej 3', postal: '9320', city: 'Hjallerup', weeks: 6, dueIn: 7, notes: 'Ingen adgang til baghaven om tirsdagen.' },
  { name: 'Hanne Brandt', address: 'Margrethevej 15', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 12 },
  { name: 'Ib Frederiksen', address: 'Stadions Allé 18', postal: '9320', city: 'Hjallerup', weeks: 8, dueIn: 19 },
  { name: 'Jette Clausen', address: 'Sæbyvej 71', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 24 },
  { name: 'Ove Kjeldsen', address: 'Hollenstedvej 4', postal: '9320', city: 'Hjallerup', weeks: 6, dueIn: -3 },
  { name: 'Lisbeth Mikkelsen', address: 'Ravnstrupvej 9', postal: '9320', city: 'Hjallerup', weeks: 4, dueIn: 3 },
  { name: 'Arne Vinther', address: 'Brøndlundvej 12', postal: '9320', city: 'Hjallerup', weeks: 8, dueIn: 15, keyCode: '5588' },
  { name: 'Else Bisgaard', address: 'Krogsvangvej 15', postal: '9340', city: 'Asaa', weeks: 4, dueIn: 0 },
  { name: 'Kaj Holst', address: 'Lundgårdsvej 10', postal: '9340', city: 'Asaa', weeks: 6, dueIn: 9 },
];

function assertSafeDatabase(databaseUrl) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:seed må ikke køre i produktion.');
  }
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith('_dev') && !databaseName.endsWith('_test')) {
    throw new Error(`db:seed kører kun mod en database, der ender på _dev eller _test (ikke "${databaseName}").`);
  }
}

export async function seed(pool, encryption) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // CASCADE fjerner også loggen over viste nøglekoder for de slettede kunder.
    await client.query('TRUNCATE customers RESTART IDENTITY CASCADE');

    for (let i = 0; i < CUSTOMERS.length; i++) {
      const c = CUSTOMERS[i];
      // Sidst pudset = i dag - interval + dage til næste pudsning.
      const daysAgo = c.dueIn === null ? null : c.weeks * 7 - c.dueIn;
      await client.query(
        `INSERT INTO customers
           (name, address, postal_code, city, phone, email, interval_weeks, last_cleaned_on,
            notes, key_code_enc, sms_opt_out, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 CASE WHEN $8::int IS NULL THEN NULL ELSE CURRENT_DATE - $8::int END,
                 $9, $10, $11, $12)`,
        [
          c.name,
          c.address,
          c.postal,
          c.city,
          `10 ${String(20 + i).padStart(2, '0')} 30 ${String(40 + i).padStart(2, '0')}`,
          `kunde${i + 1}@eksempel.dk`,
          c.weeks,
          daysAgo,
          c.notes ?? null,
          encryption.encrypt(c.keyCode),
          c.smsOptOut ?? false,
          c.status ?? 'aktiv',
        ],
      );
    }

    await client.query('COMMIT');
    return CUSTOMERS.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Køres filen direkte (npm run db:seed), og ikke importeret fra en test:
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSafeDatabase(process.env.DATABASE_URL);
  const pool = createPool(process.env.DATABASE_URL);
  try {
    const count = await seed(pool, createEncryption(process.env.ENCRYPTION_KEY));
    console.log(`Lagde ${count} opdigtede kunder ind.`);
  } finally {
    await pool.end();
  }
}
