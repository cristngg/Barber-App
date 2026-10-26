import { useLocation } from 'react-router-dom';
import { getBarber } from '../data/barbers';
import { formatHour, relativeDay } from '../data/dates';
import { AppointmentRow } from '../components/AppointmentRow';
import { BottomNav } from '../components/BottomNav';
import { Button, ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
import { StatusTag } from '../components/StatusTag';
import { fromISODate, useAppState } from '../state/AppState';
import './screens.css';

export function Citas() {
  const { appointments, cancel } = useAppState();
  const location = useLocation();
  const justBooked = (location.state as { justBooked?: string } | null)?.justBooked;

  const sorted = [...appointments].sort(
    (a, b) => a.date.localeCompare(b.date) || a.hour - b.hour,
  );
  const upcoming = sorted.filter((a) => a.status !== 'cancelled');
  const cancelled = sorted.filter((a) => a.status === 'cancelled');
  const booked = appointments.find((a) => a.id === justBooked && a.status !== 'cancelled');
  const bookedBarber = booked && getBarber(booked.barberId);

  return (
    <Screen footer={<BottomNav />}>
      <h1 className="t-title">Mis citas</h1>

      {booked && bookedBarber && (
        <div className="notice" role="status">
          <Icon name="check" size={20} strokeWidth={2.2} />
          Listo, {bookedBarber.name} te espera {relativeDay(fromISODate(booked.date))} a las{' '}
          {formatHour(booked.hour, true)}
        </div>
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
          {upcoming.map((a) => {
            const barber = getBarber(a.barberId);
            const service = barber?.services.find((s) => s.id === a.serviceId);
            if (!barber || !service) return null;
            return (
              <div key={a.id} className="stack-10">
                <AppointmentRow
                  date={fromISODate(a.date)}
                  hour={a.hour}
                  service={service.name}
                  barberName={barber.name}
                  aside={<StatusTag status={a.status} compact />}
                />
                <Button variant="danger" onClick={() => cancel(a.id)}>
                  Cancelar cita
                </Button>
              </div>
            );
          })}
        </section>
      )}

      {cancelled.length > 0 && (
        <section className="stack-12">
          <SectionHeader title="Canceladas" />
          {cancelled.map((a) => {
            const barber = getBarber(a.barberId);
            const service = barber?.services.find((s) => s.id === a.serviceId);
            if (!barber || !service) return null;
            return (
              <AppointmentRow
                key={a.id}
                date={fromISODate(a.date)}
                hour={a.hour}
                service={service.name}
                barberName={barber.name}
                aside={<StatusTag status="cancelled" compact />}
              />
            );
          })}
        </section>
      )}
    </Screen>
  );
}
