import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.js';
import { testProvider } from './billing.js';
import { testSms } from './phone.js';
import { openDb, seedDemo } from './db.js';

let server: Server;
let db: ReturnType<typeof openDb>;
const routeCalls: string[] = [];
let base: string;
let dir: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'filo-test-'));
  db = openDb(join(dir, 'test.db'));
  seedDemo(db);
  /* Google falso: la credencial "google:<sub>" es válida, cualquier otra no. */
  const verifyGoogle = async (credential: string) => {
    if (!credential.startsWith('google:')) throw new Error('inválida');
    const sub = credential.slice('google:'.length);
    return { sub, email: `${sub}@gmail.com`, emailVerified: true, name: `Persona ${sub}` };
  };
  /* Servicio de rutas falso con la forma de respuesta de OSRM. */
  const fetchImpl = (async (url: string) => {
    routeCalls.push(String(url));
    const m = String(url).match(/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/)!;
    const [lng1, lat1, lng2, lat2] = m.slice(1).map(Number);
    if (lat2 > 50) return new Response(JSON.stringify({ code: 'NoRoute', routes: [] }));
    const route = { distance: 3400.4, duration: 612.6, geometry: { coordinates: [[lng1, lat1], [lng1, lat2], [lng2, lat2]] } };
    return new Response(JSON.stringify({ code: 'Ok', routes: [route] }));
  }) as typeof fetch;
  server = createApp({ db, uploadDir: join(dir, 'uploads'), googleClientId: 'test', verifyGoogle, fetchImpl }).listen(0);
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
function nextDate(days: number[], from = 1) {
  const d = new Date();
  d.setDate(d.getDate() + from - 1);
  for (let i = 1; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    if (days.includes(d.getDay())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  throw new Error('sin fecha');
}

/* Levanta otra instancia de la API con opciones propias y la cierra siempre, aunque la prueba falle. */
async function withServer(options: Partial<Parameters<typeof createApp>[0]>, name: string, fn: (url: string) => Promise<void>) {
  const srv = createApp({ db: openDb(join(dir, `${name}.db`)), uploadDir: join(dir, `${name}-up`), ...options }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  try {
    await fn(`http://localhost:${(srv.address() as AddressInfo).port}`);
  } finally {
    srv.close();
  }
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

  it('crea cuenta con correo y contraseña y entra', async () => {
    const reg = (body: object) => api('/api/auth/register', { method: 'POST', body });
    const login = (email: string, password: string) => api('/api/auth/login', { method: 'POST', body: { email, password } });

    assert.equal((await reg({ name: 'Ana', email: 'no-es-correo', password: 'larga1234' })).status, 400);
    const short = await reg({ name: 'Ana', email: 'ana@correo.com', password: 'corta' });
    assert.equal(short.status, 400);
    assert.match(short.json.error, /al menos 8/);

    const created = await reg({ name: 'Ana', email: 'Ana@Correo.com', password: 'larga1234' });
    assert.equal(created.status, 201);
    assert.equal(created.json.user.email, 'ana@correo.com');

    const dup = await reg({ name: 'Otra', email: 'ANA@correo.com', password: 'otraclave1' });
    assert.equal(dup.status, 409);

    assert.equal((await login('ana@correo.com', 'equivocada')).status, 401);
    const ok = await login(' ANA@correo.com ', 'larga1234');
    assert.equal(ok.status, 201);
    assert.equal(ok.json.user.id, created.json.user.id);
    assert.equal((await api('/api/me', { token: ok.json.token })).json.user.name, 'Ana');

    const ghost = await login('nadie@correo.com', 'larga1234');
    assert.equal(ghost.json.error, 'Correo o contraseña incorrectos.');
  });

  it('frena a quien adivina contraseñas', async () => {
    await api('/api/auth/register', { method: 'POST', body: { name: 'Beto', email: 'beto@correo.com', password: 'secreta123' } });
    let last = 0;
    for (let i = 0; i < 9; i++) {
      last = (await api('/api/auth/login', { method: 'POST', body: { email: 'beto@correo.com', password: `mala${i}xxxx` } })).status;
    }
    assert.equal(last, 429);
    const right = await api('/api/auth/login', { method: 'POST', body: { email: 'beto@correo.com', password: 'secreta123' } });
    assert.equal(right.status, 429, 'bloqueado aunque ahora acierte');
  });

  it('une Google y contraseña cuando el correo es el mismo y está verificado', async () => {
    const reg = await api('/api/auth/register', { method: 'POST', body: { name: 'Caro', email: 'caro@gmail.com', password: 'clave12345' } });
    const viaGoogle = await signIn('caro');
    assert.equal(viaGoogle.user.id, reg.json.user.id, 'misma persona');

    const googleFirst = await signIn('dani');
    const taken = await api('/api/auth/register', { method: 'POST', body: { name: 'Dani', email: 'dani@gmail.com', password: 'clave12345' } });
    assert.equal(taken.status, 409);
    assert.match(taken.json.error, /Google/);
    const viaPassword = await api('/api/auth/login', { method: 'POST', body: { email: 'dani@gmail.com', password: 'clave12345' } });
    assert.match(viaPassword.json.error, /Google/);
    assert.ok(googleFirst.token);
  });

  it('sin Google configurado no deja entrar', async () => withServer({}, 'off', async (url) => {
    const config = await (await fetch(url + '/api/config')).json();
    assert.deepEqual(config, { googleClientId: null, devLogin: false, billing: false, phoneVerification: false });
    const res = await fetch(url + '/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'google:x' }),
    });
    assert.equal(res.status, 503);
    assert.equal((await fetch(url + '/api/auth/dev', { method: 'POST' })).status, 404);
  }));

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
      body: { bio: 'Fade y barba.', tags: ['barba', 'fade'], cover: photo.json.url },
    });
    assert.equal(patched.status, 200);
    assert.deepEqual(patched.json.specialties, ['Fade', 'Barba']);
    assert.equal(patched.json.cover, photo.json.url);

    const badPrice = await api('/api/me/barber/services', { token, method: 'POST', body: { name: 'Fade', price: -3, style: 'fade' } });
    assert.equal(badPrice.status, 400);

    const noStyle = await api('/api/me/barber/services', { token, method: 'POST', body: { name: 'Fade bajo', price: 12.5 } });
    assert.equal(noStyle.status, 400);
    assert.equal(noStyle.json.error, 'Elige el tipo de corte.');

    const withCut = await api('/api/me/barber/services', { token, method: 'POST', body: { name: 'Fade bajo', price: 12.5, style: 'fade' } });
    assert.equal(withCut.status, 201);
    assert.equal(withCut.json.services[0].style, 'fade');
    assert.equal(withCut.json.services[0].price, 12.5);

    const me = await api('/api/me', { token });
    assert.equal(me.json.barber.name, 'Cristofer');
  });

  it('el barbero marca dónde atiende', async () => {
    const token = await session();
    const created = await api('/api/me/barber', { token, method: 'POST', body: { name: 'Con Mapa', area: 'Obarrio' } });
    assert.equal(created.json.location, null);

    const bad = await api('/api/me/barber', { token, method: 'PATCH', body: { location: { lat: 120, lng: 0 } } });
    assert.equal(bad.status, 400);

    const set = await api('/api/me/barber', { token, method: 'PATCH', body: { location: { lat: 8.98512345, lng: -79.51987654 } } });
    assert.deepEqual(set.json.location, { lat: 8.98512, lng: -79.51988 });

    const list = (await api('/api/barbers')).json as { id: string; location: unknown }[];
    assert.deepEqual(list.find((b) => b.id === created.json.id)?.location, { lat: 8.98512, lng: -79.51988 });
    assert.ok(list.find((b) => b.id === 'carlos-m')?.location, 'los de ejemplo tienen ubicación');

    const cleared = await api('/api/me/barber', { token, method: 'PATCH', body: { location: null } });
    assert.equal(cleared.json.location, null);
  });

  it('traza la ruta para "Cómo llegar"', async () => {
    const token = await session();
    const q = '/api/route?from=8.9851,-79.5245&to=8.9961,-79.5068';
    assert.equal((await api(q)).status, 401, 'pide sesión');

    const car = await api(q, { token });
    assert.equal(car.status, 200);
    assert.deepEqual(car.json, {
      mode: 'car',
      distanceM: 3400,
      durationS: 613,
      path: [[8.9851, -79.5245], [8.9961, -79.5245], [8.9961, -79.5068]],
    });
    assert.match(routeCalls.at(-1)!, /routed-car\/route\/v1\/driving\/-79.5245,8.9851;-79.5068,8.9961/);

    const calls = routeCalls.length;
    await api(q, { token });
    assert.equal(routeCalls.length, calls, 'la segunda vez sale de la caché');

    const foot = await api(q + '&mode=foot', { token });
    assert.equal(foot.json.mode, 'foot');
    assert.match(routeCalls.at(-1)!, /routed-foot/);

    assert.equal((await api('/api/route?from=x&to=8.9,-79.5', { token })).status, 400);
    assert.equal((await api('/api/route?from=8.98,-79.52&to=60,-79.5', { token })).status, 404);
  });

  it('busca cortes por estilo, con sinónimos y faltas de ortografía', async () => {
    const token = await session();
    await api('/api/me/barber', { token, method: 'POST', body: { name: 'Estilos Yari', area: 'Calidonia' } });
    await api('/api/me/barber', { token, method: 'PATCH', body: { location: { lat: 8.97, lng: -79.53 } } });
    const add = (name: string, style: string) =>
      api('/api/me/barber/services', { token, method: 'POST', body: { name, price: 20, style } });
    await add('Box braids', 'trenzas');
    await add('Keratina brasileña', 'alisado');
    await add('Rayitos rubios', 'tinte');

    const cuts = (q: string, extra = '') => api(`/api/cuts?q=${encodeURIComponent(q)}${extra}`, { token });
    assert.equal((await api('/api/cuts?q=trenzas')).status, 401, 'pide sesión');

    const names = async (q: string, extra = '') => ((await cuts(q, extra)).json.items as { name: string }[]).map((c) => c.name);
    assert.deepEqual(await names('trenzas'), ['Box braids'], 'por tipo, aunque el nombre no diga "trenzas"');
    assert.deepEqual(await names('alizado'), ['Keratina brasileña'], 'alizado = alisado');
    assert.deepEqual(await names('pintado'), ['Rayitos rubios'], 'pintado = tinte');
    assert.deepEqual(await names('KERATINA'), ['Keratina brasileña']);
    assert.ok((await names('fade')).includes('Fade bajo'), 'también los de ejemplo');
    assert.deepEqual(await names('', '&style=tinte'), ['Rayitos rubios']);
    assert.deepEqual(await names('trenzas calidonia'), ['Box braids'], 'varias palabras: tipo y barrio');
    assert.deepEqual(await names('trenzas obarrio'), []);

    const one = (await cuts('trenzas', '&near=8.98,-79.52')).json.items[0];
    assert.equal(one.styleLabel, 'Trenzas');
    assert.equal(one.barber.name, 'Estilos Yari');
    assert.ok(one.distanceKm > 1 && one.distanceKm < 2, `distancia ${one.distanceKm}`);

    const page1 = (await cuts('', '&limit=5')).json;
    assert.equal(page1.items.length, 5);
    assert.equal(page1.nextOffset, 5);
    const page2 = (await cuts('', `&limit=5&offset=${page1.nextOffset}`)).json;
    const ids = new Set([...page1.items, ...page2.items].map((c: { id: string }) => c.id));
    assert.equal(ids.size, page1.items.length + page2.items.length, 'las páginas no se repiten');
  });

  it('las píldoras siguen lo que más busca la gente de la zona', async () => {
    const panama = { lat: 8.98, lng: -79.52 };
    const otraCiudad = { lat: 9.93, lng: -84.08 }; // a más de 50 km
    const searchAs = async (token: string, q: string, near: object) =>
      (await api('/api/searches', { token, method: 'POST', body: { q, near } })).json.counted;

    const viewer = await session();
    const pills = async (near: { lat: number; lng: number }) =>
      (await api(`/api/trending?near=${near.lat},${near.lng}`, { token: viewer })).json;

    const before = await pills(panama);
    assert.equal(before.scope, 'none');
    assert.deepEqual(before.pills.map((p: { label: string }) => p.label).slice(0, 3), ['Fade', 'Barba', 'Diseños'], 'sin datos: los tipos fijos');

    // En Panamá, 3 personas buscan "rayitos" (Tinte); 2 buscan "trenzas": no llega al mínimo.
    for (let i = 0; i < 3; i++) {
      const t = await session();
      assert.equal(await searchAs(t, 'Rayitos', panama), true);
      assert.equal(await searchAs(t, 'rayitos', panama), false, 'la misma persona no cuenta dos veces');
      if (i < 2) await searchAs(t, 'trenzas', panama);
    }
    // En la otra ciudad dicen "mechas" para lo mismo.
    for (let i = 0; i < 3; i++) await searchAs(await session(), 'mechas', otraCiudad);

    assert.equal(await searchAs(viewer, 'asdfgh', panama), false, 'palabras sin resultados no cuentan');
    assert.equal(await searchAs(viewer, 'ab', panama), false, 'muy corta');

    const here = await pills(panama);
    assert.equal(here.scope, 'local');
    assert.deepEqual(here.pills[0], { key: 'tinte', label: 'Rayitos', style: 'tinte', q: null, trending: true });
    assert.ok(!here.pills.some((p: { label: string }) => p.label === 'Mechas'), 'en Panamá no sale la palabra de otra ciudad');
    assert.ok(!here.pills.some((p: { label: string; trending: boolean }) => p.trending && p.label === 'Trenzas'), 'trenzas no llegó a 3 personas');
    assert.ok(!here.pills.some((p: { label: string }) => p.label === 'Tinte'), 'Tinte no se repite: ya está como "Rayitos"');
    assert.ok(here.pills.some((p: { label: string; trending: boolean }) => p.label === 'Trenzas' && !p.trending), 'los tipos fijos siguen');

    const there = await pills(otraCiudad);
    assert.equal(there.pills[0].label, 'Mechas');
    assert.equal(there.pills[0].style, 'tinte');
  });

  it('reseñas: solo quien tuvo la cita, después de la cita; el promedio es real', async () => {
    const barberToken = await session();
    const barber = (await api('/api/me/barber', { token: barberToken, method: 'POST', body: { name: 'Con Reseñas', area: 'Y' } })).json;
    assert.equal(barber.rating, null);
    assert.equal(barber.reviewCount, 0);
    const cut = (await api('/api/me/barber/services', { token: barberToken, method: 'POST', body: { name: 'Corte', price: 10, style: 'clasico' } })).json.services[0];

    const date = nextDate(barber.workDays);
    const bookAs = async (token: string, start: number) =>
      (await api('/api/appointments', { token, method: 'POST', body: { barberId: barber.id, serviceId: cut.id, date, start } })).json;

    const ana = await signIn('ana-resena');
    const appt = await bookAs(ana.token, 9 * 60);
    const review = (token: string, id: string, body: object) => api(`/api/appointments/${id}/review`, { token, method: 'POST', body });

    // Antes de la cita: no
    const early = await review(ana.token, appt.id, { rating: 5 });
    assert.equal(early.status, 400);
    assert.match(early.json.error, /cuando termine la cita/);
    let mine = (await api('/api/appointments', { token: ana.token })).json.find((a: { id: string }) => a.id === appt.id);
    assert.equal(mine.canReview, false);

    // La cita ya pasó (ayer)
    const yesterday = new Date(Date.now() - 86_400_000);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    db.prepare('UPDATE appointments SET date = ? WHERE id = ?').run(iso(yesterday), appt.id);
    mine = (await api('/api/appointments', { token: ana.token })).json.find((a: { id: string }) => a.id === appt.id);
    assert.equal(mine.canReview, true);
    assert.equal(mine.review, null);

    const stranger = await session();
    assert.equal((await review(stranger, appt.id, { rating: 1 })).status, 404, 'otra persona no');
    assert.equal((await review(ana.token, appt.id, { rating: 6 })).json.error, 'Elige de 1 a 5 estrellas.');
    assert.equal((await review(ana.token, appt.id, { rating: 4, text: 'Buen fade.' })).status, 201);
    assert.equal((await review(ana.token, appt.id, { rating: 5, text: 'Excelente fade.' })).status, 200, 'se puede corregir');

    // Otra persona, otra cita pasada, 3 estrellas
    const beto = await signIn('beto-resena');
    const appt2 = await bookAs(beto.token, 10 * 60);
    db.prepare('UPDATE appointments SET date = ? WHERE id = ?').run(iso(yesterday), appt2.id);
    await review(beto.token, appt2.id, { rating: 3 });

    // Una cancelada no se califica
    const appt3 = await bookAs(beto.token, 11 * 60);
    await api(`/api/appointments/${appt3.id}/cancel`, { token: beto.token, method: 'POST' });
    db.prepare('UPDATE appointments SET date = ? WHERE id = ?').run(iso(yesterday), appt3.id);
    assert.match((await review(beto.token, appt3.id, { rating: 1 })).json.error, /canceladas/);

    const updated = (await api(`/api/barbers/${barber.id}`)).json;
    assert.equal(updated.rating, 4, '(5 + 3) / 2');
    assert.equal(updated.reviewCount, 2);

    const list = (await api(`/api/barbers/${barber.id}/reviews`)).json;
    assert.equal(list.total, 2);
    assert.equal(list.items[0].author, 'Persona B.', 'nombre corto, la más nueva primero');
    assert.equal(list.items[1].text, 'Excelente fade.');

    // El barbero responde; otro barbero no puede
    const reply = await api(`/api/me/reviews/${list.items[1].id}/reply`, { token: barberToken, method: 'POST', body: { text: '¡Gracias, Ana!' } });
    assert.equal(reply.json.reply, '¡Gracias, Ana!');
    const other = await session();
    await api('/api/me/barber', { token: other, method: 'POST', body: { name: 'Otro', area: 'Z' } });
    assert.equal((await api(`/api/me/reviews/${list.items[1].id}/reply`, { token: other, method: 'POST', body: { text: 'x' } })).status, 404);
    assert.equal((await api(`/api/barbers/${barber.id}/reviews`)).json.items[1].reply, '¡Gracias, Ana!');

    assert.equal((await api('/api/barbers/carlos-m')).json.rating, null, 'los de ejemplo ya no traen estrellas inventadas');
  });

  it('cobro: pendiente hasta pagar, 30 días, gracia, cancelar y vencer', async () => {
    const billDb = openDb(join(dir, 'billing.db'));
    const verifyGoogle = async (credential: string) => ({ sub: credential, email: `${credential}@gmail.com`, emailVerified: true, name: credential });
    await withServer({ db: billDb, googleClientId: 't', verifyGoogle, billingProvider: testProvider }, 'billing', async (url) => {
      const call = async (path: string, token?: string, body?: object) => {
        const r = await fetch(url + path, {
          method: body ? 'POST' : 'GET',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, json: (await r.json()) as any };
      };
      const login = async (who: string) => (await call('/api/auth/google', undefined, { credential: who })).json.token as string;
      const listed = async (id: string) => ((await call('/api/barbers')).json as { id: string }[]).some((b) => b.id === id);

      const token = await login('cobro');
      const barber = (await call('/api/me/barber', token, { name: 'Paga', area: 'X' })).json;
      assert.equal((await call('/api/me', token)).json.subscription.status, 'pending');
      assert.equal(await listed(barber.id), false, 'pendiente: no sale');
      assert.equal((await call(`/api/barbers/${barber.id}`)).status, 404);

      const checkout = (await call('/api/billing/checkout', token, {})).json;
      const sessionId = checkout.url.split('/').pop();
      assert.match(checkout.url, /^\/pago-prueba\//);
      const other = await login('otro');
      assert.equal((await call(`/api/billing/test/${sessionId}/pay`, other, {})).status, 404, 'otra persona no paga mi sesión');

      const paid = (await call(`/api/billing/test/${sessionId}/pay`, token, {})).json;
      assert.equal(paid.status, 'active');
      const days = (paid.periodEnd - Date.now()) / 86_400_000;
      assert.ok(days > 29.9 && days <= 30, `30 días (${days})`);
      assert.equal(await listed(barber.id), true, 'pagado: sale');
      assert.equal((await call(`/api/billing/test/${sessionId}/pay`, token, {})).status, 409, 'el mismo pago no cuenta dos veces');

      // Pagar otra vez antes de vencer suma 30 días al final
      const again = (await call('/api/billing/checkout', token, {})).json.url.split('/').pop();
      const twice = (await call(`/api/billing/test/${again}/pay`, token, {})).json;
      assert.ok(Math.round((twice.periodEnd - paid.periodEnd) / 86_400_000) === 30);

      // Venció hace 2 días: gracia (sigue saliendo); hace 6: vencido (no sale y no recibe citas)
      billDb.prepare('UPDATE barbers SET period_end = ? WHERE id = ?').run(Date.now() - 2 * 86_400_000, barber.id);
      assert.equal((await call('/api/billing', token)).json.subscription.status, 'past_due');
      assert.equal(await listed(barber.id), true);
      billDb.prepare('UPDATE barbers SET period_end = ? WHERE id = ?').run(Date.now() - 6 * 86_400_000, barber.id);
      assert.equal((await call('/api/billing', token)).json.subscription.status, 'expired');
      assert.equal(await listed(barber.id), false);
      const client = await login('cliente-cobro');
      const svc = (await call('/api/me/barber/services', token, { name: 'Corte', price: 10, style: 'fade' })).json.services[0];
      const booked = await call('/api/appointments', client, { barberId: barber.id, serviceId: svc.id, date: nextDate(barber.workDays), start: 600 });
      assert.equal(booked.status, 404, 'vencido: no recibe citas');

      // Un pago rechazado no lo activa
      const failId = (await call('/api/billing/checkout', token, {})).json.url.split('/').pop();
      assert.equal((await call(`/api/billing/test/${failId}/fail`, token, {})).json.status, 'expired');

      // Pagar y cancelar: sigue visible hasta el fin de lo pagado
      const renew = (await call('/api/billing/checkout', token, {})).json.url.split('/').pop();
      await call(`/api/billing/test/${renew}/pay`, token, {});
      const canceled = (await call('/api/billing/cancel', token, {})).json;
      assert.equal(canceled.status, 'canceled');
      assert.equal(await listed(barber.id), true);
      billDb.prepare('UPDATE barbers SET period_end = ? WHERE id = ?').run(Date.now() - 1000, barber.id);
      assert.equal((await call('/api/billing', token)).json.subscription.status, 'expired', 'cancelada y vencida: sin gracia');
    });
  });

  it('celular verificado: código de 6 dígitos, límites y un número por cuenta', async () => {
    const verifyGoogle = async (credential: string) => ({ sub: credential, email: `${credential}@gmail.com`, emailVerified: true, name: credential });
    await withServer({ googleClientId: 't', verifyGoogle, smsProvider: testSms }, 'phone', async (url) => {
      const call = async (path: string, token?: string, body?: object) => {
        const r = await fetch(url + path, {
          method: body ? 'POST' : 'GET',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, json: (await r.json()) as any };
      };
      const login = async (who: string) => (await call('/api/auth/google', undefined, { credential: who })).json.token as string;

      const token = await login('celular');
      assert.equal((await call('/api/config')).json.phoneVerification, true);
      const blocked = await call('/api/me/barber', token, { name: 'Sin Celular', area: 'X' });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.json.error, 'Primero verifica tu número de celular.');

      assert.match((await call('/api/phone/start', token, { phone: '1234' })).json.error, /no parece válido/);
      assert.match((await call('/api/phone/start', token, { phone: '2201234' })).json.error, /8 dígitos y empiezan con 6/);

      const started = (await call('/api/phone/start', token, { phone: '6000-1234' })).json;
      assert.equal(started.phone, '+50760001234');
      assert.match(started.testCode, /^\d{6}$/);

      const wrong = started.testCode === '000000' ? '111111' : '000000';
      assert.equal((await call('/api/phone/verify', token, { code: wrong })).json.error, 'Ese código no es. Revísalo y prueba otra vez.');
      const ok = (await call('/api/phone/verify', token, { code: started.testCode })).json;
      assert.deepEqual(ok, { phone: '+50760001234', verified: true });
      assert.equal((await call('/api/me', token)).json.phone.verified, true);
      assert.equal((await call('/api/me/barber', token, { name: 'Con Celular', area: 'X' })).status, 201);

      // El mismo número no sirve para otra cuenta
      const other = await login('otro-celular');
      assert.equal((await call('/api/phone/start', other, { phone: '+507 6000 1234' })).status, 409);

      // Límite de códigos por hora y de intentos por código
      for (let i = 0; i < 3; i++) await call('/api/phone/start', other, { phone: '6111-2222' });
      assert.equal((await call('/api/phone/start', other, { phone: '6111-2222' })).status, 429);
      for (let i = 0; i < 5; i++) await call('/api/phone/verify', other, { code: '999999' });
      assert.equal((await call('/api/phone/verify', other, { code: '999999' })).status, 429);
    });
  });

  it('reportes: 3 personas lo ocultan; el administrador decide', async () => {
    const verifyGoogle = async (credential: string) => ({ sub: credential, email: `${credential}@gmail.com`, emailVerified: true, name: credential });
    await withServer({ googleClientId: 't', verifyGoogle, adminEmails: ['Jefa@gmail.com'] }, 'reports', async (url) => {
      const call = async (path: string, token?: string, body?: object) => {
        const r = await fetch(url + path, {
          method: body ? 'POST' : 'GET',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, json: (await r.json()) as any };
      };
      const login = async (who: string) => (await call('/api/auth/google', undefined, { credential: who })).json.token as string;
      const listed = async (id: string) => ((await call('/api/barbers')).json as { id: string }[]).some((b) => b.id === id);

      const owner = await login('reportado');
      const barber = (await call('/api/me/barber', owner, { name: 'Reportado', area: 'X' })).json;
      assert.equal((await call(`/api/barbers/${barber.id}/report`, owner, { reason: 'falso' })).status, 400, 'no a sí mismo');

      const a = await login('rep-a');
      assert.equal((await call(`/api/barbers/${barber.id}/report`, a, { reason: 'nada' })).json.error, 'Elige un motivo.');
      assert.equal((await call(`/api/barbers/${barber.id}/report`, a, { reason: 'otro' })).json.error, 'Cuéntanos qué pasó.');
      assert.equal((await call(`/api/barbers/${barber.id}/report`, a, { reason: 'fotos', details: 'Son de Instagram de otro' })).json.hidden, false);
      assert.equal((await call(`/api/barbers/${barber.id}/report`, a, { reason: 'falso' })).json.hidden, false, 'la misma persona no cuenta dos veces');
      const b = await login('rep-b');
      await call(`/api/barbers/${barber.id}/report`, b, { reason: 'falso' });
      assert.equal(await listed(barber.id), true, 'con 2 sigue');
      const c = await login('rep-c');
      assert.equal((await call(`/api/barbers/${barber.id}/report`, c, { reason: 'trato', details: 'Me gritó' })).json.hidden, true);
      assert.equal(await listed(barber.id), false, 'con 3 se oculta');
      assert.equal((await call('/api/me', owner)).json.hidden, true, 'el barbero lo sabe');

      // Solo el administrador ve la cola
      assert.equal((await call('/api/admin/reports', a)).status, 403);
      const admin = await login('jefa');
      assert.equal((await call('/api/me', admin)).json.isAdmin, true, 'correo sin importar mayúsculas');
      const queue = (await call('/api/admin/reports', admin)).json;
      assert.equal(queue[0].name, 'Reportado');
      assert.equal(queue[0].hidden, true);
      assert.equal(queue[0].reports.length, 3);
      assert.ok(queue[0].reports.some((r: { reason: string; details: string }) => r.reason === 'Mal trato o acoso' && r.details === 'Me gritó'));

      // Volver a mostrar: descarta los reportes
      await call(`/api/admin/barbers/${barber.id}/restore`, admin, {});
      assert.equal(await listed(barber.id), true);
      assert.equal((await call('/api/admin/reports', admin)).json.length, 0);

      // Ocultar a mano: queda oculto y en la lista como oculto sin reportes abiertos
      await call(`/api/admin/barbers/${barber.id}/hide`, admin, {});
      assert.equal(await listed(barber.id), false);
      const hiddenQueue = (await call('/api/admin/reports', admin)).json;
      assert.equal(hiddenQueue[0].hiddenBy, 'admin');
    });
  });

  it('sin cobro, las cuentas nuevas salen de una vez', async () => {
    const token = await session();
    const barber = (await api('/api/me/barber', { token, method: 'POST', body: { name: 'Gratis', area: 'X' } })).json;
    assert.equal((await api('/api/me', { token })).json.subscription.status, 'active');
    assert.ok(((await api('/api/barbers')).json as { id: string }[]).some((b) => b.id === barber.id));
    assert.equal((await api('/api/billing/checkout', { token, method: 'POST', body: {} })).status, 400);
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
    const withCut = (await api('/api/me/barber/services', { token: barberToken, method: 'POST', body: { name: 'Corte', price: 10, style: 'clasico' } })).json;
    const serviceId = withCut.services[0].id;
    const date = nextDate(barber.workDays);

    const client = await session();
    const booked = await api('/api/appointments', { token: client, method: 'POST', body: { barberId: barber.id, serviceId, date, start: 15 * 60 } });
    assert.equal(booked.status, 201);
    assert.equal(booked.json.status, 'pending');

    const other = await session();
    const clash = await api('/api/appointments', { token: other, method: 'POST', body: { barberId: barber.id, serviceId, date, start: 15 * 60 } });
    assert.equal(clash.status, 409);
    assert.equal(clash.json.error, 'Esa hora ya la tomaron. Prueba con otra.');

    const avail = await api(`/api/barbers/${barber.id}/availability?date=${date}`);
    assert.ok(!avail.json.slots.includes(15 * 60), 'las 3:00 ya no salen libres');

    assert.equal((await api(`/api/appointments/${booked.json.id}/confirm`, { token: client, method: 'POST' })).status, 403);
    const confirmed = await api(`/api/appointments/${booked.json.id}/confirm`, { token: barberToken, method: 'POST' });
    assert.equal(confirmed.json.status, 'confirmed');

    const agenda = await api('/api/me/agenda', { token: barberToken });
    assert.equal(agenda.json.length, 1);

    const cancelled = await api(`/api/appointments/${booked.json.id}/cancel`, { token: client, method: 'POST' });
    assert.equal(cancelled.json.status, 'cancelled');

    const again = await api('/api/appointments', { token: other, method: 'POST', body: { barberId: barber.id, serviceId, date, start: 15 * 60 } });
    assert.equal(again.status, 201, 'cancelar libera la hora');
  });

  it('horario real: horas por día, días libres y cortes que duran distinto', async () => {
    const token = await session();
    const barber = (await api('/api/me/barber', { token, method: 'POST', body: { name: 'Con Horario', area: 'Obarrio' } })).json;
    assert.deepEqual(barber.workDays, [2, 3, 4, 5, 6], 'de martes a sábado al crear la cuenta');

    const bad = await api('/api/me/barber', { token, method: 'PATCH', body: { weekly: [null, null, null, null, null, null, null] } });
    assert.equal(bad.json.error, 'Abre al menos un día.');
    const backwards = await api('/api/me/barber', { token, method: 'PATCH', body: { weekly: [null, { start: 600, end: 540 }, null, null, null, null, null] } });
    assert.equal(backwards.status, 400);

    // Solo lunes, de 9:00 a 11:00
    const weekly = [null, { start: 540, end: 660 }, null, null, null, null, null];
    const monday = nextDate([1]);
    const nextMonday = nextDate([1], 8);
    const set = await api('/api/me/barber', { token, method: 'PATCH', body: { weekly, daysOff: [nextMonday, '2000-01-01'] } });
    assert.deepEqual(set.json.weekly, weekly);
    assert.deepEqual(set.json.daysOff, [nextMonday], 'los días pasados se descartan');

    const add = async (name: string, durationMin?: number) =>
      (await api('/api/me/barber/services', { token, method: 'POST', body: { name, price: 10, style: 'fade', durationMin } })).json;
    assert.equal((await api('/api/me/barber/services', { token, method: 'POST', body: { name: 'Raro', price: 10, style: 'fade', durationMin: 7 } })).status, 400);
    await add('Fade');
    const withBraids = await add('Trenzas', 90);
    const fade = withBraids.services[0];
    const braids = withBraids.services[1];
    assert.equal(fade.durationMin, 30, '30 min si no dice');
    assert.equal(braids.durationMin, 90);

    const slots = async (serviceId: string, date = monday) =>
      (await api(`/api/barbers/${barber.id}/availability?date=${date}&serviceId=${serviceId}`)).json.slots;
    assert.deepEqual(await slots(fade.id), [540, 570, 600, 630], 'fade: 9:00 a 10:30');
    assert.deepEqual(await slots(braids.id), [540, 570], 'trenzas de 1 h 30: hasta las 9:30');
    assert.deepEqual(await slots(fade.id, nextMonday), [], 'día libre');

    const client = await session();
    const book = (serviceId: string, start: number, date = monday) =>
      api('/api/appointments', { token: client, method: 'POST', body: { barberId: barber.id, serviceId, date, start } });
    const first = await book(braids.id, 540);
    assert.equal(first.status, 201);
    assert.equal(first.json.durationMin, 90);
    assert.deepEqual(await slots(fade.id), [630], 'las trenzas ocupan de 9:00 a 10:30');
    assert.equal((await book(fade.id, 600)).status, 409, 'se cruza con las trenzas');
    assert.equal((await book(fade.id, 645)).json.error, 'Esa hora está fuera de su horario.', '10:45 + 30 min pasa de las 11:00');
    assert.equal((await book(fade.id, 660)).json.error, 'Esa hora está fuera de su horario.');
    assert.equal((await book(fade.id, 600, nextMonday)).json.error, 'Ese día el barbero no atiende.');
    assert.equal((await book(fade.id, 630)).status, 201);
  });

  it('no deja apartar un día que el barbero no atiende', async () => {
    const client = await session();
    const date = nextDate([1]); // lunes: Carlos M. atiende de martes a sábado
    const res = await api('/api/appointments', {
      token: client,
      method: 'POST',
      body: { barberId: 'carlos-m', serviceId: 'carlos-m-0', date, start: 10 * 60 },
    });
    assert.equal(res.status, 400);
  });
});
