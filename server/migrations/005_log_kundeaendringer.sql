-- Log over hvem der opretter, ændrer og sletter kunder, og hvornår.
-- Loggen gemmer kun HVILKE felter der er ændret, ikke de gamle eller nye værdier,
-- så den ikke bliver en ekstra kopi af kundedata (og aldrig indeholder en nøglekode).
CREATE TABLE customer_changes (
  id              SERIAL PRIMARY KEY,
  -- Ingen sletning af brugere, der har ændret noget: sporet skal kunne følges tilbage til en person.
  user_id         INTEGER NOT NULL REFERENCES users(id),
  -- Bevidst uden fremmednøgle: loggen skal blive stående, også når kunden er slettet.
  customer_id     INTEGER NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('oprettet', 'ændret', 'slettet')),
  changed_fields  TEXT[] NOT NULL DEFAULT '{}',
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historikken for én kunde hentes nyeste først.
CREATE INDEX customer_changes_customer_idx ON customer_changes (customer_id, changed_at DESC);

-- Samme princip for loggen over visninger af nøglekoder: før blev den slettet sammen med kunden,
-- så det ikke længere kunne ses, hvem der havde set koden. Nu bliver den stående.
ALTER TABLE key_code_views DROP CONSTRAINT key_code_views_customer_id_fkey;
