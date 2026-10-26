const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function weekdayShort(date: Date) {
  return WEEKDAYS_SHORT[date.getDay()];
}

export function weekdayLong(date: Date) {
  return WEEKDAYS_LONG[date.getDay()];
}

/* 15 → "3:00" o, con sufijo, "3:00 p. m." */
export function formatHour(hour: number, withSuffix = false) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const base = `${h12}:00`;
  if (!withSuffix) return base;
  return `${base}\u00a0${hour < 12 ? 'a.\u00a0m.' : 'p.\u00a0m.'}`;
}

/* Los próximos `count` días en que el barbero atiende, empezando hoy. */
export function nextWorkDays(workDays: number[], count: number, from = new Date()) {
  const days: Date[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; days.length < count && i < 31; i++) {
    if (workDays.includes(d.getDay())) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
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
