import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { transaction, type DB } from './db.js';
import { burnTime, hashPassword, verifyPassword } from './passwords.js';
import {
  freeSlots,
  hoursOn,
  isOpenNow,
  isValidDate as isValidDay,
  nowIn,
  parseDaysOff,
  parseDuration,
  parseWeekly,
  ScheduleError,
  type Weekly,
} from './schedule.js';
import { matches, STYLE_ORDER, STYLES } from './search.js';
import { createTrending } from './trending.js';

/*
 * API de Filo.
 * Identidad: la persona entra con Google (POST /api/auth/google). El servidor verifica el token
 * de Google y entrega un token de sesión propio, que la app manda como `Authorization: Bearer <token>`.
 */

export type GoogleProfile = { sub: string; email?: string; emailVerified?: boolean; name?: string; picture?: string };

export type AppOptions = {
  db: DB;
  uploadDir: string;
  /* Zona horaria del negocio: define qué es "hoy" y qué horas ya pasaron. */
  timeZone?: string;
  /* Carpeta con la app compilada (dist). Si existe, se sirve en la misma dirección. */
  staticDir?: string;
  /* ID de cliente OAuth de Google (Google Cloud Console → Credenciales). Sin él, no se puede entrar con Google. */
  googleClientId?: string;
  /* Solo desarrollo: permite entrar con un nombre, sin Google. */
  devLogin?: boolean;
  /* Servicio de rutas compatible con OSRM. Por defecto, el gratuito de OpenStreetMap (FOSSGIS). */
  routingUrl?: string;
  /* Reemplazable en pruebas. */
  fetchImpl?: typeof fetch;
  /* Cuántas personas distintas deben buscar una palabra para que salga como píldora. */
  trendingMinUsers?: number;
  /* Detrás de un proxy (Nginx, Cloudflare, el del hosting): usar la IP real del cliente para limitar intentos. */
  trustProxy?: boolean;
  /* Verifica el token de Google; reemplazable en pruebas. */
  verifyGoogle?: (credential: string) => Promise<GoogleProfile>;
};

/* Una sesión sin uso en este tiempo deja de valer. */
const SESSION_IDLE_MS = 180 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

const SPECIALTIES = STYLES;
const SPECIALTY_ORDER = STYLE_ORDER;

const PHOTO_TYPES: Record<string, { ext: string; magic: number[] }> = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
};
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/* Error con código HTTP y un mensaje que se le puede mostrar a la persona. */
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Row = Record<string, unknown>;
type AuthedRequest = Request & { userId?: string };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/* Express 4 no atrapa errores de funciones async: los pasamos a `next`. */
const handle =
  (fn: (req: AuthedRequest, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) =>
    fn(req, res).catch(next);

function googleVerifier(clientId: string) {
  const client = new OAuth2Client(clientId);
  return async (credential: string): Promise<GoogleProfile> => {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const p = ticket.getPayload();
    if (!p?.sub) throw new Error('Token de Google sin usuario');
    return { sub: p.sub, email: p.email, emailVerified: p.email_verified, name: p.name, picture: p.picture };
  };
}

/* --- Validación de entradas --- */

function emailAddress(value: unknown): string {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254) throw new HttpError(400, 'Escribe un correo válido.');
  return v;
}

const PASSWORD_MIN = 8;
function newPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN) {
    throw new HttpError(400, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
  }
  if (value.length > 128) throw new HttpError(400, 'La contraseña es muy larga (máximo 128).');
  return value;
}

/* Límite de intentos fallidos de contraseña por IP y correo. */
function attemptLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; until: number }>();
  return {
    blocked(key: string) {
      const h = hits.get(key);
      if (h && h.until < Date.now()) hits.delete(key);
      return (hits.get(key)?.count ?? 0) >= max;
    },
    fail(key: string) {
      const h = hits.get(key);
      if (!h || h.until < Date.now()) hits.set(key, { count: 1, until: Date.now() + windowMs });
      else h.count++;
      if (hits.size > 10_000) hits.clear();
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}

function text(value: unknown, field: string, { max = 80, required = true } = {}): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new HttpError(400, `Falta ${field}.`);
  const v = value.trim();
  if (required && !v) throw new HttpError(400, `Falta ${field}.`);
  if (v.length > max) throw new HttpError(400, `${field[0].toUpperCase()}${field.slice(1)} es muy largo (máximo ${max}).`);
  return v;
}

function price(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value >= 1000) {
    throw new HttpError(400, 'Escribe el precio en dólares, como 12 o 12.50.');
  }
  return Math.round(value * 100);
}

