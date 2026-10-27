import type { Barber } from '../data/barbers';
import type { LatLng } from '../data/geo';
import { load, save } from './storage';

/* Cliente de la API. El token de sesión de este teléfono vive en localStorage. */

export type Appointment = {
  id: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  /* ISO yyyy-mm-dd */
  date: string;
  /* Hora de inicio en minutos desde la medianoche, y cuánto dura. */
  startMin: number;
  durationMin: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: number;
};

export type User = { id: string; email: string | null; name: string | null; picture: string | null };

export type Config = { googleClientId: string | null; devLogin: boolean };

export type BarberPatch = Partial<
  Pick<Barber, 'name' | 'area' | 'bio' | 'tags' | 'weekly' | 'daysOff' | 'location'> & {
    avatar: string | null;
    cover: string | null;
  }
>;

export type TravelMode = 'car' | 'foot';
export type Route = { mode: TravelMode; distanceM: number; durationS: number; path: [number, number][] };

export type ServiceInput = { name: string; price: number; photo?: string | null; style: string; durationMin: number };

/* Un corte del muro de búsqueda, con lo justo de su barbero. */
export type Cut = {
  id: string;
  name: string;
  price: number | null;
  photo?: string;
  style: string | null;
  styleLabel: string | null;
  distanceKm: number | null;
  barber: { id: string; name: string; area: string; rating: number | null; freeToday: boolean; avatar?: string };
};
export type CutsPage = { items: Cut[]; total: number; nextOffset: number | null };

/* Píldora de búsqueda: un tipo de corte (`style`) o una palabra libre (`q`). `trending`: sale de lo que busca la zona. */
export type Pill = { key: string; label: string; style: string | null; q: string | null; trending: boolean };
export type Trending = { pills: Pill[]; scope: 'local' | 'general' | 'none' };

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

const SIGNED_OUT = 'Entra con tu cuenta para seguir.';

let token: string | null = load<string | null>(TOKEN_KEY, null);
let onSignedOut: () => void = () => {};

export const hasSession = () => token != null;

function setToken(next: string | null) {
  token = next;
  save(TOKEN_KEY, next);
}

/* AppState se entera cuando el servidor da por cerrada la sesión. */
export function onSessionExpired(fn: () => void) {
  onSignedOut = fn;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (auth) {
    if (!token) throw new ApiError(401, SIGNED_OUT);
    headers.set('authorization', `Bearer ${token}`);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401 && auth) {
    setToken(null);
    onSignedOut();
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Algo falló. Prueba otra vez.');
  return data as T;
}

async function startSession(path: string, body: unknown) {
  const s = await request<{ token: string; user: User }>(path, json('POST', body), false);
  setToken(s.token);
  return s.user;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  config: () => request<Config>('/api/config', {}, false),
  signInWithGoogle: (credential: string) => startSession('/api/auth/google', { credential }),
  signInDev: (name: string) => startSession('/api/auth/dev', { name }),
  signInWithPassword: (email: string, password: string) => startSession('/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => startSession('/api/auth/register', { name, email, password }),
  signOut: async () => {
    const current = token;
    setToken(null);
    if (current) {
      await fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${current}` } }).catch(() => {});
    }
  },

  barbers: () => request<Barber[]>('/api/barbers', {}, false),
  barber: (id: string) => request<Barber>(`/api/barbers/${encodeURIComponent(id)}`, {}, false),
  availability: (id: string, date: string, serviceId: string) =>
    request<{ date: string; duration: number; slots: number[] }>(
      `/api/barbers/${encodeURIComponent(id)}/availability?date=${date}&serviceId=${encodeURIComponent(serviceId)}`,
      {},
      false,
    ),

  me: () => request<{ user: User; barber: Barber | null }>('/api/me'),
  createBarber: (name: string, area: string) => request<Barber>('/api/me/barber', json('POST', { name, area })),
  updateBarber: (patch: BarberPatch) => request<Barber>('/api/me/barber', json('PATCH', patch)),
  addService: (s: ServiceInput) => request<Barber>('/api/me/barber/services', json('POST', s)),
  updateService: (id: string, s: ServiceInput) => request<Barber>(`/api/me/barber/services/${id}`, json('PATCH', s)),
  removeService: (id: string) => request<Barber>(`/api/me/barber/services/${id}`, { method: 'DELETE' }),
  agenda: () => request<Appointment[]>('/api/me/agenda'),
  trending: (near: LatLng | null) => request<Trending>(`/api/trending${near ? `?near=${near.lat},${near.lng}` : ''}`),
  logSearch: (q: string, near: LatLng | null) => request<{ counted: boolean }>('/api/searches', json('POST', { q, near })),
  cuts: (p: { q: string; style: string | null; near: LatLng | null; offset: number; limit?: number }) => {
    const params = new URLSearchParams({ q: p.q, offset: String(p.offset), limit: String(p.limit ?? 12) });
    if (p.style) params.set('style', p.style);
    if (p.near) params.set('near', `${p.near.lat},${p.near.lng}`);
    return request<CutsPage>(`/api/cuts?${params}`);
  },
  route: (from: LatLng, to: LatLng, mode: TravelMode) =>
    request<Route>(`/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&mode=${mode}`),

  uploadPhoto: (blob: Blob) =>
    request<{ url: string }>('/api/photos', { method: 'POST', headers: { 'content-type': blob.type }, body: blob }),

  appointments: () => request<Appointment[]>('/api/appointments'),
  book: (a: { barberId: string; serviceId: string; date: string; start: number }) =>
    request<Appointment>('/api/appointments', json('POST', a)),
  cancel: (id: string) => request<Appointment>(`/api/appointments/${id}/cancel`, { method: 'POST' }),
  confirm: (id: string) => request<Appointment>(`/api/appointments/${id}/confirm`, { method: 'POST' }),
};

export function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : 'Algo falló. Prueba otra vez.';
}
