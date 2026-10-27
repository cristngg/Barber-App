import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { DB } from './db.js';
import { HttpError, type AuthedRequest, type Row } from './http.js';
import { nowIn } from './schedule.js';

/*
 * Reseñas: solo quien tuvo la cita, cuando ya terminó y hasta 30 días después.
 * Una por cita (se puede corregir). El barbero puede responder cada una.
 */

const REVIEW_DAYS = 30;
const TEXT_MAX = 500;

/* "Ana Pérez" → "Ana P." (nadie ve el nombre completo de quien opina). */
function shortName(name: unknown) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Cliente';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function reviewState(appt: Row, review: Row | undefined, timeZone: string) {
  const now = nowIn(timeZone);
  const end = (appt.start_min as number) + (appt.duration_min as number);
  const finished = (appt.date as string) < now.date || (appt.date === now.date && end <= now.minutes);
  const inWindow = daysBetween(appt.date as string, now.date) <= REVIEW_DAYS;
  return {
    canReview: appt.status !== 'cancelled' && finished && inWindow,
    review: review ? { rating: review.rating as number, text: review.text as string } : null,
  };
}

export function createReviews(db: DB, timeZone: string) {
  const q = {
    byAppointment: db.prepare('SELECT * FROM reviews WHERE appointment_id = ?'),
    appointment: db.prepare('SELECT * FROM appointments WHERE id = ?'),
    stats: db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE barber_id = ?'),
    allStats: db.prepare('SELECT barber_id, AVG(rating) AS avg, COUNT(*) AS n FROM reviews GROUP BY barber_id'),
    page: db.prepare(
      `SELECT r.*, u.name AS author, a.service_name FROM reviews r
       JOIN users u ON u.id = r.client_id JOIN appointments a ON a.id = r.appointment_id
       WHERE r.barber_id = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    ),
  };

  const toStats = (row: Row | undefined) => {
    const n = (row?.n as number) ?? 0;
    return { rating: n ? Math.round((row!.avg as number) * 10) / 10 : null, reviewCount: n };
  };

  return {
    /* Promedio (1 decimal) y cuántas reseñas tiene un barbero. */
    stats: (barberId: string) => toStats(q.stats.get(barberId) as Row | undefined),
    allStats: () =>
      new Map((q.allStats.all() as Row[]).map((r) => [r.barber_id as string, toStats(r)])),

    /* Para la lista de citas del cliente: ¿puede calificarla y qué dijo? */
    stateFor: (appt: Row) => reviewState(appt, q.byAppointment.get(appt.id as string) as Row | undefined, timeZone),

    register(app: Express, auth: RequestHandler, myBarberRow: (userId: string) => Row) {
      app.get('/api/barbers/:id/reviews', (req, res) => {
        const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const { rating, reviewCount } = toStats(q.stats.get(req.params.id) as Row | undefined);
        const items = (q.page.all(req.params.id, limit, offset) as Row[]).map((r) => ({
          id: r.id as string,
          rating: r.rating as number,
          text: r.text as string,
          author: shortName(r.author),
          service: r.service_name as string,
          createdAt: r.created_at as number,
          reply: (r.reply as string | null) ?? null,
        }));
        res.json({ items, rating, total: reviewCount, nextOffset: offset + limit < reviewCount ? offset + limit : null });
      });

      app.post('/api/appointments/:id/review', auth, (req: AuthedRequest, res) => {
        const appt = q.appointment.get(req.params.id) as Row | undefined;
        if (!appt || appt.client_id !== req.userId) throw new HttpError(404, 'Esa cita no es tuya.');
        const existing = q.byAppointment.get(appt.id as string) as Row | undefined;
        const state = reviewState(appt, existing, timeZone);
        if (!state.canReview) {
          throw new HttpError(
            400,
            appt.status === 'cancelled'
              ? 'Las citas canceladas no se califican.'
              : 'Puedes calificar cuando termine la cita y hasta 30 días después.',
          );
        }
        const rating = req.body?.rating;
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Elige de 1 a 5 estrellas.');
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (text.length > TEXT_MAX) throw new HttpError(400, `La reseña es muy larga (máximo ${TEXT_MAX}).`);

        if (existing) {
          db.prepare('UPDATE reviews SET rating = ?, text = ?, updated_at = ? WHERE id = ?').run(rating, text, Date.now(), existing.id as string);
        } else {
          db.prepare(
            'INSERT INTO reviews (id, appointment_id, barber_id, client_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(randomUUID(), appt.id as string, appt.barber_id as string, req.userId!, rating, text, Date.now());
        }
        res.status(existing ? 200 : 201).json({ rating, text });
      });

      app.post('/api/me/reviews/:id/reply', auth, (req: AuthedRequest, res) => {
        const barber = myBarberRow(req.userId!);
        const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND barber_id = ?').get(req.params.id, barber.id as string) as Row | undefined;
        if (!review) throw new HttpError(404, 'Esa reseña no es de tu perfil.');
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (text.length > TEXT_MAX) throw new HttpError(400, `La respuesta es muy larga (máximo ${TEXT_MAX}).`);
        db.prepare('UPDATE reviews SET reply = ?, reply_at = ? WHERE id = ?').run(text || null, text ? Date.now() : null, review.id as string);
        res.json({ reply: text || null });
      });
    },
  };
}
