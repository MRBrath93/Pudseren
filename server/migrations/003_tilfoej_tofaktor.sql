-- To-faktor (TOTP) for brugerne.
-- Hemmeligheden gemmes krypteret med AES-256-GCM (ENCRYPTION_KEY), aldrig i klar tekst.
ALTER TABLE users
  ADD COLUMN totp_secret_enc  TEXT,
  ADD COLUMN totp_enabled_at  TIMESTAMPTZ,
  -- Sidst brugte 30-sekunders tidsrum, så samme kode ikke kan bruges to gange.
  ADD COLUMN totp_last_step   BIGINT;

-- Gendannelseskoder, hvis telefonen mistes. Gemmes kun som hash og kan hver bruges én gang.
CREATE TABLE recovery_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE INDEX recovery_codes_user_id_idx ON recovery_codes (user_id);
