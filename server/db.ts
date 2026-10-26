import { DatabaseSync } from 'node:sqlite';

/*
 * Base de datos SQLite (incluida en Node 22). Un archivo en disco, sin servicio aparte.
 * Precios en centavos para no arrastrar errores de punto flotante.
 */

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS barbers (
  id TEXT PRIMARY KEY,
  owner_id TEXT UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  distance_km REAL,
  free_today INTEGER NOT NULL DEFAULT 1,
  open_now INTEGER NOT NULL DEFAULT 1,
  work_days TEXT NOT NULL DEFAULT '[2,3,4,5,6]',
  hours TEXT NOT NULL DEFAULT '[9,10,11,12,13,14,15,16]',
  avatar TEXT,
  cover TEXT,
  map_x INTEGER NOT NULL,
  map_y INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER,
  photo TEXT,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS services_barber ON services(barber_id, position);

-- Fotos subidas: quién las subió, para que nadie use las de otro.
CREATE TABLE IF NOT EXISTS photos (
  name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS appointments_barber ON appointments(barber_id, date);
-- Una hora de un barbero solo se puede apartar una vez (las canceladas liberan la hora).
CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot
  ON appointments(barber_id, date, hour) WHERE status != 'cancelled';
`;

export function openDb(file: string): DB {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

/* Corre `fn` dentro de una transacción. */
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* Los barberos del diseño, para que la app no arranque vacía. Sin dueño: nadie los edita. */
export function seedDemo(db: DB) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM barbers').get() as { n: number };
  if (row.n > 0) return;

  const now = Date.now();
  const demo = [
    {
      id: 'carlos-m', name: 'Carlos M.', area: 'Bella Vista', tags: ['fade', 'barba', 'disenos'],
      rating: 4.9, distance: 0.8, free: 1, open: 1, days: [2, 3, 4, 5, 6], map: [26, 28],
      bio: 'Fade, barba y diseños a navaja. Atiendo con cita, de martes a sábado.',
      services: ['Fade bajo', 'Barba con navaja', 'Diseño lineal', 'Corte clásico', 'Fade medio', 'Corte niño'],
    },
    {
      id: 'la-esquina', name: 'Barbería La Esquina', area: 'El Cangrejo', tags: ['clasico', 'navaja', 'barba'],
      rating: 4.7, distance: 1.2, free: 1, open: 1, days: [1, 2, 3, 4, 5, 6], map: [54, 52],
      bio: 'Corte clásico y afeitado a navaja caliente. Sin cita también, si hay puesto.',
      services: ['Corte clásico', 'Barba con navaja', 'Afeitado caliente'],
    },
    {
      id: 'andres-r', name: 'Andrés R.', area: 'San Francisco', tags: ['ninos', 'fade'],
      rating: 4.8, distance: 2.1, free: 0, open: 0, days: [0, 3, 4, 5, 6], map: [74, 22],
      bio: 'Paciencia con los pelaos y fades limpios. Atiendo de miércoles a domingo.',
      services: ['Corte niño', 'Fade bajo', 'Fade medio'],
    },
  ];

  const insBarber = db.prepare(`INSERT INTO barbers
    (id, name, area, bio, tags, rating, distance_km, free_today, open_now, work_days, map_x, map_y, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insService = db.prepare('INSERT INTO services (id, barber_id, name, price_cents, position) VALUES (?, ?, ?, NULL, ?)');

  transaction(db, () => {
    for (const b of demo) {
      insBarber.run(b.id, b.name, b.area, b.bio, JSON.stringify(b.tags), b.rating, b.distance, b.free, b.open,
        JSON.stringify(b.days), b.map[0], b.map[1], now, now);
      b.services.forEach((name, i) => insService.run(`${b.id}-${i}`, b.id, name, i));
    }
  });
}
