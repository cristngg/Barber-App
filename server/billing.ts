import { randomUUID } from 'node:crypto';
import type { Express, Request, RequestHandler } from 'express';
import { transaction, type DB } from './db.js';
import { HttpError, type AuthedRequest, type Row } from './http.js';

/*
 * Cobro de la cuenta de barbero ($3.99 al mes), sin atarse a un proveedor.
 *
 * - Un barbero nuevo queda "pending" y su perfil no sale al público hasta que paga.
 * - Cada pago le da 30 días. Si no renueva, tiene 5 días de gracia ("past_due") y luego vence.
 * - Si cancela, sigue visible hasta el final de lo pagado.
 *
 * El proveedor solo abre el pago y avisa cuando se pagó, falló o se canceló.
 * Hoy existe `testProvider` (pago simulado, no cobra). Para conectar PayPal u otro, se escribe
 * un BillingProvider con `checkout`, `cancel` y `parseWebhook`, y se elige con BILLING_PROVIDER.
 */

export const PLAN = { amountCents: 399, currency: 'USD', days: 30 };
const GRACE_DAYS = 5;
const DAY = 24 * 60 * 60 * 1000;

export type SubStatus = 'pending' | 'active' | 'past_due' | 'canceled' | 'expired';

export type BillingEvent =
  | { type: 'paid'; sessionId: string; subscriptionRef: string }
  | { type: 'failed'; sessionId: string }
  | { type: 'canceled'; subscriptionRef: string };

export interface BillingProvider {
  name: string;
  /* Abre un pago; devuelve la dirección donde la persona paga. */
  checkout(opts: { sessionId: string; email: string | null; returnUrl: string }): Promise<{ url: string }>;
  /* Detiene la renovación en el proveedor. */
  cancel(subscriptionRef: string): Promise<void>;
  /* Lee un aviso del proveedor (webhook) y lo convierte en eventos. Debe verificar la firma. */
  parseWebhook?(req: Request): Promise<BillingEvent[]>;
}

/* Pago simulado: la app muestra /pago-prueba/:sesión y ahí se "paga" sin cobrar nada. */
export const testProvider: BillingProvider = {
  name: 'test',
  async checkout({ sessionId }) {
    return { url: `/pago-prueba/${sessionId}` };
  },
  async cancel() {},
};

/* Estado real según la fecha: un "active" vencido pasa a gracia y luego a vencido. */
export function effectiveStatus(row: Row, now = Date.now()): SubStatus {
  const status = (row.sub_status as SubStatus | null) ?? 'active';
  const end = row.period_end as number | null;
  if (status === 'pending' || end == null) return status === 'pending' ? 'pending' : 'active';
  if (now <= end) return status === 'past_due' ? 'past_due' : status;
  if (status === 'canceled') return 'expired';
  return now <= end + GRACE_DAYS * DAY ? 'past_due' : 'expired';
}

/* ¿Sale en el mapa y en las búsquedas? */
export const isPublic = (status: SubStatus) => status === 'active' || status === 'past_due' || status === 'canceled';

