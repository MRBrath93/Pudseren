import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';

// Tom tekst gemmes som null, så "intet telefonnummer" altid ser ens ud i databasen.
const optionalText = (max) =>
  z.string().trim().max(max).transform((value) => (value === '' ? null : value)).nullable().optional();

const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(200),
  postal_code: z.string().trim().regex(/^\d{4}$/, 'Postnummer skal være 4 cifre.'),
  city: z.string().trim().min(1).max(100),
  phone: optionalText(30),
  email: z.union([z.literal('').transform(() => null), z.string().trim().max(200).pipe(z.email())]).nullable().optional(),
  interval_weeks: z.coerce.number().int().min(1).max(52),
  last_cleaned_on: z.iso.date().nullable().optional(),
  notes: optionalText(2000),
  key_code: optionalText(100),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

// Felter der må ændres, og hvilken kolonne de hører til.
// Kolonnenavne kommer herfra og aldrig fra brugeren, så de er sikre at sætte ind i SQL.
const COLUMNS = {
  name: 'name',
  address: 'address',
  postal_code: 'postal_code',
  city: 'city',
  phone: 'phone',
  email: 'email',
  interval_weeks: 'interval_weeks',
  last_cleaned_on: 'last_cleaned_on',
  notes: 'notes',
  key_code: 'key_code_enc',
  lat: 'lat',
  lng: 'lng',
};

const idSchema = z.coerce.number().int().positive();

// Næste pudsning = sidste pudsning + interval. Aldrig pudset = skal pudses nu.
// Beregnes i databasen, så vi ikke henter alle kunder over i JavaScript.
const NEXT_DUE = `CASE WHEN last_cleaned_on IS NULL THEN CURRENT_DATE
                       ELSE last_cleaned_on + interval_weeks * 7 END`;

// Nøglekoden sendes aldrig med i lister – kun om der findes en.
const PUBLIC_COLUMNS = `id, name, address, postal_code, city, phone, email, interval_weeks,
  last_cleaned_on, notes, lat, lng, sms_opt_out, status,
  key_code_enc IS NOT NULL AS has_key_code,
  ${NEXT_DUE} AS next_due`;

export function customersRouter({ pool, encryption }) {
  const router = Router();
  router.use(requireRole('chef'));

  async function findCustomer(id) {
    const { rows } = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM customers WHERE id = $1`, [id]);
    return rows[0];
  }

  // Alle aktive kunder, evt. filtreret med søgning på navn eller adresse.
  router.get('/', async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS} FROM customers
       WHERE status <> 'opsagt'
         AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR address ILIKE '%' || $1 || '%')
       ORDER BY name`,
      [search],
    );
    res.json({ customers: rows });
  });

  // "Skal pudses": aktive kunder, der er over tid eller forfalder inden for X dage.
  router.get('/due', async (req, res) => {
    const days = z.coerce.number().int().min(0).max(60).default(14).parse(req.query.days);
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT ${PUBLIC_COLUMNS}, CURRENT_DATE - (${NEXT_DUE}) AS days_overdue
         FROM customers WHERE status = 'aktiv'
       ) due
       WHERE next_due <= CURRENT_DATE + $1::int
       ORDER BY next_due, name`,
      [days],
    );
    res.json({ customers: rows });
  });

  router.get('/:id', async (req, res) => {
    const customer = await findCustomer(idSchema.parse(req.params.id));
    if (customer) return res.json({ customer });
    res.status(404).json({ error: 'Kunden findes ikke.' });
  });

  // Nøglekoden hentes for sig, sendes uden cache og logges, så man kan se hvem der har set den.
  router.get('/:id/key-code', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { rows } = await pool.query('SELECT key_code_enc FROM customers WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Kunden findes ikke.' });

    await pool.query('INSERT INTO key_code_views (user_id, customer_id) VALUES ($1, $2)', [req.session.user.id, id]);
    res.set('Cache-Control', 'no-store');
    res.json({ keyCode: encryption.decrypt(rows[0].key_code_enc) });
  });

  router.post('/', async (req, res) => {
    const c = customerSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO customers (name, address, postal_code, city, phone, email, interval_weeks,
         last_cleaned_on, notes, key_code_enc, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        c.name, c.address, c.postal_code, c.city, c.phone ?? null, c.email ?? null, c.interval_weeks,
        c.last_cleaned_on ?? null, c.notes ?? null, encryption.encrypt(c.key_code), c.lat ?? null, c.lng ?? null,
      ],
    );
    res.status(201).json({ customer: await findCustomer(rows[0].id) });
  });

  // Ret kun de felter, der er sendt med.
  router.patch('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const changes = customerSchema.partial().parse(req.body);

    const assignments = [];
    const values = [];
    for (const [field, value] of Object.entries(changes)) {
      values.push(field === 'key_code' ? encryption.encrypt(value) : (value ?? null));
      assignments.push(`${COLUMNS[field]} = $${values.length}`);
    }
    if (assignments.length === 0) {
      return res.status(400).json({ error: 'Ingen ændringer.' });
    }

    values.push(id);
    const { rowCount } = await pool.query(
      `UPDATE customers SET ${assignments.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
      values,
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Kunden findes ikke.' });
    res.json({ customer: await findCustomer(id) });
  });

  // Sletning fjerner kunden helt (GDPR: retten til at blive glemt).
  // Loggen over nøglekoder slettes med (ON DELETE CASCADE).
  router.delete('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Kunden findes ikke.' });
    res.status(204).end();
  });

  return router;
}
