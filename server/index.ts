import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb, seedDemo } from './db.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(process.env.DATA_DIR ?? resolve(root, 'data'));
mkdirSync(dataDir, { recursive: true });

const db = openDb(resolve(dataDir, 'filo.db'));
if (process.env.SEED_DEMO !== '0') seedDemo(db);

const app = createApp({
  db,
  uploadDir: resolve(dataDir, 'uploads'),
  timeZone: process.env.BUSINESS_TZ ?? 'America/Panama',
  staticDir: resolve(root, 'dist'),
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Filo escuchando en http://localhost:${port}`));
