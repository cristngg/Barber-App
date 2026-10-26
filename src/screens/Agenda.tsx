import { Navigate } from 'react-router-dom';
import { AppointmentRow } from '../components/AppointmentRow';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { Screen, SectionHeader } from '../components/Screen';
import { StatusTag } from '../components/StatusTag';
import { fromISODate, toISODate, useAppState } from '../state/AppState';
import './screens.css';

/* Las citas que los clientes apartaron con este barbero. */
export function Agenda() {
  const { myBarber, appointments, confirm, cancel } = useAppState();
  if (!myBarber) return <Navigate to="/soy-barbero" replace />;

  const today = toISODate(new Date());
  const mine = appointments
    .filter((a) => a.barberId === myBarber.id && a.status !== 'cancelled' && a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);

  return (
    <Screen footer={<BottomNav />}>
      <h1 className="t-title">Agenda</h1>

      {mine.length === 0 ? (
        <p className="t-body empty-state">Todavía no tienes citas. Cuando un cliente aparte contigo, aparece aquí.</p>
      ) : (
        <section className="stack-12">
          <SectionHeader title="Próximas" aside={`${mine.length} ${mine.length === 1 ? 'cita' : 'citas'}`} />
          {mine.map((a) => {
            const service = myBarber.services.find((s) => s.id === a.serviceId);
            return (
              <div key={a.id} className="stack-10">
                <AppointmentRow
                  date={fromISODate(a.date)}
                  hour={a.hour}
                  service={service?.name ?? 'Corte'}
                  detail="Apartada desde la app"
                  aside={<StatusTag status={a.status} compact />}
                />
                {a.status === 'pending' && (
                  <div className="button-pair button-pair--row">
                    <Button onClick={() => confirm(a.id)}>Confirmar</Button>
                    <Button variant="danger" onClick={() => cancel(a.id)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </Screen>
  );
}
