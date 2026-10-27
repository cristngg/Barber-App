export type LatLng = { lat: number; lng: number };

/* Centro por defecto mientras no sepamos dónde está la persona: Ciudad de Panamá. */
export const DEFAULT_CENTER: LatLng = { lat: 8.9833, lng: -79.5199 };

/* Distancia en línea recta (haversine), en km. */
export function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* 0.35 → "350 m", 1.234 → "1.2 km" */
export function formatKm(km: number) {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/* Abre la ruta en Google Maps (o la app de mapas del teléfono). */
export function directionsUrl(to: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;
}
