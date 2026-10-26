import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.js';
import { openDb, seedDemo } from './db.js';

let server: Server;
let base: string;
let dir: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'filo-test-'));
  const db = openDb(join(dir, 'test.db'));
  seedDemo(db);
  /* Google falso: la credencial "google:<sub>" es válida, cualquier otra no. */
  const verifyGoogle = async (credential: string) => {
    if (!credential.startsWith('google:')) throw new Error('inválida');
    const sub = credential.slice('google:'.length);
    return { sub, email: `${sub}@gmail.com`, name: `Persona ${sub}` };
  };
  server = createApp({ db, uploadDir: join(dir, 'uploads'), googleClientId: 'test', verifyGoogle }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function api(path: string, { token, method = 'GET', body, type }: { token?: string; method?: string; body?: unknown; type?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload: string | Buffer | undefined;
  if (type) {
    headers['content-type'] = type;
    payload = body as Buffer;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body: payload });
  return { status: res.status, json: (await res.json()) as any };
}

let people = 0;
const signIn = async (sub: string) => (await api('/api/auth/google', { method: 'POST', body: { credential: `google:${sub}` } })).json;
/* Una persona nueva con sesión abierta. */
const session = async () => (await signIn(`p${++people}`)).token as string;

/* Próxima fecha (a partir de mañana) que cae en uno de `days`. */
function nextDate(days: number[]) {
  const d = new Date();
  for (let i = 1; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    if (days.includes(d.getDay())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  throw new Error('sin fecha');
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

describe('Filo API', () => {
  it('lista los barberos de ejemplo', async () => {
    const { status, json } = await api('/api/barbers');
    assert.equal(status, 200);
    assert.equal(json.length, 3);
    assert.equal(json[0].name, 'Carlos M.');
    assert.equal(json[0].services[0].price, null);
  });

  it('pide sesión para lo privado', async () => {
    assert.equal((await api('/api/me')).status, 401);
    assert.equal((await api('/api/me', { token: 'inventado' })).status, 401);
    assert.equal((await api('/api/session', { method: 'POST' })).status, 404, 'ya no hay sesiones anónimas');
  });

  it('entra con Google y la misma cuenta sirve en otro teléfono', async () => {
    const bad = await api('/api/auth/google', { method: 'POST', body: { credential: 'falsa' } });
    assert.equal(bad.status, 401);

    const phone1 = await signIn('misma');
    assert.equal(phone1.user.email, 'misma@gmail.com');
    await api('/api/me/barber', { token: phone1.token, method: 'POST', body: { name: 'Dos Teléfonos', area: 'Z' } });

    const phone2 = await signIn('misma');
    assert.notEqual(phone2.token, phone1.token);
    assert.equal(phone2.user.id, phone1.user.id);
    const me = await api('/api/me', { token: phone2.token });
    assert.equal(me.json.barber.name, 'Dos Teléfonos');

    await api('/api/auth/logout', { token: phone1.token, method: 'POST' });
    assert.equal((await api('/api/me', { token: phone1.token })).status, 401, 'cerrar sesión invalida ese token');
    assert.equal((await api('/api/me', { token: phone2.token })).status, 200, 'el otro teléfono sigue dentro');
  });

  it('sin Google configurado no deja entrar', async () => {
    const off = createApp({ db: openDb(join(dir, 'off.db')), uploadDir: join(dir, 'off') }).listen(0);
    await new Promise((r) => off.once('listening', r));
    const url = `http://localhost:${(off.address() as AddressInfo).port}`;
    const config = await (await fetch(url + '/api/config')).json();
    assert.deepEqual(config, { googleClientId: null, devLogin: false });
    const res = await fetch(url + '/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'google:x' }),
    });
    assert.equal(res.status, 503);
    assert.equal((await fetch(url + '/api/auth/dev', { method: 'POST' })).status, 404);
    off.close();
  });

  it('migra una base con sesiones anónimas', async () => {
    const file = join(dir, 'vieja.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
              INSERT INTO users VALUES ('u1', 'hash1', 1);`);
    old.close();
    const db = openDb(file);
    assert.deepEqual({ ...(db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get('hash1') as object) }, { user_id: 'u1' });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'google_sub'").get()!.n, 1);
    db.close();
  });

  it('un barbero crea su perfil, sube fotos y pone precios', async () => {
    const token = await session();
    const created = await api('/api/me/barber', { token, method: 'POST', body: { name: 'Cristofer', area: 'Bella Vista' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.rating, null);

    assert.equal((await api('/api/me/barber', { token, method: 'POST', body: { name: 'Otro', area: 'X' } })).status, 409);

    const photo = await api('/api/photos', { token, method: 'POST', body: JPEG, type: 'image/jpeg' });
    assert.equal(photo.status, 201);
    const served = await fetch(base + photo.json.url);
    assert.equal(served.status, 200);

    const fake = await api('/api/photos', { token, method: 'POST', body: Buffer.from('hola'), type: 'image/jpeg' });
    assert.equal(fake.status, 415);

    const patched = await api('/api/me/barber', {
      token,
      method: 'PATCH',
      body: { bio: 'Fade y barba.', tags: ['barba', 'fade'], workDays: [6, 2], cover: photo.json.url },
    });
    assert.equal(patched.status, 200);
    assert.deepEqual(patched.json.specialties, ['Fade', 'Barba']);
    assert.deepEqual(patched.json.workDays, [2, 6]);
    assert.equal(patched.json.cover, photo.json.url);

    const badPrice = await api('/api/me/barber/services', { token, method: 'POST', body: { name: 'Fade', price: -3 } });
    assert.equal(badPrice.status, 400);

    const withCut = await api('/api/me/barber/services', { token, method: 'POST', body: { name: 'Fade bajo', price: 12.5 } });
    assert.equal(withCut.status, 201);
    assert.equal(withCut.json.services[0].price, 12.5);

    const me = await api('/api/me', { token });
    assert.equal(me.json.barber.name, 'Cristofer');
  });

  it('nadie usa las fotos de otro', async () => {
    const owner = await session();
    const photo = await api('/api/photos', { token: owner, method: 'POST', body: JPEG, type: 'image/jpeg' });
    const thief = await session();
    await api('/api/me/barber', { token: thief, method: 'POST', body: { name: 'Ladrón', area: 'X' } });
    const res = await api('/api/me/barber', { token: thief, method: 'PATCH', body: { avatar: photo.json.url } });
    assert.equal(res.status, 400);
  });

  it('un cliente aparta, la hora queda tomada y el barbero confirma', async () => {
    const barberToken = await session();
    const barber = (await api('/api/me/barber', { token: barberToken, method: 'POST', body: { name: 'Agenda', area: 'Y' } })).json;
    const withCut = (await api('/api/me/barber/services', { token: barberToken, method: 'POST', body: { name: 'Corte', price: 10 } })).json;
    const serviceId = withCut.services[0].id;
    const date = nextDate(barber.workDays);

    const client = await session();
    const booked = await api('/api/appointments', { token: client, method: 'POST', body: { barberId: barber.id, serviceId, date, hour: 15 } });
    assert.equal(booked.status, 201);
    assert.equal(booked.json.status, 'pending');

    const other = await session();
    const clash = await api('/api/appointments', { token: other, method: 'POST', body: { barberId: barber.id, serviceId, date, hour: 15 } });
    assert.equal(clash.status, 409);
    assert.equal(clash.json.error, 'Esa hora ya la tomaron. Prueba con otra.');

    const avail = await api(`/api/barbers/${barber.id}/availability?date=${date}`);
    assert.ok(avail.json.taken.includes(15));

    assert.equal((await api(`/api/appointments/${booked.json.id}/confirm`, { token: client, method: 'POST' })).status, 403);
    const confirmed = await api(`/api/appointments/${booked.json.id}/confirm`, { token: barberToken, method: 'POST' });
    assert.equal(confirmed.json.status, 'confirmed');

    const agenda = await api('/api/me/agenda', { token: barberToken });
    assert.equal(agenda.json.length, 1);

    const cancelled = await api(`/api/appointments/${booked.json.id}/cancel`, { token: client, method: 'POST' });
    assert.equal(cancelled.json.status, 'cancelled');

    const again = await api('/api/appointments', { token: other, method: 'POST', body: { barberId: barber.id, serviceId, date, hour: 15 } });
    assert.equal(again.status, 201, 'cancelar libera la hora');
  });

  it('no deja apartar un día que el barbero no atiende', async () => {
    const client = await session();
    const date = nextDate([1]); // lunes: Carlos M. atiende de martes a sábado
    const res = await api('/api/appointments', {
      token: client,
      method: 'POST',
      body: { barberId: 'carlos-m', serviceId: 'carlos-m-0', date, hour: 10 },
    });
    assert.equal(res.status, 400);
  });
});
