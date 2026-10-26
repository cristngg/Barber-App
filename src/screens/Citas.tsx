import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatHour, relativeDay } from '../data/dates';
import { AppointmentRow } from '../components/AppointmentRow';
import { BottomNav } from '../components/BottomNav';
import { Button, ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
import { StatusTag } from '../components/StatusTag';
import { errorMessage } from '../state/api';
import { fromISODate, toISODate, useAppState } from '../state/AppState';
import './screens.css';

export function Citas() {
  const { appointments, cancel, refreshAppointments } = useAppState();
  const location = useLocation();
  const justBooked = (location.state as { justBooked?: string } | null)?.justBooked;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  /* El barbero pudo confirmar o cancelar desde su agenda. */
  useEffect(() => {
    refreshAppointments().catch(() => {});
  }, [refreshAppointments]);

  const today = toISODate(new Date());
  const sorted = [...appointments].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  const upcoming = sorted.filter((a) => a.status !== 'cancelled' && a.date >= today);
  const cancelled = sorted.filter((a) => a.status === 'cancelled' && a.date >= today);
  const booked = appointments.find((a) => a.id === justBooked && a.status !== 'cancelled');

  const onCancel = async (id: string) => {
    setBusy(id);
    setError(undefined);
    try {
      await cancel(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Screen footer={<BottomNav />}>
      <h1 className="t-title">Mis citas</h1>

      {booked && (
        <div className="notice" role="status">
          <Icon name="check" size={20} strokeWidth={2.2} />
          Listo, {booked.barberName} te espera {relativeDay(fromISODate(booked.date))} a las {formatHour(booked.hour, true)}
        </div>
      )}

      {error && (
        <span className="field__error" role="alert">
          <Icon name="alert" size={16} strokeWidth={2} />
          {error}
        </span>
      )}

      {upcoming.length === 0 ? (
        <div className="empty-state">
          <p className="t-body">Todavía no tienes citas. Busca un barbero cerca y aparta tu puesto.</p>
          <ButtonLink to="/" variant="secondary" icon={<Icon name="pin" size={20} />}>
            Explorar barberos
          </ButtonLink>
        </div>
      ) : (
        <section className="stack-12">
          <SectionHeader title="Próximas" />
          {upcoming.map((a) => (
            <div key={a.id} className="stack-10">
              <AppointmentRow
                date={fromISODate(a.date)}
                hour={a.hour}
                service={a.serviceName}
                detail={`con ${a.barberName}`}
                aside={<StatusTag status={a.status} compact />}
              />
              <Button variant="danger" onClick={() => onCancel(a.id)} disabled={busy === a.id}>
                {busy === a.id ? 'Cancelando…' : 'Cancelar cita'}
              </Button>
            </div>
          ))}
        </section>
      )}

      {cancelled.length > 0 && (
        <section className="stack-12">
          <SectionHeader title="Canceladas" />
          {cancelled.map((a) => (
            <AppointmentRow
              key={a.id}
              date={fromISODate(a.date)}
              hour={a.hour}
              service={a.serviceName}
              detail={`con ${a.barberName}`}
              aside={<StatusTag status="cancelled" compact />}
            />
          ))}
        </section>
      )}
    </Screen>
  );
}
