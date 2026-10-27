import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { DayHours } from '../data/barbers';
import { formatMinutes, isoDate, WEEKDAYS_LONG } from '../data/dates';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { ActionBar, Screen, SectionHeader } from '../components/Screen';
import { FormError } from '../components/SignIn';
import { errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import './screens.css';

/* Lunes primero, como se lee una semana de trabajo. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
/* Opciones cada 30 min, de 5:00 a. m. a medianoche. */
const TIMES = Array.from({ length: 39 }, (_, i) => 5 * 60 + i * 30);
const DEFAULT_DAY = { start: 9 * 60, end: 17 * 60 };
/* Si ya tenía una hora fuera de la lista (p. ej. 8:15), que siga apareciendo. */
const timesWith = (m: number) => (TIMES.includes(m) ? TIMES : [...TIMES, m].sort((a, b) => a - b));

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* Horario del barbero: horas de cada día y días libres (vacaciones, feriados, un día que no puede). */
export function Horario() {
  const { myBarber, updateMyBarber } = useAppState();
  const navigate = useNavigate();
  const [weekly, setWeekly] = useState<DayHours[]>(() => myBarber?.weekly ?? []);
  const [daysOff, setDaysOff] = useState<string[]>(() => myBarber?.daysOff ?? []);
  const [newDay, setNewDay] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!myBarber) return <Navigate to="/soy-barbero" replace />;

  const setDay = (day: number, value: DayHours) => setWeekly((w) => w.map((d, i) => (i === day ? value : d)));
  const today = isoDate(new Date());
  const anyOpen = weekly.some(Boolean);
  const invalid = weekly.some((d) => d && d.end <= d.start);

  const addDayOff = () => {
    if (!newDay || newDay < today || daysOff.includes(newDay)) return;
    setDaysOff((list) => [...list, newDay].sort());
    setNewDay('');
  };

  const save = async () => {
    if (!anyOpen || invalid || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await updateMyBarber({ weekly, daysOff });
      navigate('/mi-perfil');
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionBar>
          <FormError message={error ?? (!anyOpen ? 'Abre al menos un día.' : invalid ? 'Revisa las horas: el cierre va después de la apertura.' : undefined)} />
          <Button onClick={save} disabled={saving || !anyOpen || invalid}>
            {saving ? 'Guardando…' : 'Guardar horario'}
          </Button>
        </ActionBar>
      }
    >
      <div className="page-head">
        <Link to="/mi-perfil" className="icon-btn page-head__back" aria-label="Volver sin guardar">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">Horario</h1>
      </div>
      <p className="t-detail">Los clientes solo pueden apartar dentro de estas horas, y según lo que dura cada corte.</p>

      <section className="stack-10" aria-label="Horas de cada día">
        {WEEK_ORDER.map((d) => {
          const hours = weekly[d];
          const name = capitalize(WEEKDAYS_LONG[d]);
          return (
            <div key={d} className={`week-day${hours ? '' : ' week-day--closed'}`}>
              <div className="week-day__head">
                <span className="week-day__name">{name}</span>
                <Chip selected={!!hours} onToggle={() => setDay(d, hours ? null : DEFAULT_DAY)}>
                  {hours ? 'Abierto' : 'Cerrado'}
                </Chip>
              </div>
              {hours && (
                <div className="week-day__hours">
                  <label className="time-select">
                    <span className="t-detail">Abre</span>
                    <select value={hours.start} onChange={(e) => setDay(d, { ...hours, start: Number(e.target.value) })}>
                      {timesWith(hours.start).map((t) => (
                        <option key={t} value={t}>
                          {formatMinutes(t, true)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="time-select">
                    <span className="t-detail">Cierra</span>
                    <select value={hours.end} onChange={(e) => setDay(d, { ...hours, end: Number(e.target.value) })}>
                      {timesWith(hours.end).map((t) => (
                        <option key={t} value={t}>
                          {formatMinutes(t, true)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="stack-12">
        <SectionHeader title="Días libres" aside={daysOff.length ? `${daysOff.length}` : undefined} />
        <p className="t-detail">Vacaciones, feriados o un día que no puedes: esos días nadie aparta contigo.</p>
        <div className="day-off-add">
          <label className="time-select">
            <span className="t-detail">Día</span>
            <input type="date" min={today} value={newDay} onChange={(e) => setNewDay(e.target.value)} />
          </label>
          <Button variant="secondary" onClick={addDayOff} disabled={!newDay || newDay < today}>
            Agregar
          </Button>
        </div>
        {daysOff.length > 0 && (
          <ul className="day-off-list" role="list">
            {daysOff.map((day) => (
              <li key={day} className="day-off">
                <span>{capitalize(formatDay(day))}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Quitar ${formatDay(day)}`}
                  onClick={() => setDaysOff((list) => list.filter((x) => x !== day))}
                >
                  <Icon name="x" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  );
}
