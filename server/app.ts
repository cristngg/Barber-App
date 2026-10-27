import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { transaction, type DB } from './db.js';
import { burnTime, hashPassword, verifyPassword } from './passwords.js';

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
  /* Detrás de un proxy (Nginx, Cloudflare, el del hosting): usar la IP real del cliente para limitar intentos. */
  trustProxy?: boolean;
  /* Verifica el token de Google; reemplazable en pruebas. */
  verifyGoogle?: (credential: string) => Promise<GoogleProfile>;
};

/* Una sesión sin uso en este tiempo deja de valer. */
const SESSION_IDLE_MS = 180 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

const SPECIALTIES: Record<string, string> = {
  fade: 'Fade',
  barba: 'Barba',
  disenos: 'Diseños',
  ninos: 'Niños',
  clasico: 'Clásico',
  navaja: 'Navaja',
};
const SPECIALTY_ORDER = Object.keys(SPECIALTIES);

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

/* "Hoy" y la hora actual en la zona del negocio. */
function nowIn(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function weekday(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
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

function dayList(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new HttpError(400, 'Marca al menos un día.');
  }
  return [...new Set(value as number[])].sort();
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
  };
}

function toBarber(row: Row, services: Row[]) {
  const tags = JSON.parse(row.tags as string) as string[];
  const mapped = services.map(toService);
  return {
    id: row.id as string,
    name: row.name as string,
    area: row.area as string,
    bio: row.bio as string,
    tags,
    specialties: tags.map((t) => SPECIALTIES[t]),
    rating: row.rating as number | null,
    freeToday: !!row.free_today,
    openNow: !!row.open_now,
    workDays: JSON.parse(row.work_days as string) as number[],
    hours: JSON.parse(row.hours as string) as number[],
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
    hour: row.hour as number,
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
    takenHours: db.prepare(`SELECT hour FROM appointments WHERE barber_id = ? AND date = ? AND status != 'cancelled'`),
    appointment: db.prepare('SELECT a.*, b.name AS barber_name, b.owner_id FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE a.id = ?'),
    clientAppointments: db.prepare(
      'SELECT a.*, b.name AS barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE a.client_id = ? ORDER BY a.date, a.hour',
    ),
    barberAppointments: db.prepare(
      `SELECT a.*, b.name AS barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id
       WHERE a.barber_id = ? AND a.date >= ? ORDER BY a.date, a.hour`,
    ),
  };

  const loadBarber = (row: Row | undefined) => (row ? toBarber(row, q.servicesOf.all(row.id as string)) : null);

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
    const services = q.allServices.all() as Row[];
    const byBarber = new Map<string, Row[]>();
    for (const s of services) {
      const list = byBarber.get(s.barber_id as string) ?? [];
      list.push(s);
      byBarber.set(s.barber_id as string, list);
    }
    res.json((q.barbers.all() as Row[]).map((b) => toBarber(b, byBarber.get(b.id as string) ?? [])));
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

  app.get('/api/barbers/:id/availability', (req, res) => {
    const row = q.barber.get(req.params.id) as Row | undefined;
    if (!row) throw new HttpError(404, 'Ese barbero ya no existe.');
    const date = req.query.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Fecha no válida.');
    const taken = (q.takenHours.all(row.id as string, date) as Row[]).map((r) => r.hour as number);
    const now = nowIn(timeZone);
    const hours = JSON.parse(row.hours as string) as number[];
    const past = date < now.date ? hours : date === now.date ? hours.filter((h) => h <= now.hour) : [];
    res.json({ date, taken: [...new Set([...taken, ...past])].sort((a, b) => a - b) });
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
      `INSERT INTO barbers (id, owner_id, name, area, map_x, map_y, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    ).run(id, req.userId!, name, area, now, now);
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
    if ('workDays' in body) set('work_days', JSON.stringify(dayList(body.workDays)));
    if ('freeToday' in body) set('free_today', body.freeToday ? 1 : 0);
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
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM services WHERE barber_id = ?').get(row.id as string) as Row;
    db.prepare('INSERT INTO services (id, barber_id, name, price_cents, photo, position) VALUES (?, ?, ?, ?, ?, ?)').run(
      randomUUID(), row.id as string, name, cents, photo, pos.p as number,
    );
    res.status(201).json(loadBarber(q.barber.get(row.id as string) as Row));
  });

  app.patch('/api/me/barber/services/:serviceId', auth, (req: AuthedRequest, res) => {
    const row = myBarberRow(req.userId!);
    const service = q.service.get(req.params.serviceId, row.id as string) as Row | undefined;
    if (!service) throw new HttpError(404, 'Ese corte ya no existe.');
    const name = text(req.body?.name, 'el nombre del corte', { max: 40 });
    const cents = price(req.body?.price);
    const photo = ownPhoto(req.body?.photo, req.userId!);
    db.prepare('UPDATE services SET name = ?, price_cents = ?, photo = ? WHERE id = ?').run(name, cents, photo, service.id as string);
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
    const { barberId, serviceId, date, hour } = req.body ?? {};
    const barber = q.barber.get(String(barberId)) as Row | undefined;
    if (!barber) throw new HttpError(404, 'Ese barbero ya no existe.');
    const service = q.service.get(String(serviceId), barber.id as string) as Row | undefined;
    if (!service) throw new HttpError(400, 'Elige un servicio.');
    if (!isValidDate(date)) throw new HttpError(400, 'Elige un día.');
    const hours = JSON.parse(barber.hours as string) as number[];
    if (!Number.isInteger(hour) || !hours.includes(hour)) throw new HttpError(400, 'Elige una hora.');
    if (!(JSON.parse(barber.work_days as string) as number[]).includes(weekday(date))) {
      throw new HttpError(400, 'Ese día el barbero no atiende.');
    }
    const now = nowIn(timeZone);
    if (date < now.date || (date === now.date && hour <= now.hour)) {
      throw new HttpError(400, 'Esa hora ya pasó. Prueba con otra.');
    }

    const id = randomUUID();
    try {
      db.prepare(
        `INSERT INTO appointments (id, barber_id, service_id, service_name, client_id, date, hour, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(id, barber.id as string, service.id as string, service.name as string, req.userId!, date, hour, Date.now());
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Esa hora ya la tomaron. Prueba con otra.');
      throw err;
    }
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
    const status = (err as { status?: number }).status;
    if (status === 413) return res.status(413).json({ error: 'La foto es muy pesada.' });
    if (status === 400) return res.status(400).json({ error: 'Datos no válidos.' });
    console.error(err);
    res.status(500).json({ error: 'Algo falló de nuestro lado. Prueba otra vez.' });
  });

  return app;
}
