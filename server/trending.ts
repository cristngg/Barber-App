import { randomUUID } from 'node:crypto';
import type { DB } from './db.js';
import { normalize, STYLE_ORDER, STYLES, stylesFor } from './search.js';

/*
 * Píldoras de búsqueda que se adaptan a cada zona: lo que más busca la gente cerca, con la palabra
 * que usan ahí ("rayitos" en un lugar, "mechas" en otro; las dos llevan a Tinte).
 * Privacidad: se guarda la ubicación redondeada (~1 km) y una palabra solo sale si la buscaron
 * varias personas distintas.
 */

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_KM = 50;
const MAX_TRENDING = 8;

export type Pill = { key: string; label: string; style: string | null; q: string | null; trending: boolean };

type LatLng = { lat: number; lng: number };

function km(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * Math.cos((a.lat + b.lat) * 0.5 * rad);
  return Math.sqrt(x * x + (b.lat - a.lat) ** 2) * 111.32;
}

/* "pintado" → "tinte"; varias palabras de tipos distintos → ninguno. */
function styleOf(term: string): string | null {
  const found = new Set(term.split(' ').flatMap(stylesFor));
  return found.size === 1 ? [...found][0] : null;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function createTrending(db: DB, { minUsers = 3 } = {}) {
  const recent = db.prepare('SELECT 1 FROM search_log WHERE user_id = ? AND term = ? AND created_at > ?');
  const today = db.prepare('SELECT COUNT(*) AS n FROM search_log WHERE user_id = ? AND created_at > ?');
  const insert = db.prepare(
    'INSERT INTO search_log (id, user_id, term, display, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const window = db.prepare('SELECT user_id, term, display, lat, lng FROM search_log WHERE created_at > ?');
  const prune = db.prepare('DELETE FROM search_log WHERE created_at < ?');

  return {
    /*
     * Anota una búsqueda terminada. Devuelve false si no cuenta: muy corta o larga, repetida por
     * la misma persona en 24 h, demasiadas hoy, o sin nada que ver con cortes (`useful`).
     */
    record(userId: string, raw: string, near: LatLng | null, useful: (term: string) => boolean) {
      const display = raw.trim().toLowerCase().replace(/\s+/g, ' ');
      const term = normalize(display);
      const now = Date.now();
      if (term.length < 3 || term.length > 40 || term.split(' ').length > 4) return false;
      if (recent.get(userId, term, now - 24 * 60 * 60 * 1000)) return false;
      if ((today.get(userId, now - 24 * 60 * 60 * 1000) as { n: number }).n >= 100) return false;
      if (!styleOf(term) && !useful(term)) return false;
      const round = (n: number) => Math.round(n * 100) / 100;
      insert.run(randomUUID(), userId, term, display, near ? round(near.lat) : null, near ? round(near.lng) : null, now);
      if (Math.random() < 0.01) prune.run(now - WINDOW_MS);
      return true;
    },

    /* Las píldoras para alguien en `near` (o en general, sin ubicación). */
    pills(near: LatLng | null): { pills: Pill[]; scope: 'local' | 'general' | 'none' } {
      type Row = { user_id: string; term: string; display: string; lat: number | null; lng: number | null };
      const rows = window.all(Date.now() - WINDOW_MS) as Row[];

      const rank = (subset: Row[]) => {
        const byTerm = new Map<string, { users: Set<string>; searches: number; displays: Map<string, number> }>();
        for (const r of subset) {
          const t = byTerm.get(r.term) ?? { users: new Set(), searches: 0, displays: new Map() };
          t.users.add(r.user_id);
          t.searches++;
          t.displays.set(r.display, (t.displays.get(r.display) ?? 0) + 1);
          byTerm.set(r.term, t);
        }
        return [...byTerm.entries()]
          .filter(([, t]) => t.users.size >= minUsers)
          .sort((a, b) => b[1].users.size - a[1].users.size || b[1].searches - a[1].searches)
          .map(([term, t]) => ({
            term,
            /* La forma en que más la escriben, con sus acentos. */
            display: [...t.displays.entries()].sort((a, b) => b[1] - a[1])[0][0],
          }));
      };

      const local = near ? rank(rows.filter((r) => r.lat != null && km(near, { lat: r.lat, lng: r.lng! }) <= LOCAL_KM)) : [];
      const general = local.length >= 4 ? [] : rank(rows);
      const scope = local.length ? 'local' : general.length ? 'general' : 'none';

      const pills: Pill[] = [];
      const usedStyles = new Set<string>();
      const usedTerms = new Set<string>();
      for (const { term, display } of [...local, ...general]) {
        if (pills.length >= MAX_TRENDING || usedTerms.has(term)) continue;
        const style = styleOf(term);
        /* Un tipo, una píldora: gana la palabra más buscada de la zona. */
        if (style && usedStyles.has(style)) continue;
        usedTerms.add(term);
        if (style) usedStyles.add(style);
        pills.push({ key: style ?? `q:${term}`, label: capitalize(display), style, q: style ? null : display, trending: true });
      }
      /* Después, los tipos que no salieron, para que nunca falten. */
      for (const style of STYLE_ORDER) {
        if (!usedStyles.has(style)) pills.push({ key: style, label: STYLES[style], style, q: null, trending: false });
      }
      return { pills, scope };
    },
  };
}
