import { useEffect, useState } from 'react';
import { SPECIALTIES } from '../data/barbers';
import { api, type Pill } from './api';
import { useAppState } from './AppState';

/* Mientras llegan las de la zona (o si falla la red): los tipos fijos. */
const FALLBACK: Pill[] = SPECIALTIES.map((s) => ({ key: s.tag, label: s.label, style: s.tag, q: null, trending: false }));

const cache = new Map<string, { at: number; pills: Pill[] }>();
const TTL = 10 * 60 * 1000;

/* Las píldoras de búsqueda de la zona: lo que más busca la gente cerca, con su palabra. */
export function useTrendingPills(): Pill[] {
  const { here } = useAppState();
  /* ~10 km: moverse un poco no cambia las píldoras. */
  const key = here ? `${here.lat.toFixed(1)},${here.lng.toFixed(1)}` : 'general';
  const [pills, setPills] = useState<Pill[]>(() => cache.get(key)?.pills ?? FALLBACK);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) {
      setPills(hit.pills);
      return;
    }
    let alive = true;
    api
      .trending(here)
      .then((r) => {
        cache.set(key, { at: Date.now(), pills: r.pills });
        if (alive) setPills(r.pills);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  return pills;
}

const logged = new Set<string>();

/* Cuenta una búsqueda cuando la persona dejó de escribir un rato (no cada letra). */
export function useSearchLogger(query: string) {
  const { here } = useAppState();
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 3 || logged.has(q)) return;
    const t = window.setTimeout(() => {
      logged.add(q);
      api.logSearch(q, here).catch(() => logged.delete(q));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [query]);
}
