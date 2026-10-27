# Kodestandard

Regler for koden i Pudseren. Målet er kode, der er let at læse, sikker
og bruger så lidt energi og data som muligt, både på serveren og på telefonen i marken.

Inspireret af W3C's Web Sustainability Guidelines (WSG):
https://www.w3.org/TR/web-sustainability-guidelines/

## Sprog

- Kode (variabler, funktioner, tabeller, kolonner) skrives på engelsk.
- Kommentarer, fejlbeskeder og tekst til brugeren skrives på dansk.
- Git-beskeder på dansk i bydeform: "Tilføj …", "Ret …", "Fjern …".

## JavaScript

- Brug `for...of` (eller en almindelig `for`-løkke) frem for `forEach`, `map`, `filter` og `reduce`.
  Det undgår et funktionskald pr. element og kan stoppe tidligt med `break`.
- Stop så tidligt som muligt: `return`, `break` eller `continue`, når svaret er fundet.
- I `if`/`else if`-kæder og `switch` står det mest sandsynlige udfald øverst,
  så den almindelige vej kræver færrest sammenligninger. Sjældne tilfælde og fejl står nederst.
- Undgå at kopiere store arrays og objekter unødigt.
- Ingen nye pakker, hvis få linjer kode kan gøre det samme. Hver pakke skal kunne begrundes.

Gevinsten ved løkkerne er lille i en app af denne størrelse. De største besparelser ligger
i database, netværk og klient (nedenfor).

## Database

- Hent kun de kolonner og rækker, der skal bruges. Ingen `SELECT *` i appens kode.
- Lad PostgreSQL filtrere, sortere og beregne (fx "skal pudses") i stedet for JavaScript.
- Ét SQL-kald frem for ét kald pr. række (undgå N+1).
- Indeks på kolonner, der ofte filtreres eller sorteres på.
- Altid parametre (`$1`, `$2`), aldrig tekst sat sammen med brugerinput.
- Ændringer i strukturen laves kun som migrationer i `server/migrations`.

## Netværk og server

- Ingen polling. Hent data, når brugeren gør noget, eller når appen åbnes.
- Svar kun med de data, klienten skal vise.
- Komprimering (gzip/brotli) og cache-headers i Nginx.
- Serveren er dimensioneret til opgaven (1 vCPU, 1 GB RAM) og ligger i EU.

## Klient (Vue)

- Sider indlæses først, når de bruges (lazy loading i routeren).
- Systemskrifter i stedet for webfonte. Ikoner som SVG.
- Få og små billeder.
- Service workeren cacher appens filer, så de ikke hentes igen hver dag.
- Respektér `prefers-reduced-motion`. Animation kun når den viser en tilstand.

## Sikkerhed

- Hemmeligheder kun i `.env`, som aldrig kommer i git. `.env.example` viser, hvad der skal udfyldes.
- Alt input valideres på serveren. Klientens tjek er kun for brugervenlighed.
- Fejl til klienten uden tekniske detaljer. Detaljerne skrives i serverens log.
- Roller tjekkes på serveren ved hvert kald.

## Git

- Små commits, der hver gør én ting og virker.
- Commit først, når koden kører og testene består.
