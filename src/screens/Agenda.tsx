import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppointmentRow } from '../components/AppointmentRow';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
import { StatusTag } from '../components/StatusTag';
import { api, errorMessage, type Appointment } from '../state/api';
import { fromISODate, useAppState } from '../state/AppState';
import './screens.css';

/* Las citas que los clientes apartaron con este barbero. */
export function Agenda() {
  const { myBarber } = useAppState();
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    api
      .agenda()
      .then(setItems)
      .catch((err) => {
        setItems((prev) => prev ?? []);
        setError(errorMessage(err));
      });
  }, []);

  useEffect(() => {
    if (myBarber) load();
  }, [myBarber, load]);

  if (!myBarber) return <Navigate to="/soy-barbero" replace />;

  const act = async (id: string, action: 'confirm' | 'cancel') => {
    setBusy(id);
    setError(undefined);
    try {
      const updated = await api[action](id);
      setItems((list) => list?.map((a) => (a.id === id ? updated : a)) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  };

  const upcoming = items?.filter((a) => a.status !== 'cancelled') ?? [];

  return (
    <Screen footer={<BottomNav />}>
      <h1 className="t-title">Agenda</h1>

      {error && (
        <span className="field__error" role="alert">
          <Icon name="alert" size={16} strokeWidth={2} />
          {error}
        </span>
      )}

      {items == null ? (
        <p className="t-detail" role="status">
          Cargando…
        </p>
      ) : upcoming.length === 0 ? (
        <p className="t-body empty-state">Todavía no tienes citas. Cuando un cliente aparte contigo, aparece aquí.</p>
      ) : (
        <section className="stack-12">
          <SectionHeader title="Próximas" aside={`${upcoming.length} ${upcoming.length === 1 ? 'cita' : 'citas'}`} />
          {upcoming.map((a) => (
            <div key={a.id} className="stack-10">
              <AppointmentRow
                date={fromISODate(a.date)}
                hour={a.hour}
                service={a.serviceName}
                detail="Apartada desde la app"
                aside={<StatusTag status={a.status} compact />}
              />
              {a.status === 'pending' && (
                <div className="button-pair button-pair--row">
                  <Button onClick={() => act(a.id, 'confirm')} disabled={busy === a.id}>
                    Confirmar
                  </Button>
                  <Button variant="danger" onClick={() => act(a.id, 'cancel')} disabled={busy === a.id}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </Screen>
  );
}
