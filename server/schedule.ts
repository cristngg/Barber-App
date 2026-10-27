/*
 * Horario de cada barbero: horas por día de la semana, días libres y la duración de cada corte.
 * Todo en minutos desde la medianoche (9:30 = 570) y en la zona horaria del negocio.
 */

export type DayHours = { start: number; end: number } | null;
/* Índice 0 = domingo … 6 = sábado; null = no atiende ese día. */
export type Weekly = DayHours[];
export type Busy = { start: number; end: number }[];

/* Cada cuánto se ofrece una hora de inicio (9:00, 9:30, 10:00…). */
export const SLOT_STEP = 30;
export const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360];
export const DEFAULT_DURATION = 30;

export class ScheduleError extends Error {}

/* El horario de antes (días + horas sueltas) pasado a horas por día. */
export function weeklyFromLegacy(workDays: number[], hours: number[]): Weekly {
  const start = Math.min(...hours) * 60;
  const end = (Math.max(...hours) + 1) * 60;
  return Array.from({ length: 7 }, (_, d) => (workDays.includes(d) ? { start, end } : null));
}

export function parseWeekly(value: unknown): Weekly {
  if (!Array.isArray(value) || value.length !== 7) throw new ScheduleError('Horario no válido.');
  const weekly = value.map((day): DayHours => {
    if (day == null) return null;
    const { start, end } = day as { start?: unknown; end?: unknown };
    const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 24 * 60 && (n as number) % 15 === 0;
    if (!ok(start) || !ok(end)) throw new ScheduleError('Horario no válido.');
    if (end <= start) throw new ScheduleError('La hora de cierre debe ser después de la de apertura.');
    return { start, end };
  });
  if (!weekly.some(Boolean)) throw new ScheduleError('Abre al menos un día.');
  return weekly;
}

export function parseDaysOff(value: unknown, today: string): string[] {
  if (!Array.isArray(value) || value.length > 120) throw new ScheduleError('Días libres no válidos.');
  const days = value.filter((d): d is string => typeof d === 'string' && isValidDate(d));
  if (days.length !== value.length) throw new ScheduleError('Días libres no válidos.');
  /* Los días que ya pasaron no hacen falta. */
  return [...new Set(days.filter((d) => d >= today))].sort();
}

export function parseDuration(value: unknown): number {
  if (value == null) return DEFAULT_DURATION;
  if (typeof value !== 'number' || !DURATIONS.includes(value)) throw new ScheduleError('Elige cuánto dura el corte.');
  return value;
}

export function isValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function weekday(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/* "Hoy" y los minutos de ahora en la zona del negocio. */
export function nowIn(timeZone: string, at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function hoursOn(weekly: Weekly, daysOff: string[], date: string): DayHours {
  if (daysOff.includes(date)) return null;
  return weekly[weekday(date)];
}

/*
 * Horas de inicio libres para un corte de `duration` minutos: dentro del horario del día,
 * sin chocar con otras citas y, si es hoy, después de ahora.
 */
export function freeSlots(opts: {
  weekly: Weekly;
  daysOff: string[];
  date: string;
  duration: number;
  busy: Busy;
  now: { date: string; minutes: number };
}): number[] {
  const { weekly, daysOff, date, duration, busy, now } = opts;
  if (date < now.date) return [];
  const day = hoursOn(weekly, daysOff, date);
  if (!day) return [];
  const slots: number[] = [];
  for (let start = day.start; start + duration <= day.end; start += SLOT_STEP) {
    if (date === now.date && start <= now.minutes) continue;
    if (busy.some((b) => start < b.end && b.start < start + duration)) continue;
    slots.push(start);
  }
  return slots;
}

export function isOpenNow(weekly: Weekly, daysOff: string[], now: { date: string; minutes: number }) {
  const day = hoursOn(weekly, daysOff, now.date);
  return !!day && now.minutes >= day.start && now.minutes < day.end;
}
