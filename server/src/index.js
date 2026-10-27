import { createApp } from './app.js';
import { createPool } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const pool = createPool(process.env.DATABASE_URL);
const app = createApp({ pool });

app.listen(port, () => {
  console.log(`Serveren kører på http://localhost:${port}`);
});
