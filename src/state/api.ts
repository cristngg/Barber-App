import type { Barber } from '../data/barbers';
import { load, save } from './storage';

/* Cliente de la API. El token anónimo de este teléfono vive en localStorage. */

export type Appointment = {
  id: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  /* ISO yyyy-mm-dd */
  date: string;
  hour: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: number;
};

export type BarberPatch = Partial<
  Pick<Barber, 'name' | 'area' | 'bio' | 'tags' | 'workDays' | 'freeToday'> & { avatar: string | null; cover: string | null }
>;

export type ServiceInput = { name: string; price: number; photo?: string | null };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'filo.token';
const OFFLINE = 'No hay conexión. Revisa tu internet y prueba otra vez.';

let token: string | null = load<string | null>(TOKEN_KEY, null);
let pendingSession: Promise<string> | null = null;

async function send(path: string, init: RequestInit, auth: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  if (auth) headers.set('authorization', `Bearer ${await ensureSession()}`);
  try {
    return await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  let res = await send(path, init, auth);
  if (res.status === 401 && auth) {
    /* El servidor no reconoce el token (p. ej. se reinició la base): pedimos otro una vez. */
    token = null;
    res = await send(path, init, auth);
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Algo falló. Prueba otra vez.');
  return data as T;
}

function ensureSession(): Promise<string> {
  if (token) return Promise.resolve(token);
  pendingSession ??= request<{ token: string }>('/api/session', { method: 'POST' }, false)
    .then((s) => {
      token = s.token;
      save(TOKEN_KEY, token);
      return token;
    })
    .finally(() => {
      pendingSession = null;
    });
  return pendingSession;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  barbers: () => request<Barber[]>('/api/barbers', {}, false),
  barber: (id: string) => request<Barber>(`/api/barbers/${encodeURIComponent(id)}`, {}, false),
  availability: (id: string, date: string) =>
    request<{ date: string; taken: number[] }>(`/api/barbers/${encodeURIComponent(id)}/availability?date=${date}`, {}, false),

  me: () => request<{ userId: string; barber: Barber | null }>('/api/me'),
  createBarber: (name: string, area: string) => request<Barber>('/api/me/barber', json('POST', { name, area })),
  updateBarber: (patch: BarberPatch) => request<Barber>('/api/me/barber', json('PATCH', patch)),
  addService: (s: ServiceInput) => request<Barber>('/api/me/barber/services', json('POST', s)),
  updateService: (id: string, s: ServiceInput) => request<Barber>(`/api/me/barber/services/${id}`, json('PATCH', s)),
  removeService: (id: string) => request<Barber>(`/api/me/barber/services/${id}`, { method: 'DELETE' }),
  agenda: () => request<Appointment[]>('/api/me/agenda'),

  uploadPhoto: (blob: Blob) =>
    request<{ url: string }>('/api/photos', { method: 'POST', headers: { 'content-type': blob.type }, body: blob }),

  appointments: () => request<Appointment[]>('/api/appointments'),
  book: (a: { barberId: string; serviceId: string; date: string; hour: number }) =>
    request<Appointment>('/api/appointments', json('POST', a)),
  cancel: (id: string) => request<Appointment>(`/api/appointments/${id}/cancel`, { method: 'POST' }),
  confirm: (id: string) => request<Appointment>(`/api/appointments/${id}/confirm`, { method: 'POST' }),
};

export function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : 'Algo falló. Prueba otra vez.';
}
