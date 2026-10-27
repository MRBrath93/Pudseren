-- Kunder: det, der i dag står på papkortet.
CREATE TABLE customers (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  address          TEXT NOT NULL,
  postal_code      TEXT NOT NULL CHECK (postal_code ~ '^\d{4}$'),
  city             TEXT NOT NULL,
  phone            TEXT,
  email            TEXT,
  -- Kunden vælger selv sit interval, fx hver 4. uge.
  interval_weeks   INTEGER NOT NULL CHECK (interval_weeks BETWEEN 1 AND 52),
  last_cleaned_on  DATE,
  notes            TEXT,
  -- Nøglekode eller alarmkode, krypteret med AES-256-GCM. Aldrig i klar tekst.
  key_code_enc     TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  sms_opt_out      BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'aktiv'
                   CHECK (status IN ('aktiv', 'opsigelse_anmodet', 'opsagt')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Skal pudses" og kundelisten filtrerer altid på status.
CREATE INDEX customers_status_idx ON customers (status);

-- Log over hvem der har set en nøglekode og hvornår.
CREATE TABLE key_code_views (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
