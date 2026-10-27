import { distanceKm, formatKm, type LatLng } from './geo';

/*
 * Forma de un barbero tal como la devuelve la API (server/app.ts).
 * Precios: `null` hasta que el barbero ponga el suyo; se muestran como $[PRECIO].
 */

export type Service = {
  id: string;
  name: string;
  price: number | null;
  photo?: string;
  /* Tipo de corte (una de SPECIALTIES); null en cortes viejos sin tipo. */
  style: string | null;
  /* Cuánto dura: define qué horas quedan libres al apartar. */
  durationMin: number;
};

/* Horas de un día en minutos desde la medianoche (9:30 = 570); null = no atiende. */
export type DayHours = { start: number; end: number } | null;

export type Barber = {
  id: string;
  name: string;
  area: string;
  specialties: string[];
  tags: string[];
  /* null = perfil nuevo, aún sin valoraciones */
  rating: number | null;
  freeToday: boolean;
  openNow: boolean;
  bio: string;
  /* URL de la foto en el servidor (ver state/photos) */
  avatar?: string;
  cover?: string;
  photoCount: number;
  /* Días que atiende: 0 = domingo … 6 = sábado */
  workDays: number[];
  /* Horario por día de la semana, 0 = domingo … 6 = sábado. */
  weekly: DayHours[];
  /* Días libres (yyyy-mm-dd). */
  daysOff: string[];
  /* Horas de atención en formato 24 h */
  hours: number[];
  services: Service[];
  /* Dónde atiende; null si todavía no lo marcó. */
  location: LatLng | null;
};

/* Especialidades que un barbero puede marcar en su perfil. */
export const SPECIALTIES = [
  { tag: 'fade', label: 'Fade' },
  { tag: 'barba', label: 'Barba' },
  { tag: 'disenos', label: 'Diseños' },
  { tag: 'trenzas', label: 'Trenzas' },
  { tag: 'alisado', label: 'Alisado' },
  { tag: 'tinte', label: 'Tinte' },
  { tag: 'ninos', label: 'Niños' },
  { tag: 'clasico', label: 'Clásico' },
  { tag: 'navaja', label: 'Navaja' },
] as const;

export function formatPrice(price: number | null) {
  return price == null ? '$[PRECIO]' : `$${price.toFixed(2)}`;
}

/* "12", "12.5", "12,50" o "$12" → 12.5; vacío o inválido → null */
export function parsePrice(input: string): number | null {
  const clean = input.replace(/[$\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 && n < 1000 ? n : null;
}

/* Distancia desde `here`, o null si falta alguna de las dos ubicaciones. */
export function barberDistance(barber: Barber, here: LatLng | null) {
  return here && barber.location ? distanceKm(here, barber.location) : null;
}

/* "0.8 km · Bella Vista", o solo el barrio si no sabemos la distancia. */
export function formatDistance(barber: Barber, here: LatLng | null) {
  const km = barberDistance(barber, here);
  return km == null ? barber.area : `${formatKm(km)} · ${barber.area}`;
}
