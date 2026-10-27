-- Sessioner gemmes i databasen (bruges af connect-pg-simple).
-- Så overlever et login, at serveren genstarter, og en session kan slettes på serveren ved log ud.
CREATE TABLE "session" (
  "sid"    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  "sess"   JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);

-- Gør det hurtigt at finde og slette udløbne sessioner.
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
