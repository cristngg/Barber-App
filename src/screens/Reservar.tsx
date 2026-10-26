import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDistance, formatPrice, takenHours } from '../data/barbers';
import { formatHour, isSameDay, nextWorkDays, weekdayShort } from '../data/dates';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { ActionBar, Screen } from '../components/Screen';
import { toISODate, useAppState } from '../state/AppState';
import { NotFound } from './NotFound';
import './screens.css';

/* Apartar en tres toques: servicio, hora, confirmar. */
export function Reservar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { book, getBarber } = useAppState();
  const barber = getBarber(id);

  const days = useMemo(() => (barber ? nextWorkDays(barber.workDays, 5) : []), [barber]);
  const [serviceId, setServiceId] = useState(barber?.services[0]?.id ?? '');
  const [day, setDay] = useState<Date | undefined>(days[0]);
  const [hour, setHour] = useState<number | null>(null);

  if (!barber) return <NotFound />;

  const service = barber.services.find((s) => s.id === serviceId);
  const taken = day ? takenHours(barber, day) : [];
  const now = new Date();
  const isPast = (h: number) => !!day && isSameDay(day, now) && h <= now.getHours();
  const ready = service && day && hour != null;

  const confirm = () => {
    if (!ready) return;
    const appt = book({ barberId: barber.id, serviceId: service.id, date: toISODate(day), hour });
    navigate('/citas', { state: { justBooked: appt.id } });
  };

  return (
    <Screen
      footer={
        <ActionBar>
          <div className="summary">
            <span className="summary__text">
              {ready
                ? `${service.name} · ${weekdayShort(day)} ${day.getDate()}, ${formatHour(hour, true)}`
                : 'Elige servicio, día y hora'}
            </span>
            {service && <span className="summary__price">{formatPrice(service.price)}</span>}
          </div>
          <Button onClick={confirm} disabled={!ready}>
            Confirmar cita
          </Button>
        </ActionBar>
      }
    >
      <div className="page-head">
        <Link to={`/barbero/${barber.id}`} className="icon-btn page-head__back" aria-label="Volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">Apartar cita</h1>
      </div>

      <div className="mini-barber">
        <Photo src={barber.avatar} alt="" label="" className="mini-barber__photo" />
        <div className="mini-barber__body">
          <span className="mini-barber__name">{barber.name}</span>
          <span className="t-detail">{formatDistance(barber)}</span>
        </div>
      </div>

      <fieldset className="step">
        <legend className="t-label">1 · Servicio</legend>
        <div className="stack-10" role="radiogroup" aria-label="Servicio">
          {barber.services.map((s) => {
            const on = s.id === serviceId;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                className="option"
                onClick={() => setServiceId(s.id)}
              >
                <span className="option__lead">
                  <Icon name={on ? 'checkCircle' : 'circle'} size={20} strokeWidth={on ? 2.2 : 2} />
                  <span>{s.name}</span>
                </span>
                <span className="t-price">{formatPrice(s.price)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="step">
        <legend className="t-label">2 · Día</legend>
        <div className="day-grid" role="radiogroup" aria-label="Día">
          {days.map((d) => {
            const on = !!day && isSameDay(d, day);
            return (
              <button
                key={d.toISOString()}
                type="button"
                role="radio"
                aria-checked={on}
                className="day"
                onClick={() => {
                  setDay(d);
                  setHour(null);
                }}
              >
                <span className="day__dow">{weekdayShort(d)}</span>
                <span className="day__num">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="step">
        <legend className="t-label">3 · Hora</legend>
        <div className="slot-grid" role="radiogroup" aria-label="Hora">
          {barber.hours.map((h) => {
            const unavailable = taken.includes(h) || isPast(h);
            return (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={hour === h}
                className="slot"
                disabled={unavailable}
                aria-label={unavailable ? `${formatHour(h, true)}, ya la tomaron` : formatHour(h, true)}
                onClick={() => setHour(h)}
              >
                {formatHour(h)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </Screen>
  );
}
