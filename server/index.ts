import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb, seedDemo } from './db.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Variables del archivo .env (si existe); las del sistema tienen prioridad. */
try {
  process.loadEnvFile(resolve(root, '.env'));
} catch {
  /* sin .env: se usan solo las variables del sistema */
}
const dataDir = resolve(process.env.DATA_DIR ?? resolve(root, 'data'));
mkdirSync(dataDir, { recursive: true });

const devLogin = process.env.DEV_LOGIN === '1';
if (devLogin && process.env.NODE_ENV === 'production') {
  throw new Error('DEV_LOGIN=1 deja entrar a cualquiera sin Google: no se permite en producción.');
}
if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn('Falta GOOGLE_CLIENT_ID: nadie podrá entrar con Google.');
}

const db = openDb(resolve(dataDir, 'filo.db'));
if (process.env.SEED_DEMO !== '0') seedDemo(db);

const app = createApp({
  db,
  uploadDir: resolve(dataDir, 'uploads'),
  timeZone: process.env.BUSINESS_TZ ?? 'America/Panama',
  staticDir: resolve(root, 'dist'),
  googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
  devLogin,
  trustProxy: process.env.TRUST_PROXY === '1',
  routingUrl: process.env.ROUTING_URL || undefined,
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Filo escuchando en http://localhost:${port}`));