/* {lat, lng} con ~1 m de precisión, o null para quitar la ubicación. */
function coordinates(value: unknown): { lat: number; lng: number } | null {
  if (value == null) return null;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'Ubicación no válida.');
  }
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  return { lat: round(lat), lng: round(lng) };
}

function tagList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((t) => typeof t !== 'string' || !(t in SPECIALTIES))) {
    throw new HttpError(400, 'Especialidad desconocida.');
  }
  return SPECIALTY_ORDER.filter((t) => value.includes(t));
}

/* --- Forma de los datos que ve la app --- */

function toService(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    price: row.price_cents == null ? null : (row.price_cents as number) / 100,
    photo: (row.photo as string | null) ?? undefined,
    style: (row.style as string | null) ?? null,
    durationMin: (row.duration_min as number | null) ?? 30,
  };
}

const isValidDate = (date: unknown): date is string => typeof date === 'string' && isValidDay(date);

/* Martes a sábado, de 9:00 a 5:00, para quien recién crea su cuenta. */
const DEFAULT_WEEKLY: Weekly = [null, null, ...Array.from({ length: 5 }, () => ({ start: 9 * 60, end: 17 * 60 }))];

/* Lo que cambia con la hora: si está abierto ahora y si le queda algún hueco hoy. */
type Live = { openNow: boolean; freeToday: boolean };

/* El tipo de corte: uno de STYLES. */
function cutStyle(value: unknown): string {
  if (typeof value !== 'string' || !(value in STYLES)) throw new HttpError(400, 'Elige el tipo de corte.');
  return value;
}

function toBarber(row: Row, services: Row[], live: Live) {
  const tags = JSON.parse(row.tags as string) as string[];
  const mapped = services.map(toService);
  const weekly = JSON.parse(row.weekly as string) as Weekly;
  return {
    id: row.id as string,
    name: row.name as string,
    area: row.area as string,
    bio: row.bio as string,
    tags,
    specialties: tags.map((t) => SPECIALTIES[t]),
    rating: row.rating as number | null,
    freeToday: live.freeToday,
    openNow: live.openNow,
    weekly,
    daysOff: JSON.parse(row.days_off as string) as string[],
    /* Los días de la semana que atiende (atajo de `weekly`). */
    workDays: weekly.flatMap((d, i) => (d ? [i] : [])),
    avatar: (row.avatar as string | null) ?? undefined,
    cover: (row.cover as string | null) ?? undefined,
    photoCount: mapped.filter((s) => s.photo).length,
    services: mapped,
    location: row.lat == null || row.lng == null ? null : { lat: row.lat as number, lng: row.lng as number },
  };
}

function toAppointment(row: Row) {
  return {
    id: row.id as string,
    barberId: row.barber_id as string,
    barberName: row.barber_name as string,
    serviceId: row.service_id as string,
    serviceName: row.service_name as string,
    date: row.date as string,
    startMin: row.start_min as number,
    durationMin: row.duration_min as number,
    status: row.status as 'pending' | 'confirmed' | 'cancelled',
    createdAt: row.created_at as number,
  };
}

