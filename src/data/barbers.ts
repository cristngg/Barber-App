/*
 * Forma de un barbero tal como la devuelve la API (server/app.ts).
 * Precios: `null` hasta que el barbero ponga el suyo; se muestran como $[PRECIO].
 */

export type Service = {
  id: string;
  name: string;
  price: number | null;
  photo?: string;
};

export type Barber = {
  id: string;
  name: string;
  area: string;
  specialties: string[];
  tags: string[];
  /* null = perfil nuevo, aún sin valoraciones */
  rating: number | null;
  /* null = distancia desconocida */
  distanceKm: number | null;
  freeToday: boolean;
  openNow: boolean;
  bio: string;
  /* URL de la foto en el servidor (ver state/photos) */
  avatar?: string;
  cover?: string;
  photoCount: number;
  /* Días que atiende: 0 = domingo … 6 = sábado */
  workDays: number[];
  /* Horas de atención en formato 24 h */
  hours: number[];
  services: Service[];
  /* Posición en el mini mapa, en % del ancho y alto */
  map: { x: number; y: number };
};

/* Especialidades que un barbero puede marcar en su perfil. */
export const SPECIALTIES = [
  { tag: 'fade', label: 'Fade' },
  { tag: 'barba', label: 'Barba' },
  { tag: 'disenos', label: 'Diseños' },
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

export function formatDistance(barber: Barber) {
  return barber.distanceKm == null ? barber.area : `${barber.distanceKm.toFixed(1)} km · ${barber.area}`;
}
