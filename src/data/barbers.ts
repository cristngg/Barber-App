/*
 * Datos de ejemplo (los mismos del diseño). Cambia esto por tu API.
 * Precios: `null` hasta que cada barbero ponga el suyo; se muestran como $[PRECIO].
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
  rating: number;
  distanceKm: number;
  freeToday: boolean;
  openNow: boolean;
  bio: string;
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

const DEFAULT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

export const barbers: Barber[] = [
  {
    id: 'carlos-m',
    name: 'Carlos M.',
    area: 'Bella Vista',
    specialties: ['Fade', 'Barba', 'Diseños'],
    tags: ['fade', 'barba', 'disenos'],
    rating: 4.9,
    distanceKm: 0.8,
    freeToday: true,
    openNow: true,
    bio: 'Fade, barba y diseños a navaja. Atiendo con cita, de martes a sábado.',
    photoCount: 24,
    workDays: [2, 3, 4, 5, 6],
    hours: DEFAULT_HOURS,
    services: [
      { id: 'fade-bajo', name: 'Fade bajo', price: null },
      { id: 'barba-navaja', name: 'Barba con navaja', price: null },
      { id: 'diseno-lineal', name: 'Diseño lineal', price: null },
      { id: 'corte-clasico', name: 'Corte clásico', price: null },
      { id: 'fade-medio', name: 'Fade medio', price: null },
      { id: 'corte-nino', name: 'Corte niño', price: null },
    ],
    map: { x: 26, y: 28 },
  },
  {
    id: 'la-esquina',
    name: 'Barbería La Esquina',
    area: 'El Cangrejo',
    specialties: ['Clásico', 'Navaja'],
    tags: ['clasico', 'navaja', 'barba'],
    rating: 4.7,
    distanceKm: 1.2,
    freeToday: true,
    openNow: true,
    bio: 'Corte clásico y afeitado a navaja caliente. Sin cita también, si hay puesto.',
    photoCount: 18,
    workDays: [1, 2, 3, 4, 5, 6],
    hours: DEFAULT_HOURS,
    services: [
      { id: 'corte-clasico', name: 'Corte clásico', price: null },
      { id: 'barba-navaja', name: 'Barba con navaja', price: null },
      { id: 'afeitado', name: 'Afeitado caliente', price: null },
    ],
    map: { x: 54, y: 52 },
  },
  {
    id: 'andres-r',
    name: 'Andrés R.',
    area: 'San Francisco',
    specialties: ['Niños', 'Fade'],
    tags: ['ninos', 'fade'],
    rating: 4.8,
    distanceKm: 2.1,
    freeToday: false,
    openNow: false,
    bio: 'Paciencia con los pelaos y fades limpios. Atiendo de miércoles a domingo.',
    photoCount: 12,
    workDays: [0, 3, 4, 5, 6],
    hours: DEFAULT_HOURS,
    services: [
      { id: 'corte-nino', name: 'Corte niño', price: null },
      { id: 'fade-bajo', name: 'Fade bajo', price: null },
      { id: 'fade-medio', name: 'Fade medio', price: null },
    ],
    map: { x: 74, y: 22 },
  },
];

export function getBarber(id: string | undefined) {
  return barbers.find((b) => b.id === id);
}

export function formatPrice(price: number | null) {
  return price == null ? '$[PRECIO]' : `$${price.toFixed(2)}`;
}

/* Horas ya tomadas: en la app real vienen del servidor. */
export function takenHours(barber: Barber, date: Date): number[] {
  const seed = date.getDate() + barber.id.length;
  return barber.hours.filter((_, i) => (i + seed) % 5 === 0);
}
