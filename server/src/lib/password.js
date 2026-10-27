import argon2 from 'argon2';

// Adgangskoder gemmes aldrig, kun som en hash.
// argon2id er den algoritme, OWASP anbefaler i dag. Den er bevidst langsom og bruger
// meget hukommelse, så det er dyrt at gætte sig frem, selv hvis databasen bliver stjålet.
// Hver hash får sit eget tilfældige salt, så to ens adgangskoder giver forskellige hashes.

export const MIN_PASSWORD_LENGTH = 12;

// argon2 er bevidst tung. Uden en øvre grænse kunne nogen sende en adgangskode
// på flere megabyte og få serveren til at bruge al sin kraft på at hashe den.
export const MAX_PASSWORD_LENGTH = 128;

export function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

// Returnerer true eller false. Sammenligningen sker i konstant tid inde i argon2.
export function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}
