import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import { transaction, type DB } from './db.js';
import { HttpError, type AuthedRequest, type Row } from './http.js';

/*
 * Reportar un perfil de barbero. Si personas distintas lo reportan seguido, el perfil se oculta
 * solo mientras un administrador lo revisa; el administrador decide si sigue oculto o vuelve.
 * Administradores: los correos de ADMIN_EMAILS.
 */

export const REASONS: Record<string, string> = {
  falso: 'Perfil falso',
  fotos: 'Fotos que no son suyas',
  trato: 'Mal trato o acoso',
  cobro: 'Cobro indebido o estafa',
  otro: 'Otro',
};

const AUTO_HIDE_REPORTERS = 3;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function createReports(db: DB, adminEmails: string[], { autoHideAt = AUTO_HIDE_REPORTERS } = {}) {
  const admins = new Set(adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const q = {
    email: db.prepare('SELECT email FROM users WHERE id = ?'),
    barber: db.prepare('SELECT * FROM barbers WHERE id = ?'),
    upsert: db.prepare(
      `INSERT INTO reports (id, barber_id, reporter_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)
       ON CONFLICT(barber_id, reporter_id) DO UPDATE SET reason = excluded.reason, details = excluded.details, status = 'open', created_at = excluded.created_at`,
    ),
    openReporters: db.prepare(`SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE barber_id = ? AND status = 'open' AND created_at > ?`),
    hide: db.prepare('UPDATE barbers SET hidden_at = ?, hidden_by = ? WHERE id = ?'),
    queue: db.prepare(
      `SELECT b.id, b.name, b.area, b.hidden_at, b.hidden_by, COUNT(r.id) AS reports, MAX(r.created_at) AS last_at
       FROM reports r JOIN barbers b ON b.id = r.barber_id
       WHERE r.status = 'open' GROUP BY b.id ORDER BY b.hidden_at IS NULL, last_at DESC`,
    ),
    reportsOf: db.prepare(`SELECT reason, details, created_at FROM reports WHERE barber_id = ? AND status = 'open' ORDER BY created_at DESC`),
    hiddenNoReports: db.prepare(
      `SELECT id, name, area, hidden_at, hidden_by, 0 AS reports, hidden_at AS last_at FROM barbers
       WHERE hidden_at IS NOT NULL AND id NOT IN (SELECT barber_id FROM reports WHERE status = 'open')`,
    ),
    resolve: db.prepare(`UPDATE reports SET status = ? WHERE barber_id = ? AND status = 'open'`),
  };

  const isAdmin = (userId: string) => {
    const email = (q.email.get(userId) as Row | undefined)?.email as string | undefined;
    return !!email && admins.has(email.toLowerCase());
  };

  return {
    isAdmin,

    register(app: Express, auth: RequestHandler) {
      const adminOnly: RequestHandler = (req, _res, next) =>
        isAdmin((req as AuthedRequest).userId!) ? next() : next(new HttpError(403, 'Solo para administradores.'));

      app.post('/api/barbers/:id/report', auth, (req: AuthedRequest, res) => {
        const barber = q.barber.get(req.params.id) as Row | undefined;
        if (!barber) throw new HttpError(404, 'Ese barbero ya no existe.');
        if (barber.owner_id === req.userId) throw new HttpError(400, 'No puedes reportar tu propio perfil.');
        const reason = String(req.body?.reason ?? '');
        if (!(reason in REASONS)) throw new HttpError(400, 'Elige un motivo.');
        const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 500) : '';
        if (reason === 'otro' && !details) throw new HttpError(400, 'Cuéntanos qué pasó.');

        const hidden = transaction(db, () => {
          q.upsert.run(randomUUID(), barber.id as string, req.userId!, reason, details, Date.now());
          const n = (q.openReporters.get(barber.id as string, Date.now() - WINDOW_MS) as { n: number }).n;
          /* Los de ejemplo (sin dueño) no se ocultan solos. */
          if (n >= autoHideAt && !barber.hidden_at && barber.owner_id) {
            q.hide.run(Date.now(), 'reportes', barber.id as string);
            return true;
          }
          return !!barber.hidden_at;
        });
        res.status(201).json({ ok: true, hidden });
      });

      app.get('/api/admin/reports', auth, adminOnly, (_req, res) => {
        const rows = [...(q.queue.all() as Row[]), ...(q.hiddenNoReports.all() as Row[])];
        res.json(
          rows.map((r) => ({
            barberId: r.id as string,
            name: r.name as string,
            area: r.area as string,
            hidden: r.hidden_at != null,
            hiddenBy: (r.hidden_by as string | null) ?? null,
            reports: (q.reportsOf.all(r.id as string) as Row[]).map((x) => ({
              reason: REASONS[x.reason as string] ?? (x.reason as string),
              details: x.details as string,
              createdAt: x.created_at as number,
            })),
          })),
        );
      });

      /* Decidir: "hide" lo deja oculto (cierra los reportes), "restore" lo vuelve a mostrar y descarta los reportes. */
      app.post('/api/admin/barbers/:id/:action', auth, adminOnly, (req: AuthedRequest, res) => {
        const barber = q.barber.get(req.params.id) as Row | undefined;
        if (!barber) throw new HttpError(404, 'Ese barbero ya no existe.');
        if (req.params.action === 'hide') {
          q.hide.run(Date.now(), 'admin', barber.id as string);
          q.resolve.run('upheld', barber.id as string);
        } else if (req.params.action === 'restore') {
          q.hide.run(null, null, barber.id as string);
          q.resolve.run('dismissed', barber.id as string);
        } else {
          throw new HttpError(404, 'No existe.');
        }
        res.json({ ok: true });
      });
    },
  };
}
