import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = createApp({ pool, config });

app.listen(config.port, () => {
  console.log(`Serveren kører på http://localhost:${config.port}`);
});
