export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function weekdayShort(date: Date) {
  return WEEKDAYS_SHORT[date.getDay()];
}

export function weekdayLong(date: Date) {
  return WEEKDAYS_LONG[date.getDay()];
}

const suffix = (minutes: number) => (minutes < 12 * 60 ? 'a.\u00a0m.' : 'p.\u00a0m.');

/* Minutos desde la medianoche → "3:30" o, con sufijo, "3:30 p. m." */
export function formatMinutes(minutes: number, withSuffix = false) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const base = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`;
  return withSuffix ? `${base}\u00a0${suffix(minutes)}` : base;
}

/* "3:00 – 3:45 p. m." (el sufijo una vez si ambas son de tarde o de mañana) */
export function formatTimeRange(start: number, duration: number) {
  const end = start + duration;
  return suffix(start) === suffix(end)
    ? `${formatMinutes(start)}\u00a0–\u00a0${formatMinutes(end, true)}`
    : `${formatMinutes(start, true)}\u00a0–\u00a0${formatMinutes(end, true)}`;
}

/* 30 → "30 min", 90 → "1 h 30 min" */
export function formatDurationMin(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return minutes % 60 ? `${h} h ${minutes % 60} min` : `${h} h`;
}

/* Los próximos `count` días en que el barbero atiende (sin sus días libres), empezando hoy. */
export function nextOpenDays(
  weekly: ({ start: number; end: number } | null)[],
  daysOff: string[],
  count: number,
  from = new Date(),
) {
  const days: Date[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; days.length < count && i < 60; i++) {
    if (weekly[d.getDay()] && !daysOff.includes(isoDate(d))) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* "el sábado" / "hoy" / "mañana" */
export function relativeDay(date: Date, now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(date, now)) return 'hoy';
  if (isSameDay(date, tomorrow)) return 'mañana';
  return `el ${weekdayLong(date)}`;
}
