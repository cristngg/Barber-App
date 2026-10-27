import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { testProvider } from './billing.js';
import { testSms } from './phone.js';
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

/*
 * Cobro: BILLING_PROVIDER=test (pago simulado, para probar) u off (sin cobro: todos los perfiles públicos).
 * Por defecto, test al desarrollar y off en producción. El pago simulado no se permite en producción.
 */
const production = process.env.NODE_ENV === 'production';
const billingName = process.env.BILLING_PROVIDER ?? (production ? 'off' : 'test');
if (billingName === 'test' && production) {
  throw new Error('BILLING_PROVIDER=test deja "pagar" sin cobrar: no se permite en producción.');
}
if (billingName !== 'test' && billingName !== 'off') throw new Error(`BILLING_PROVIDER desconocido: ${billingName}`);
if (billingName === 'off') console.warn('Cobro desactivado: las cuentas de barbero son gratis.');

/* Verificar el celular del barbero: SMS_PROVIDER=test (el código se ve en pantalla) u off (no se pide). */
const smsName = process.env.SMS_PROVIDER ?? (production ? 'off' : 'test');
if (smsName === 'test' && production) throw new Error('SMS_PROVIDER=test muestra el código en pantalla: no se permite en producción.');
if (smsName !== 'test' && smsName !== 'off') throw new Error(`SMS_PROVIDER desconocido: ${smsName}`);
if (smsName === 'off') console.warn('Verificación de celular desactivada.');

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
  billingProvider: billingName === 'test' ? testProvider : null,
  smsProvider: smsName === 'test' ? testSms : null,
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(','),
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Filo escuchando en http://localhost:${port}`));
