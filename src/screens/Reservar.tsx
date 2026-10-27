import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDistance, formatPrice } from '../data/barbers';
import { formatDurationMin, formatMinutes, formatTimeRange, isSameDay, nextOpenDays, weekdayShort } from '../data/dates';
import { api, ApiError, errorMessage } from '../state/api';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { ActionBar, Screen } from '../components/Screen';
import { toISODate, useAppState } from '../state/AppState';
import { NotFound } from './NotFound';
import './screens.css';

/* Apartar en tres toques: servicio, hora, confirmar. Las horas salen del horario real y de cuánto dura el corte. */
export function Reservar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { book, getBarber, here } = useAppState();
  const barber = getBarber(id);

  /* Las próximas dos semanas en que atiende (sin sus días libres). */
  const days = useMemo(() => (barber ? nextOpenDays(barber.weekly, barber.daysOff, 14) : []), [barber]);
  const [params] = useSearchParams();
  const wanted = params.get('servicio');
  const [serviceId, setServiceId] = useState(
    barber?.services.find((s) => s.id === wanted)?.id ?? barber?.services[0]?.id ?? '',
  );
  const [day, setDay] = useState<Date | undefined>(days[0]);
  const [start, setStart] = useState<number | null>(null);
  /* Horas de inicio libres ese día para ese corte, según el servidor. null = cargando. */
  const [slots, setSlots] = useState<number[] | null>(null);
  const [reload, setReload] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const barberId = barber?.id;
  const dayISO = day ? toISODate(day) : undefined;
  useEffect(() => {
    if (!barberId || !dayISO || !serviceId) return;
    let alive = true;
    setSlots(null);
    api
      .availability(barberId, dayISO, serviceId)
      .then((r) => alive && setSlots(r.slots))
      .catch((err) => {
        if (!alive) return;
        setSlots([]);
        setError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [barberId, dayISO, serviceId, reload]);

  if (!barber) return <NotFound />;

  const service = barber.services.find((s) => s.id === serviceId);
  const ready = service && day && start != null;

  const confirm = async () => {
    if (!ready || sending) return;
    setSending(true);
    setError(undefined);
    try {
      const appt = await book({ barberId: barber.id, serviceId: service.id, date: toISODate(day), start });
      navigate('/citas', { state: { justBooked: appt.id } });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) {
        setStart(null);
        setReload((n) => n + 1);
      }
      setSending(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionBar>
          <div className="summary">
            <span className="summary__text">
              {ready
                ? `${service.name} · ${weekdayShort(day)} ${day.getDate()}, ${formatTimeRange(start, service.durationMin)}`
                : 'Elige servicio, día y hora'}
            </span>
            {service && <span className="summary__price">{formatPrice(service.price)}</span>}
          </div>
          {error && (
            <span className="field__error" role="alert">
              <Icon name="alert" size={16} strokeWidth={2} />
              {error}
            </span>
          )}
          <Button onClick={confirm} disabled={!ready || sending}>
            {sending ? 'Apartando…' : 'Confirmar cita'}
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
          <span className="t-detail">{formatDistance(barber, here)}</span>
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
                onClick={() => {
                  setServiceId(s.id);
                  setStart(null);
                }}
              >
                <span className="option__lead">
                  <Icon name={on ? 'checkCircle' : 'circle'} size={20} strokeWidth={on ? 2.2 : 2} />
                  <span className="option__name">
                    {s.name}
                    <span className="option__meta">{formatDurationMin(s.durationMin)}</span>
                  </span>
                </span>
                <span className="t-price">{formatPrice(s.price)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="step">
        <legend className="t-label">2 · Día</legend>
        <div className="day-row" role="radiogroup" aria-label="Día">
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
                  setStart(null);
                  setError(undefined);
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
        <div className="slot-grid" role="radiogroup" aria-label="Hora" aria-busy={slots == null}>
          {slots?.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={start === m}
              className="slot"
              aria-label={formatMinutes(m, true)}
              onClick={() => setStart(m)}
            >
              {formatMinutes(m)}
            </button>
          ))}
        </div>
        {slots == null && (
          <p className="t-detail" role="status">
            Buscando horas libres…
          </p>
        )}
        {slots?.length === 0 && <p className="t-detail">No quedan horas este día para este corte. Prueba otro día.</p>}
        {days.length === 0 && <p className="t-detail">Este barbero no tiene días disponibles por ahora.</p>}
      </fieldset>
    </Screen>
  );
}
