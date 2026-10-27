-- Brugere: chefen og medarbejderne.
-- Adgangskoder gemmes aldrig, kun som en argon2id-hash.
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('chef', 'medarbejder')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