export function createBilling(db: DB, provider: BillingProvider | null) {
  const q = {
    barberByOwner: db.prepare('SELECT * FROM barbers WHERE owner_id = ?'),
    session: db.prepare('SELECT * FROM billing_sessions WHERE id = ?'),
    newSession: db.prepare('INSERT INTO billing_sessions (id, barber_id, status, created_at) VALUES (?, ?, ?, ?)'),
    closeSession: db.prepare('UPDATE billing_sessions SET status = ? WHERE id = ?'),
    byRef: db.prepare('SELECT * FROM barbers WHERE sub_ref = ?'),
  };

  /* Aplica lo que avisa el proveedor. Es idempotente: el mismo aviso dos veces no suma dos meses. */
  const apply = (event: BillingEvent) =>
    transaction(db, () => {
      if (event.type === 'canceled') {
        const b = q.byRef.get(event.subscriptionRef) as Row | undefined;
        if (b) db.prepare("UPDATE barbers SET sub_status = 'canceled' WHERE id = ?").run(b.id as string);
        return;
      }
      const session = q.session.get(event.sessionId) as Row | undefined;
      if (!session || session.status !== 'open') return;
      q.closeSession.run(event.type, session.id as string);
      const barber = db.prepare('SELECT * FROM barbers WHERE id = ?').get(session.barber_id as string) as Row;
      if (event.type === 'failed') {
        if (barber.sub_status === 'active') db.prepare("UPDATE barbers SET sub_status = 'past_due' WHERE id = ?").run(barber.id as string);
        return;
      }
      /* Pagar suma 30 días desde hoy, o desde el fin de lo ya pagado si todavía no vence. */
      const from = Math.max(Date.now(), (barber.period_end as number | null) ?? 0);
      db.prepare("UPDATE barbers SET sub_status = 'active', sub_ref = ?, period_end = ? WHERE id = ?").run(
        event.subscriptionRef,
        from + PLAN.days * DAY,
        barber.id as string,
      );
    });

  const summary = (barber: Row | undefined) => {
    if (!barber) return null;
    return {
      status: provider ? effectiveStatus(barber) : ('active' as SubStatus),
      periodEnd: (barber.period_end as number | null) ?? null,
    };
  };

  return {
    enabled: !!provider,
    /* Estado de inicio para un barbero nuevo: sin cobro, activo desde ya. */
    initialStatus: (provider ? 'pending' : 'active') as SubStatus,
    status: (barber: Row) => (provider ? effectiveStatus(barber) : ('active' as SubStatus)),
    summary,
    apply,

    register(app: Express, auth: RequestHandler) {
      app.get('/api/billing', auth, (req: AuthedRequest, res) => {
        res.json({
          enabled: !!provider,
          provider: provider?.name ?? null,
          plan: PLAN,
          subscription: summary(q.barberByOwner.get(req.userId!) as Row | undefined),
        });
      });

      app.post('/api/billing/checkout', auth, async (req: AuthedRequest, res, next) => {
        try {
          if (!provider) throw new HttpError(400, 'El cobro no está activo: tu perfil ya es público.');
          const barber = q.barberByOwner.get(req.userId!) as Row | undefined;
          if (!barber) throw new HttpError(404, 'Primero crea tu cuenta de barbero.');
          const id = randomUUID();
          q.newSession.run(id, barber.id as string, 'open', Date.now());
          const email = (db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId!) as Row).email as string | null;
          const { url } = await provider.checkout({ sessionId: id, email, returnUrl: '/mi-perfil' });
          res.status(201).json({ url });
        } catch (err) {
          next(err);
        }
      });

      app.post('/api/billing/cancel', auth, async (req: AuthedRequest, res, next) => {
        try {
          if (!provider) throw new HttpError(400, 'El cobro no está activo.');
          const barber = q.barberByOwner.get(req.userId!) as Row | undefined;
          if (!barber) throw new HttpError(404, 'No tienes cuenta de barbero.');
          const status = effectiveStatus(barber);
          if (status !== 'active' && status !== 'past_due') throw new HttpError(409, 'No tienes una suscripción activa.');
          if (barber.sub_ref) await provider.cancel(barber.sub_ref as string);
          db.prepare("UPDATE barbers SET sub_status = 'canceled' WHERE id = ?").run(barber.id as string);
          res.json(summary(q.barberByOwner.get(req.userId!) as Row));
        } catch (err) {
          next(err);
        }
      });

      /* Avisos del proveedor real (cuando exista). */
      app.post('/api/billing/webhook', async (req, res, next) => {
        try {
          if (!provider?.parseWebhook) throw new HttpError(404, 'No existe.');
          for (const event of await provider.parseWebhook(req)) apply(event);
          res.json({ ok: true });
        } catch (err) {
          next(err);
        }
      });

      /* Pago simulado: solo con el proveedor de prueba. */
      if (provider?.name === 'test') {
        const testSession = (req: AuthedRequest) => {
          const session = q.session.get(String(req.params.id)) as Row | undefined;
          const barber = q.barberByOwner.get(req.userId!) as Row | undefined;
          if (!session || !barber || session.barber_id !== barber.id) throw new HttpError(404, 'Ese pago no existe.');
          return { session, barber };
        };
        app.get('/api/billing/test/:id', auth, (req: AuthedRequest, res) => {
          const { session, barber } = testSession(req);
          res.json({ plan: PLAN, barberName: barber.name, open: session.status === 'open' });
        });
        app.post('/api/billing/test/:id/:outcome', auth, (req: AuthedRequest, res) => {
          const { session } = testSession(req);
          if (session.status !== 'open') throw new HttpError(409, 'Ese pago ya se cerró.');
          const outcome = req.params.outcome;
          if (outcome === 'pay') apply({ type: 'paid', sessionId: session.id as string, subscriptionRef: `test_${session.id}` });
          else if (outcome === 'fail') apply({ type: 'failed', sessionId: session.id as string });
          else throw new HttpError(404, 'No existe.');
          res.json(summary(q.barberByOwner.get(req.userId!) as Row));
        });
      }
    },
  };
}
