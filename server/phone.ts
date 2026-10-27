import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { DB } from './db.js';
import { HttpError, type AuthedRequest, type Row } from './http.js';

/*
 * Verificar el celular de un barbero con un código de 6 dígitos.
 * Un número verificado solo puede tener una cuenta.
 *
 * El envío depende de un SmsProvider: hoy `testSms` (el código se ve en la app, no se envía nada).
 * Para enviar de verdad, se escribe uno con `send` (Twilio, WhatsApp Cloud API…) y se elige con SMS_PROVIDER.
 */

export interface SmsProvider {
  name: string;
  send(to: string, text: string): Promise<void>;
}

/* Modo de prueba: no envía; la API devuelve el código para mostrarlo en pantalla. */
export const testSms: SmsProvider = {
  name: 'test',
  async send() {},
};

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 3;

const hash = (code: string) => createHash('sha256').update(code).digest('hex');

/* "6000-1234" → "+50760001234". Sin código de país, se asume Panamá (+507). */
export function normalizePhone(input: unknown): string {
  if (typeof input !== 'string') throw new HttpError(400, 'Escribe tu número de celular.');
  const raw = input.trim();
  const digits = raw.replace(/\D/g, '');
  const full = raw.startsWith('+') ? digits : digits.length <= 8 ? `507${digits}` : digits;
  if (full.length < 10 || full.length > 15) throw new HttpError(400, 'Ese número no parece válido. Escríbelo con todos sus dígitos.');
  if (full.startsWith('507') && !/^5076\d{7}$/.test(full)) {
    throw new HttpError(400, 'Los celulares de Panamá tienen 8 dígitos y empiezan con 6.');
  }
  return `+${full}`;
}

export function createPhoneVerification(db: DB, provider: SmsProvider | null) {
  const q = {
    user: db.prepare('SELECT phone, phone_verified_at FROM users WHERE id = ?'),
    takenBy: db.prepare('SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL AND id != ?'),
    recent: db.prepare('SELECT COUNT(*) AS n FROM phone_codes WHERE (phone = ? OR user_id = ?) AND created_at > ?'),
    latest: db.prepare('SELECT rowid, * FROM phone_codes WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'),
    insert: db.prepare('INSERT INTO phone_codes (user_id, phone, code_hash, attempts, created_at) VALUES (?, ?, ?, 0, ?)'),
    attempt: db.prepare('UPDATE phone_codes SET attempts = attempts + 1 WHERE rowid = ?'),
    clear: db.prepare('DELETE FROM phone_codes WHERE user_id = ?'),
    verify: db.prepare('UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?'),
  };

  const status = (userId: string) => {
    const u = q.user.get(userId) as Row | undefined;
    return { phone: (u?.phone as string | null) ?? null, verified: !!u?.phone_verified_at };
  };

  return {
    /* Sin proveedor no se exige (no habría cómo enviar el código). */
    required: !!provider,
    isVerified: (userId: string) => !provider || status(userId).verified,
    status,

    register(app: Express, auth: RequestHandler) {
      app.get('/api/phone', auth, (req: AuthedRequest, res) => {
        res.json({ required: !!provider, ...status(req.userId!) });
      });

      app.post('/api/phone/start', auth, async (req: AuthedRequest, res, next) => {
        try {
          if (!provider) throw new HttpError(400, 'La verificación por teléfono no está activa.');
          const phone = normalizePhone(req.body?.phone);
          if (q.takenBy.get(phone, req.userId!)) throw new HttpError(409, 'Ese número ya está en otra cuenta de Filo.');
          const sent = (q.recent.get(phone, req.userId!, Date.now() - 60 * 60 * 1000) as { n: number }).n;
          if (sent >= MAX_CODES_PER_HOUR) throw new HttpError(429, 'Pediste varios códigos. Espera un rato y prueba otra vez.');

          const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
          q.insert.run(req.userId!, phone, hash(code), Date.now());
          await provider.send(phone, `Tu código de Filo es ${code}. Vence en 10 minutos.`);
          /* Solo en modo de prueba se devuelve el código, para verlo en pantalla. */
          res.status(201).json({ phone, sent: true, ...(provider.name === 'test' ? { testCode: code } : {}) });
        } catch (err) {
          next(err);
        }
      });

      app.post('/api/phone/verify', auth, (req: AuthedRequest, res) => {
        if (!provider) throw new HttpError(400, 'La verificación por teléfono no está activa.');
        const row = q.latest.get(req.userId!) as Row | undefined;
        if (!row || Date.now() - (row.created_at as number) > CODE_TTL_MS) {
          throw new HttpError(400, 'El código venció. Pide uno nuevo.');
        }
        if ((row.attempts as number) >= MAX_ATTEMPTS) throw new HttpError(429, 'Demasiados intentos. Pide un código nuevo.');
        q.attempt.run(row.rowid as number);
        const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\D/g, '') : '';
        const ok = code.length === 6 && timingSafeEqual(Buffer.from(hash(code)), Buffer.from(row.code_hash as string));
        if (!ok) throw new HttpError(400, 'Ese código no es. Revísalo y prueba otra vez.');
        if (q.takenBy.get(row.phone as string, req.userId!)) throw new HttpError(409, 'Ese número ya está en otra cuenta de Filo.');
        q.verify.run(row.phone as string, Date.now(), req.userId!);
        q.clear.run(req.userId!);
        res.json(status(req.userId!));
      });
    },
  };
}
