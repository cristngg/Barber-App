import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { transaction, type DB } from './db.js';

/*
 * API de Filo.
 * Identidad: cada teléfono recibe un token anónimo (POST /api/session) y lo manda como
 * `Authorization: Bearer <token>`. El token es la llave del perfil de barbero y de las citas.
 */

export type AppOptions = {
  db: DB;
  uploadDir: string;
  /* Zona horaria del negocio: define qué es "hoy" y qué horas ya pasaron. */
  timeZone?: string;
  /* Carpeta con la app compilada (dist). Si existe, se sirve en la misma dirección. */
  staticDir?: string;
};

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
    distanceKm: row.distance_km as number | null,
    freeToday: !!row.free_today,
    openNow: !!row.open_now,
    workDays: JSON.parse(row.work_days as string) as number[],
    hours: JSON.parse(row.hours as string) as number[],
    avatar: (row.avatar as string | null) ?? undefined,
    cover: (row.cover as string | null) ?? undefined,
    photoCount: mapped.filter((s) => s.photo).length,
    services: mapped,
    map: { x: row.map_x as number, y: row.map_y as number },
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

export function createApp({ db, uploadDir, timeZone = 'America/Panama', staticDir }: AppOptions) {
  mkdirSync(uploadDir, { recursive: true });

  const q = {
    userByToken: db.prepare('SELECT id FROM users WHERE token_hash = ?'),
    insertUser: db.prepare('INSERT INTO users (id, token_hash, created_at) VALUES (?, ?, ?)'),
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
  app.use('/api', express.json({ limit: '100kb' }));

  /* --- Autenticación --- */

  const auth = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const row = token ? (q.userByToken.get(hashToken(token)) as Row | undefined) : undefined;
    if (!row) return next(new HttpError(401, 'Sesión no válida.'));
    req.userId = row.id as string;
    next();
  };

  const myBarberRow = (userId: string) => {
    const row = q.barberByOwner.get(userId) as Row | undefined;
    if (!row) throw new HttpError(404, 'Todavía no tienes cuenta de barbero.');
    return row;
  };

  app.post('/api/session', (_req, res) => {
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    q.insertUser.run(id, hashToken(token), Date.now());
    res.status(201).json({ token, userId: id });
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
    res.json({ userId: req.userId, barber: loadBarber(q.barberByOwner.get(req.userId!) as Row | undefined) });
  });

  app.post('/api/me/barber', auth, (req: AuthedRequest, res) => {
    if (q.barberByOwner.get(req.userId!)) throw new HttpError(409, 'Ya tienes cuenta de barbero.');
    const name = text(req.body?.name, 'tu nombre o el de tu barbería');
    const area = text(req.body?.area, 'el barrio donde atiendes');
    const id = `b-${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    // TODO: cobrar la suscripción ($3.99/mes) antes de crear la cuenta.
    db.prepare(
      `INSERT INTO barbers (id, owner_id, name, area, map_x, map_y, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, req.userId!, name, area, 12 + Math.floor(Math.random() * 76), 15 + Math.floor(Math.random() * 55), now, now);
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
