/*
 * Búsqueda de cortes en español de Panamá: sin acentos, sin importar mayúsculas, "z" = "s"
 * (alizado = alisado) y con sinónimos de cada tipo de corte (pintado = tinte, braids = trenzas).
 */

/* Tipos de corte y especialidades: la misma lista para las dos cosas. */
export const STYLES: Record<string, string> = {
  fade: 'Fade',
  barba: 'Barba',
  disenos: 'Diseños',
  trenzas: 'Trenzas',
  alisado: 'Alisado',
  tinte: 'Tinte',
  ninos: 'Niños',
  clasico: 'Clásico',
  navaja: 'Navaja',
};
export const STYLE_ORDER = Object.keys(STYLES);

/* Palabras (ya normalizadas) que la gente usa para cada tipo. */
const SYNONYMS: Record<string, string[]> = {
  fade: ['fade', 'degradado', 'desvanecido', 'taper', 'low', 'mid', 'high'],
  barba: ['barba', 'perfilado', 'bigote'],
  disenos: ['diseno', 'disenos', 'raya', 'rayas', 'linea', 'lineas', 'dibujo', 'freestyle'],
  trenzas: ['trensa', 'trensas', 'braid', 'braids', 'cornrow', 'cornrows', 'twist', 'twists', 'dread', 'dreads', 'rasta', 'rastas'],
  alisado: ['alisado', 'alisar', 'keratina', 'planchado', 'plancha', 'brushing', 'laceado', 'botox'],
  tinte: ['tinte', 'tintes', 'pintado', 'pintar', 'pinta', 'color', 'colorear', 'decolorado', 'decoloracion', 'decolorar', 'mecha', 'mechas', 'rayitos', 'platinado', 'rubio', 'blondo', 'tenido'],
  ninos: ['nino', 'ninos', 'infantil', 'pelao', 'pelaos', 'chiquillo'],
  clasico: ['clasico', 'tijera', 'formal', 'ejecutivo'],
  navaja: ['navaja', 'afeitado', 'afeitar', 'rasurado', 'calvo', 'cero'],
};

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/z/g, 's')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Tipos a los que apunta una palabra: "pintado" → ["tinte"]. Acepta el comienzo de una palabra ("trenz"). */
export function stylesFor(token: string): string[] {
  if (token.length < 3) return [];
  return STYLE_ORDER.filter((style) => SYNONYMS[style].some((w) => w === token || (token.length >= 4 && w.startsWith(token))));
}

export type Searchable = { cutName: string; style: string | null; barberName: string; area: string; barberTags: string[] };

/* ¿El corte responde a la búsqueda? Cada palabra debe aparecer en el corte, el barbero o su tipo. */
export function matches(item: Searchable, query: string): boolean {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const text = normalize(`${item.cutName} ${item.barberName} ${item.area}`);
  return tokens.every((t) => {
    if (text.includes(t)) return true;
    const styles = stylesFor(t);
    return styles.length > 0 && (styles.includes(item.style ?? '') || (!item.style && styles.some((s) => item.barberTags.includes(s))));
  });
}
