import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
import { FormError } from '../components/SignIn';
import { api, errorMessage, type AdminReport } from '../state/api';
import { useAppState } from '../state/AppState';
import './screens.css';

function when(ms: number) {
  return new Date(ms).toLocaleDateString('es-PA', { day: 'numeric', month: 'short' });
}

/* Revisión de reportes (solo administradores): ver qué dicen y decidir si el perfil sigue oculto. */
export function AdminReportes() {
  const { isAdmin, refreshBarbers } = useAppState();
  const [items, setItems] = useState<AdminReport[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    api
      .adminReports()
      .then(setItems)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) return <Navigate to="/cuenta" replace />;

  const act = async (barberId: string, action: 'hide' | 'restore') => {
    setBusy(barberId);
    setError(undefined);
    try {
      await api.adminAction(barberId, action);
      load();
      refreshBarbers().catch(() => {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Screen>
      <div className="page-head">
        <Link to="/cuenta" className="icon-btn page-head__back" aria-label="Volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">Reportes</h1>
      </div>
      <FormError message={error} />
      {items?.length === 0 && <p className="t-body empty-state">No hay reportes por revisar.</p>}
      {items?.map((b) => (
        <section key={b.barberId} className="admin-card stack-10">
          <SectionHeader
            title={b.name}
            aside={b.hidden ? (b.hiddenBy === 'admin' ? 'Oculto por ti' : 'Oculto por reportes') : 'Visible'}
          />
          <span className="t-detail">{b.area}</span>
          <ul className="admin-reports" role="list">
            {b.reports.map((r, i) => (
              <li key={i}>
                <strong>{r.reason}</strong> · <span className="t-detail">{when(r.createdAt)}</span>
                {r.details && <p className="t-body">{r.details}</p>}
              </li>
            ))}
          </ul>
          <div className="button-pair button-pair--row">
            {!b.hidden && (
              <Link to={`/barbero/${b.barberId}`} className="btn btn--ghost">
                Ver perfil
              </Link>
            )}
            {b.hidden && b.hiddenBy === 'admin' ? (
              <Button variant="secondary" onClick={() => act(b.barberId, 'restore')} disabled={busy === b.barberId}>
                Volver a mostrar
              </Button>
            ) : (
              <>
                <Button variant="danger" onClick={() => act(b.barberId, 'hide')} disabled={busy === b.barberId}>
                  {b.hidden ? 'Mantener oculto' : 'Ocultar'}
                </Button>
                <Button variant="secondary" onClick={() => act(b.barberId, 'restore')} disabled={busy === b.barberId}>
                  Mostrar
                </Button>
              </>
            )}
          </div>
        </section>
      ))}
    </Screen>
  );
}