export function createApp({
  db,
  uploadDir,
  timeZone = 'America/Panama',
  staticDir,
  googleClientId,
  devLogin = false,
  trustProxy = false,
  trendingMinUsers = 3,
  routingUrl = 'https://routing.openstreetmap.de',
  fetchImpl = fetch,
  verifyGoogle = googleClientId ? googleVerifier(googleClientId) : undefined,
}: AppOptions) {
  mkdirSync(uploadDir, { recursive: true });

  const q = {
    session: db.prepare('SELECT user_id, last_seen FROM sessions WHERE token_hash = ?'),
    touchSession: db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    user: db.prepare('SELECT id, email, name, picture FROM users WHERE id = ?'),
    userByGoogle: db.prepare('SELECT id FROM users WHERE google_sub = ?'),
    userByEmail: db.prepare('SELECT id, google_sub, password_hash FROM users WHERE email = ? COLLATE NOCASE'),
    barbers: db.prepare('SELECT * FROM barbers ORDER BY created_at'),
    barber: db.prepare('SELECT * FROM barbers WHERE id = ?'),
    barberByOwner: db.prepare('SELECT * FROM barbers WHERE owner_id = ?'),
    servicesOf: db.prepare('SELECT * FROM services WHERE barber_id = ? ORDER BY position'),
    allServices: db.prepare('SELECT * FROM services ORDER BY barber_id, position'),
    service: db.prepare('SELECT * FROM services WHERE id = ? AND barber_id = ?'),
    photoOwner: db.prepare('SELECT owner_id FROM photos WHERE name = ?'),
    busyOn: db.prepare(
      `SELECT start_min AS start, start_min + duration_min AS "end" FROM appointments WHERE barber_id = ? AND date = ? AND status != 'cancelled'`,
    ),
    busyAll: db.prepare(
      `SELECT barber_id, start_min AS start, start_min + duration_min AS "end" FROM appointments WHERE date = ? AND status != 'cancelled'`,
    ),
    appointment: db.prepare('SELECT a.*, b.name AS barber_name, b.owner_id FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE a.id = ?'),
    clientAppointments: db.prepare(
      'SELECT a.*, b.name AS barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE a.client_id = ? ORDER BY a.date, a.start_min',
    ),
    barberAppointments: db.prepare(
      `SELECT a.*, b.name AS barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id
       WHERE a.barber_id = ? AND a.date >= ? ORDER BY a.date, a.start_min`,
    ),
  };

  /* Abierto ahora y hueco libre hoy (para el corte más corto que ofrece). */
  const liveStatus = (row: Row, services: Row[], busyToday: { start: number; end: number }[]): Live => {
    const now = nowIn(timeZone);
    const weekly = JSON.parse(row.weekly as string) as Weekly;
    const daysOff = JSON.parse(row.days_off as string) as string[];
    const shortest = Math.min(30, ...services.map((s) => (s.duration_min as number | null) ?? 30));
    return {
      openNow: isOpenNow(weekly, daysOff, now),
      freeToday: freeSlots({ weekly, daysOff, date: now.date, duration: shortest, busy: busyToday, now }).length > 0,
    };
  };

  const loadBarber = (row: Row | undefined) => {
    if (!row) return null;
    const services = q.servicesOf.all(row.id as string) as Row[];
    const busy = q.busyOn.all(row.id as string, nowIn(timeZone).date) as { start: number; end: number }[];
    return toBarber(row, services, liveStatus(row, services, busy));
  };

  /* Todos los barberos de una vez (para listas): una consulta de servicios y una de citas de hoy. */
  const loadAllBarbers = () => {
    const byBarber = new Map<string, Row[]>();
    for (const s of q.allServices.all() as Row[]) {
      const list = byBarber.get(s.barber_id as string) ?? [];
      list.push(s);
      byBarber.set(s.barber_id as string, list);
    }
    const busy = new Map<string, { start: number; end: number }[]>();
    for (const b of q.busyAll.all(nowIn(timeZone).date) as { barber_id: string; start: number; end: number }[]) {
      busy.set(b.barber_id, [...(busy.get(b.barber_id) ?? []), b]);
    }
    return (q.barbers.all() as Row[]).map((b) => {
      const services = byBarber.get(b.id as string) ?? [];
      return toBarber(b, services, liveStatus(b, services, busy.get(b.id as string) ?? []));
    });
  };

  /* Borra del disco una foto subida que ya no se usa. */
  const dropPhoto = (url: unknown) => {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
    const name = url.slice('/uploads/'.length);
    db.prepare('DELETE FROM photos WHERE name = ?').run(name);
    try {
      unlinkSync(join(uploadDir, name));
    } catch {
      /* ya no estaba */
    }
  };

  /* Una foto solo se puede usar si la subió esta misma persona. */
  const ownPhoto = (value: unknown, userId: string): string | null => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^\/uploads\/[\w-]+\.(jpg|png|webp)$/.test(value)) {
      throw new HttpError(400, 'Foto no válida.');
    }
    const row = q.photoOwner.get(value.slice('/uploads/'.length)) as Row | undefined;
    if (row?.owner_id !== userId) throw new HttpError(400, 'Foto no válida.');
    return value;
  };

  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use('/api', express.json({ limit: '100kb' }));

  /* --- Autenticación --- */

  const bearer = (req: Request) => {
    const header = req.get('authorization') ?? '';
    return header.startsWith('Bearer ') ? header.slice(7) : '';
  };

  const auth = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const token = bearer(req);
    const hash = token ? hashToken(token) : '';
    const row = hash ? (q.session.get(hash) as Row | undefined) : undefined;
    const now = Date.now();
    if (!row || now - (row.last_seen as number) > SESSION_IDLE_MS) {
      if (row) q.deleteSession.run(hash);
      return next(new HttpError(401, 'Entra con tu cuenta para seguir.'));
    }
    if (now - (row.last_seen as number) > TOUCH_EVERY_MS) q.touchSession.run(now, hash);
    req.userId = row.user_id as string;
    next();
  };

  const toUser = (id: string) => {
    const u = q.user.get(id) as Row;
    return { id, email: u.email as string | null, name: u.name as string | null, picture: u.picture as string | null };
  };

  const openSession = (userId: string) => {
    const now = Date.now();
    const token = randomBytes(32).toString('base64url');
    q.insertSession.run(hashToken(token), userId, now, now);
    return { token, user: toUser(userId) };
  };

  /*
   * Crea o actualiza la persona según su cuenta de Google y le abre una sesión.
   * Si ya existe una cuenta con contraseña y ese mismo correo, y Google confirma que el correo
   * es suyo, se unen: desde ahí entra de las dos formas.
   */
  const signIn = (profile: GoogleProfile) => {
    const email = profile.email?.toLowerCase() ?? null;
    const userId = transaction(db, () => {
      const existing = q.userByGoogle.get(profile.sub) as Row | undefined;
      if (existing) {
        const id = existing.id as string;
        const taken = email ? (q.userByEmail.get(email) as Row | undefined) : undefined;
        db.prepare('UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?').run(
          taken && taken.id !== id ? (q.user.get(id) as Row).email as string | null : email,
          profile.name ?? null, profile.picture ?? null, id,
        );
        return id;
      }
      const byEmail = email ? (q.userByEmail.get(email) as Row | undefined) : undefined;
      if (byEmail) {
        if (!profile.emailVerified || byEmail.google_sub) {
          throw new HttpError(409, 'Ya hay una cuenta con ese correo. Entra con tu correo y contraseña.');
        }
        db.prepare('UPDATE users SET google_sub = ?, picture = COALESCE(picture, ?) WHERE id = ?').run(
          profile.sub, profile.picture ?? null, byEmail.id as string,
        );
        return byEmail.id as string;
      }
      const id = randomUUID();
      db.prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, profile.sub, email, profile.name ?? null, profile.picture ?? null, Date.now(),
      );
      return id;
    });
    return openSession(userId);
  };

  const myBarberRow = (userId: string) => {
    const row = q.barberByOwner.get(userId) as Row | undefined;
    if (!row) throw new HttpError(404, 'Todavía no tienes cuenta de barbero.');
    return row;
  };

  /* Lo que la app necesita saber para mostrar el inicio de sesión. */
  app.get('/api/config', (_req, res) => {
    res.json({ googleClientId: googleClientId ?? null, devLogin });
  });

  app.post(
    '/api/auth/google',
    handle(async (req, res) => {
      if (!verifyGoogle) throw new HttpError(503, 'El inicio con Google todavía no está configurado.');
      const credential = req.body?.credential;
      if (typeof credential !== 'string' || !credential) throw new HttpError(400, 'Falta la credencial de Google.');
      let profile: GoogleProfile;
      try {
        profile = await verifyGoogle(credential);
      } catch {
        throw new HttpError(401, 'Google no confirmó tu cuenta. Prueba otra vez.');
      }
      res.status(201).json(signIn(profile));
    }),
  );

  if (devLogin) {
    app.post('/api/auth/dev', (req, res) => {
      const name = text(req.body?.name, 'tu nombre', { max: 40 });
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      res.status(201).json(signIn({ sub: `dev:${slug}`, name, email: `${slug}@prueba.local` }));
    });
  }

  /* --- Correo y contraseña --- */

  const limiter = attemptLimiter(8, 15 * 60 * 1000);

  app.post(
    '/api/auth/register',
    handle(async (req, res) => {
      const name = text(req.body?.name, 'tu nombre', { max: 60 });
      const email = emailAddress(req.body?.email);
      const password = newPassword(req.body?.password);
      const existing = q.userByEmail.get(email) as Row | undefined;
      if (existing) {
        throw new HttpError(
          409,
          existing.password_hash
            ? 'Ya hay una cuenta con ese correo. Entra con tu contraseña.'
            : 'Ese correo ya entra con Google. Usa “Continuar con Google”.',
        );
      }
      const hash = await hashPassword(password);
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
          id, email, name, hash, Date.now(),
        );
      } catch (err) {
        if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Ya hay una cuenta con ese correo. Entra con tu contraseña.');
        throw err;
      }
      res.status(201).json(openSession(id));
    }),
  );

  app.post(
    '/api/auth/login',
    handle(async (req, res) => {
      const email = emailAddress(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const key = `${req.ip}|${email}`;
      if (limiter.blocked(key)) {
        throw new HttpError(429, 'Demasiados intentos. Espera unos minutos y prueba otra vez.');
      }
      const user = q.userByEmail.get(email) as Row | undefined;
      const ok = user?.password_hash
        ? await verifyPassword(password, user.password_hash as string)
        : (await burnTime(password), false);
      if (!ok || !user) {
        limiter.fail(key);
        throw new HttpError(
          401,
          user && !user.password_hash
            ? 'Ese correo entra con Google. Usa “Continuar con Google”.'
            : 'Correo o contraseña incorrectos.',
        );
      }
      limiter.reset(key);
      res.status(201).json(openSession(user.id as string));
    }),
  );

  app.post('/api/auth/logout', (req, res) => {
    const token = bearer(req);
    if (token) q.deleteSession.run(hashToken(token));
    res.json({ ok: true });
  });

  /* --- Público: barberos y disponibilidad --- */

  app.get('/api/barbers', (_req, res) => {
    res.json(loadAllBarbers());
  });

  app.get('/api/barbers/:id', (req, res) => {
    const barber = loadBarber(q.barber.get(req.params.id) as Row | undefined);
    if (!barber) throw new HttpError(404, 'Ese barbero ya no existe.');
    res.json(barber);
  });

  /*
   * Ruta para "Cómo llegar". Pasa por aquí (y no directo desde el teléfono) para guardar en caché,
   * limitar el uso del servicio gratuito y poder cambiar de proveedor sin tocar la app.
   */
  const routeCache = new Map<string, { at: number; body: unknown }>();
  const routeLimiter = attemptLimiter(30, 60 * 1000);

  app.get(
    '/api/route',
    auth,
    handle(async (req, res) => {
      const parse = (v: unknown) => {
        const [lat, lng] = String(v ?? '').split(',').map(Number);
        return coordinates({ lat, lng });
      };
      const from = parse(req.query.from);
      const to = parse(req.query.to);
      if (!from || !to) throw new HttpError(400, 'Ubicación no válida.');
      const mode = req.query.mode === 'foot' ? 'foot' : 'car';

      const round = (n: number) => n.toFixed(4); // ~10 m: rutas casi iguales comparten caché
      const key = `${mode}|${round(from.lat)},${round(from.lng)}|${round(to.lat)},${round(to.lng)}`;
      const cached = routeCache.get(key);
      if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
        res.json(cached.body);
        return;
      }

      const limitKey = `route|${req.userId}`;
      if (routeLimiter.blocked(limitKey)) throw new HttpError(429, 'Muchas rutas seguidas. Espera un momento.');
      routeLimiter.fail(limitKey);

      const url = `${routingUrl}/routed-${mode}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      let data: { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      try {
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Filo (barberos)' } });
        data = (await r.json()) as typeof data;
      } catch {
        throw new HttpError(502, 'No pudimos trazar la ruta. Prueba otra vez.');
      }
      const best = data.code === 'Ok' ? data.routes?.[0] : undefined;
      if (!best) throw new HttpError(404, 'No encontramos una ruta hasta ahí.');

      const body = {
        mode,
        distanceM: Math.round(best.distance),
        durationS: Math.round(best.duration),
        path: best.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      };
      if (routeCache.size > 500) routeCache.clear();
      routeCache.set(key, { at: Date.now(), body });
      res.json(body);
    }),
  );

  /* Horas libres para un corte (su duración manda) en un día. */
  const slotsFor = (barber: Row, date: string, duration: number) =>
    freeSlots({
      weekly: JSON.parse(barber.weekly as string),
      daysOff: JSON.parse(barber.days_off as string),
      date,
      duration,
      busy: q.busyOn.all(barber.id as string, date) as { start: number; end: number }[],
      now: nowIn(timeZone),
    });

  app.get('/api/barbers/:id/availability', (req, res) => {
    const row = q.barber.get(req.params.id) as Row | undefined;
    if (!row) throw new HttpError(404, 'Ese barbero ya no existe.');
    const date = req.query.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Fecha no válida.');
    const service = req.query.serviceId ? (q.service.get(String(req.query.serviceId), row.id as string) as Row | undefined) : undefined;
    const duration = (service?.duration_min as number | undefined) ?? 30;
    res.json({ date, duration, slots: slotsFor(row, date, duration) });
  });

  /* --- Mi cuenta --- */

  app.get('/api/me', auth, (req: AuthedRequest, res) => {
    res.json({ user: toUser(req.userId!), barber: loadBarber(q.barberByOwner.get(req.userId!) as Row | undefined) });
  });

  app.post('/api/me/barber', auth, (req: AuthedRequest, res) => {
    if (q.barberByOwner.get(req.userId!)) throw new HttpError(409, 'Ya tienes cuenta de barbero.');
    const name = text(req.body?.name, 'tu nombre o el de tu barbería');
    const area = text(req.body?.area, 'el barrio donde atiendes');
    const id = `b-${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    // TODO: cobrar la suscripción ($3.99/mes) antes de crear la cuenta.
    db.prepare(
      `INSERT INTO barbers (id, owner_id, name, area, weekly, map_x, map_y, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    ).run(id, req.userId!, name, area, JSON.stringify(DEFAULT_WEEKLY), now, now);
    res.status(201).json(loadBarber(q.barber.get(id) as Row));
  });

  app.patch('/api/me/barber', auth, (req: AuthedRequest, res) => {
    const row = myBarberRow(req.userId!);
    const body = req.body ?? {};
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };
    const replaced: unknown[] = [];

    if ('name' in body) set('name', text(body.name, 'tu nombre o el de tu barbería'));
    if ('area' in body) set('area', text(body.area, 'el barrio donde atiendes'));
    if ('bio' in body) set('bio', text(body.bio, 'la descripción', { max: 240, required: false }));
    if ('tags' in body) set('tags', JSON.stringify(tagList(body.tags)));
    if ('weekly' in body) set('weekly', JSON.stringify(parseWeekly(body.weekly)));
    if ('daysOff' in body) set('days_off', JSON.stringify(parseDaysOff(body.daysOff, nowIn(timeZone).date)));
    if ('location' in body) {
      const at = coordinates(body.location);
      set('lat', at?.lat ?? null);
      set('lng', at?.lng ?? null);
    }
    for (const key of ['avatar', 'cover'] as const) {
      if (!(key in body)) continue;
      const next = ownPhoto(body[key], req.userId!);
      if (next !== row[key]) replaced.push(row[key]);
      set(key, next);
    }

    if (sets.length) {
      set('updated_at', Date.now());
      db.prepare(`UPDATE barbers SET ${sets.join(', ')} WHERE id = ?`).run(...values, row.id as string);
      replaced.forEach(dropPhoto);
    }
    res.json(loadBarber(q.barber.get(row.id as string) as Row));
  });

  /* --- Cortes (servicios) del barbero --- */

  app.post('/api/me/barber/services', auth, (req: AuthedRequest, res) => {
    const row = myBarberRow(req.userId!);
    const name = text(req.body?.name, 'el nombre del corte', { max: 40 });
    const cents = price(req.body?.price);
    const photo = ownPhoto(req.body?.photo, req.userId!);
    const style = cutStyle(req.body?.style);
    const duration = parseDuration(req.body?.durationMin);
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM services WHERE barber_id = ?').get(row.id as string) as Row;
    db.prepare(
      'INSERT INTO services (id, barber_id, name, price_cents, photo, style, duration_min, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(randomUUID(), row.id as string, name, cents, photo, style, duration, pos.p as number, Date.now());
    res.status(201).json(loadBarber(q.barber.get(row.id as string) as Row));
  });

  app.patch('/api/me/barber/services/:serviceId', auth, (req: AuthedRequest, res) => {
    const row = myBarberRow(req.userId!);
    const service = q.service.get(req.params.serviceId, row.id as string) as Row | undefined;
    if (!service) throw new HttpError(404, 'Ese corte ya no existe.');
    const name = text(req.body?.name, 'el nombre del corte', { max: 40 });
    const cents = price(req.body?.price);
    const photo = ownPhoto(req.body?.photo, req.userId!);
    const style = cutStyle(req.body?.style);
    const duration = parseDuration(req.body?.durationMin);
    db.prepare('UPDATE services SET name = ?, price_cents = ?, photo = ?, style = ?, duration_min = ? WHERE id = ?').run(
      name, cents, photo, style, duration, service.id as string,
    );
    if (photo !== service.photo) dropPhoto(service.photo);
    res.json(loadBarber(q.barber.get(row.id as string) as Row));
  });

  app.delete('/api/me/barber/services/:serviceId', auth, (req: AuthedRequest, res) => {
    const row = myBarberRow(req.userId!);
    const service = q.service.get(req.params.serviceId, row.id as string) as Row | undefined;
    if (!service) throw new HttpError(404, 'Ese corte ya no existe.');
    db.prepare('DELETE FROM services WHERE id = ?').run(service.id as string);
    dropPhoto(service.photo);
    res.json(loadBarber(q.barber.get(row.id as string) as Row));
  });

  const allCuts = db.prepare(
    `SELECT s.*, b.name AS barber_name, b.area, b.tags, b.lat, b.lng, b.rating, b.free_today, b.avatar
     FROM services s JOIN barbers b ON b.id = s.barber_id`,
  );

  /*
   * Muro de cortes: los cortes de todos los barberos, para buscar por estilo ("trenzas", "alisado",
   * "pintado") y bajar sin fin. Con `near`, los más cercanos primero; si no, los más recientes.
   * Filtra en memoria: sirve bien hasta unos miles de cortes; más allá, conviene un índice de búsqueda.
   */
  app.get('/api/cuts', auth, (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
    const style = typeof req.query.style === 'string' && req.query.style in STYLES ? req.query.style : null;
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [nearLat, nearLng] = String(req.query.near ?? '').split(',').map(Number);
    const near = Number.isFinite(nearLat) && Number.isFinite(nearLng) ? { lat: nearLat, lng: nearLng } : null;

    const rows = allCuts.all() as Row[];
    const freeToday = new Map(loadAllBarbers().map((b) => [b.id, b.freeToday]));

    const km = (r: Row) => {
      if (!near || r.lat == null) return Infinity;
      const rad = Math.PI / 180;
      const x = ((r.lng as number) - near.lng) * Math.cos(((r.lat as number) + near.lat) * 0.5 * rad);
      const y = (r.lat as number) - near.lat;
      return Math.sqrt(x * x + y * y) * 111.32;
    };

    const found = rows
      .filter((r) => !style || r.style === style)
      .filter((r) =>
        matches(
          {
            cutName: r.name as string,
            style: r.style as string | null,
            barberName: r.barber_name as string,
            area: r.area as string,
            barberTags: JSON.parse(r.tags as string),
          },
          query,
        ),
      )
      .map((r) => ({ r, km: km(r) }))
      /* Con foto primero (es un muro de fotos); luego cercanía o lo más nuevo. */
      .sort((a, b) =>
        Number(!a.r.photo) - Number(!b.r.photo) ||
        (near ? a.km - b.km : 0) ||
        ((b.r.created_at as number) ?? 0) - ((a.r.created_at as number) ?? 0),
      );

    const page = found.slice(offset, offset + limit).map(({ r, km }) => ({
      ...toService(r),
      styleLabel: r.style ? STYLES[r.style as string] : null,
      distanceKm: Number.isFinite(km) ? Math.round(km * 10) / 10 : null,
      barber: {
        id: r.barber_id as string,
        name: r.barber_name as string,
        area: r.area as string,
        rating: r.rating as number | null,
        freeToday: freeToday.get(r.barber_id as string) ?? false,
        avatar: (r.avatar as string | null) ?? undefined,
      },
    }));
    res.json({ items: page, total: found.length, nextOffset: offset + limit < found.length ? offset + limit : null });
  });

  /* --- Píldoras según lo que más se busca en la zona --- */

  const trending = createTrending(db, { minUsers: trendingMinUsers });
  const parseNear = (v: unknown) => {
    const [lat, lng] = String(v ?? '').split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  };

  /* La app avisa cuando alguien terminó de escribir una búsqueda (no en cada letra). */
  app.post('/api/searches', auth, (req: AuthedRequest, res) => {
    const q = typeof req.body?.q === 'string' ? req.body.q.slice(0, 80) : '';
    const near = req.body?.near ? coordinates(req.body.near) : null;
    /* Cuenta solo si encuentra algún corte o barbero: así no se cuelan palabras sin sentido. */
    const useful = (term: string) =>
      (allCuts.all() as Row[]).some((r) =>
        matches(
          { cutName: r.name as string, style: r.style as string | null, barberName: r.barber_name as string, area: r.area as string, barberTags: JSON.parse(r.tags as string) },
          term,
        ),
      );
    res.json({ counted: trending.record(req.userId!, q, near, useful) });
  });

  app.get('/api/trending', auth, (req, res) => {
    res.json(trending.pills(parseNear(req.query.near)));
  });

  app.get('/api/me/agenda', auth, (req: AuthedRequest, res) => {
    const row = myBarberRow(req.userId!);
    res.json((q.barberAppointments.all(row.id as string, nowIn(timeZone).date) as Row[]).map(toAppointment));
  });

  /* --- Fotos --- */

  app.post(
    '/api/photos',
    auth,
    express.raw({ type: Object.keys(PHOTO_TYPES), limit: MAX_PHOTO_BYTES }),
    (req: AuthedRequest, res) => {
      const type = PHOTO_TYPES[req.get('content-type')?.split(';')[0] ?? ''];
      const body = req.body as Buffer;
      if (!type || !Buffer.isBuffer(body) || !type.magic.every((byte, i) => body[i] === byte)) {
        throw new HttpError(415, 'Ese archivo no es una foto.');
      }
      const name = `${randomUUID()}.${type.ext}`;
      writeFileSync(join(uploadDir, name), body);
      db.prepare('INSERT INTO photos (name, owner_id, created_at) VALUES (?, ?, ?)').run(name, req.userId!, Date.now());
      res.status(201).json({ url: `/uploads/${name}` });
    },
  );

  app.use('/uploads', express.static(uploadDir, { immutable: true, maxAge: '365d', index: false }));

  /* --- Citas --- */

  app.get('/api/appointments', auth, (req: AuthedRequest, res) => {
    res.json((q.clientAppointments.all(req.userId!) as Row[]).map(toAppointment));
  });

  app.post('/api/appointments', auth, (req: AuthedRequest, res) => {
    const { barberId, serviceId, date, start } = req.body ?? {};
    const barber = q.barber.get(String(barberId)) as Row | undefined;
    if (!barber) throw new HttpError(404, 'Ese barbero ya no existe.');
    const service = q.service.get(String(serviceId), barber.id as string) as Row | undefined;
    if (!service) throw new HttpError(400, 'Elige un servicio.');
    if (!isValidDate(date)) throw new HttpError(400, 'Elige un día.');
    if (!Number.isInteger(start)) throw new HttpError(400, 'Elige una hora.');
    const duration = (service.duration_min as number | null) ?? 30;
    const day = hoursOn(JSON.parse(barber.weekly as string), JSON.parse(barber.days_off as string), date);
    if (!day) throw new HttpError(400, 'Ese día el barbero no atiende.');
    if (start < day.start || start + duration > day.end) throw new HttpError(400, 'Esa hora está fuera de su horario.');
    const now = nowIn(timeZone);
    if (date < now.date || (date === now.date && start <= now.minutes)) {
      throw new HttpError(400, 'Esa hora ya pasó. Prueba con otra.');
    }

    /* Revisar y guardar juntos: nadie puede tomar la misma hora en medio. */
    const id = randomUUID();
    transaction(db, () => {
      if (!slotsFor(barber, date, duration).includes(start)) {
        throw new HttpError(409, 'Esa hora ya la tomaron. Prueba con otra.');
      }
      db.prepare(
        `INSERT INTO appointments (id, barber_id, service_id, service_name, client_id, date, hour, start_min, duration_min, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(id, barber.id as string, service.id as string, service.name as string, req.userId!, date, Math.floor(start / 60), start, duration, Date.now());
    });
    res.status(201).json(toAppointment(q.appointment.get(id) as Row));
  });

  /* El cliente cancela la suya; el barbero cancela o confirma las de su agenda. */
  const changeStatus = (status: 'confirmed' | 'cancelled') => (req: AuthedRequest, res: Response) => {
    const appt = transaction(db, () => {
      const row = q.appointment.get(req.params.id) as Row | undefined;
      if (!row) throw new HttpError(404, 'Esa cita ya no existe.');
      const isBarber = row.owner_id === req.userId;
      const isClient = row.client_id === req.userId;
      if (status === 'confirmed' ? !isBarber : !isBarber && !isClient) {
        throw new HttpError(403, 'Esa cita no es tuya.');
      }
      if (row.status === 'cancelled') throw new HttpError(409, 'Esa cita ya estaba cancelada.');
      db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, row.id as string);
      return q.appointment.get(row.id as string) as Row;
    });
    res.json(toAppointment(appt));
  };

  app.post('/api/appointments/:id/confirm', auth, changeStatus('confirmed'));
  app.post('/api/appointments/:id/cancel', auth, changeStatus('cancelled'));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'No existe.')));

  /* --- La app (producción) --- */

  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false }));
    app.get('*', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  /* --- Errores --- */

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ScheduleError) return res.status(400).json({ error: err.message });
    const status = (err as { status?: number }).status;
    if (status === 413) return res.status(413).json({ error: 'La foto es muy pesada.' });
    if (status === 400) return res.status(400).json({ error: 'Datos no válidos.' });
    console.error(err);
    res.status(500).json({ error: 'Algo falló de nuestro lado. Prueba otra vez.' });
  });

  return app;
}
