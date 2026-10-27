import { DatabaseSync } from 'node:sqlite';

/*
 * Base de datos SQLite (incluida en Node 22). Un archivo en disco, sin servicio aparte.
 * Precios en centavos para no arrastrar errores de punto flotante.
 */

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  name TEXT,
  picture TEXT,
  password_hash TEXT,
  created_at INTEGER NOT NULL
);
-- Un correo, una cuenta (sin importar mayúsculas), entre con Google o con contraseña.
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email COLLATE NOCASE);

-- Una fila por teléfono con sesión abierta. Se guarda el hash del token, nunca el token.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

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
  -- Dónde atiende (WGS84). NULL = todavía no marca su ubicación.
  lat REAL,
  lng REAL,
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
  -- Tipo de corte (ver STYLES en search.ts), para buscar por estilo.
  style TEXT,
  position INTEGER NOT NULL,
  created_at INTEGER
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
  migrateAnonymousUsers(db);
  addColumn(db, 'users', 'password_hash', 'TEXT');
  addColumn(db, 'barbers', 'lat', 'REAL');
  addColumn(db, 'barbers', 'lng', 'REAL');
  addColumn(db, 'services', 'style', 'TEXT');
  addColumn(db, 'services', 'created_at', 'INTEGER');
  db.exec(SCHEMA);
  return db;
}

/* Agrega una columna nueva a una tabla que ya existía en una base anterior. */
function addColumn(db: DB, table: string, column: string, type: string) {
  const columns = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
  if (columns.length && !columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/*
 * Bases creadas antes del inicio con Google guardaban el token dentro de `users`.
 * Esas sesiones anónimas pasan a `sessions` y `users` se rehace con las columnas de Google.
 */
function migrateAnonymousUsers(db: DB) {
  const columns = db.prepare("SELECT name FROM pragma_table_info('users')").all() as { name: string }[];
  if (!columns.some((c) => c.name === 'token_hash')) return;
  db.exec('PRAGMA foreign_keys = OFF');
  transaction(db, () => {
    db.exec(`
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      INSERT INTO sessions SELECT token_hash, id, created_at, created_at FROM users;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        google_sub TEXT UNIQUE,
        email TEXT,
        name TEXT,
        picture TEXT,
        created_at INTEGER NOT NULL
      );
      INSERT INTO users_new (id, created_at) SELECT id, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  });
  db.exec('PRAGMA foreign_keys = ON');
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

/* Los barberos del diseño, para que la app no arranque vacía. Sin dueño: nadie los edita.
   Ubicaciones aproximadas en Ciudad de Panamá, solo de ejemplo. */
const DEMO = [
  {
    id: 'carlos-m', name: 'Carlos M.', area: 'Bella Vista', tags: ['fade', 'barba', 'disenos'],
    rating: 4.9, free: 1, open: 1, days: [2, 3, 4, 5, 6], at: [8.9823, -79.5262],
    bio: 'Fade, barba y diseños a navaja. Atiendo con cita, de martes a sábado.',
    services: [['Fade bajo', 'fade'], ['Barba con navaja', 'barba'], ['Diseño lineal', 'disenos'], ['Corte clásico', 'clasico'], ['Fade medio', 'fade'], ['Corte niño', 'ninos']],
  },
  {
    id: 'la-esquina', name: 'Barbería La Esquina', area: 'El Cangrejo', tags: ['clasico', 'navaja', 'barba'],
    rating: 4.7, free: 1, open: 1, days: [1, 2, 3, 4, 5, 6], at: [8.9928, -79.5287],
    bio: 'Corte clásico y afeitado a navaja caliente. Sin cita también, si hay puesto.',
    services: [['Corte clásico', 'clasico'], ['Barba con navaja', 'barba'], ['Afeitado caliente', 'navaja']],
  },
  {
    id: 'andres-r', name: 'Andrés R.', area: 'San Francisco', tags: ['ninos', 'fade'],
    rating: 4.8, free: 0, open: 0, days: [0, 3, 4, 5, 6], at: [8.9961, -79.5068],
    bio: 'Paciencia con los pelaos y fades limpios. Atiendo de miércoles a domingo.',
    services: [['Corte niño', 'ninos'], ['Fade bajo', 'fade'], ['Fade medio', 'fade']],
  },
];

export function seedDemo(db: DB) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM barbers').get() as { n: number };
  if (row.n > 0) {
    /* Bases anteriores al mapa: los de ejemplo reciben su ubicación. */
    const setAt = db.prepare('UPDATE barbers SET lat = ?, lng = ? WHERE id = ? AND owner_id IS NULL AND lat IS NULL');
    for (const b of DEMO) setAt.run(b.at[0], b.at[1], b.id);
    /* Y sus cortes, su tipo. */
    const setStyle = db.prepare('UPDATE services SET style = ? WHERE id = ? AND style IS NULL');
    for (const b of DEMO) b.services.forEach(([, style], i) => setStyle.run(style, `${b.id}-${i}`));
    return;
  }

  const now = Date.now();
  const insBarber = db.prepare(`INSERT INTO barbers
    (id, name, area, bio, tags, rating, free_today, open_now, work_days, lat, lng, map_x, map_y, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`);
  const insService = db.prepare(
    'INSERT INTO services (id, barber_id, name, price_cents, style, position, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)',
  );

  transaction(db, () => {
    for (const b of DEMO) {
      insBarber.run(b.id, b.name, b.area, b.bio, JSON.stringify(b.tags), b.rating, b.free, b.open,
        JSON.stringify(b.days), b.at[0], b.at[1], now, now);
      b.services.forEach(([name, style], i) => insService.run(`${b.id}-${i}`, b.id, name, style, i, now));
    }
  });
}
