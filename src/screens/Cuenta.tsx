import { Link, useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { Chip, ChipRow } from '../components/Chip';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
import { useState } from 'react';
import { FormError } from '../components/SignIn';
import { api, errorMessage } from '../state/api';
import { useAppState, type Mode } from '../state/AppState';
import { formatDay, PLAN_LABEL, STATUS_LABEL, useCheckout } from '../state/billing';
import './screens.css';

export function Cuenta() {
  const { theme, setTheme, mode, setMode, myBarber, user, signOut, config, subscription, refreshMe } = useAppState();
  const navigate = useNavigate();
  const checkout = useCheckout();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const cancelSubscription = async () => {
    if (!subscription?.periodEnd) return;
    if (!window.confirm(`¿Cancelar? Tu perfil sigue saliendo hasta el ${formatDay(subscription.periodEnd)} y luego deja de salir.`)) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.cancelSubscription();
      await refreshMe();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    navigate(next === 'barber' ? '/mi-perfil' : '/');
  };

  return (
    <Screen footer={<BottomNav />}>
      <h1 className="t-title">Cuenta</h1>

      {user && (
        <section className="stack-12">
          <div className="user-row">
            {user.picture ? (
              <img src={user.picture} alt="" className="user-row__avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="user-row__avatar photo" aria-hidden="true" />
            )}
            <div className="user-row__body">
              <span className="t-card-title">{user.name ?? 'Sin nombre'}</span>
              {user.email && <span className="t-detail">{user.email}</span>}
            </div>
          </div>
          <Button variant="secondary" onClick={() => signOut().then(() => navigate('/'))}>
            Cerrar sesión
          </Button>
        </section>
      )}

      {myBarber && (
        <section className="stack-12">
          <SectionHeader title="Usar Filo como" />
          <ChipRow label="Usar Filo como">
            <Chip selected={mode === 'client'} onToggle={() => switchMode('client')}>
              Cliente
            </Chip>
            <Chip selected={mode === 'barber'} onToggle={() => switchMode('barber')}>
              Barbero
            </Chip>
          </ChipRow>
        </section>
      )}

      <section className="stack-12">
        <SectionHeader title="Tema" />
        <ChipRow label="Tema">
          <Chip selected={theme === 'dark'} onToggle={() => setTheme('dark')}>
            Oscuro
          </Chip>
          <Chip selected={theme === 'light'} onToggle={() => setTheme('light')}>
            Claro
          </Chip>
        </ChipRow>
      </section>

      {myBarber && (
        <section className="stack-12">
          <SectionHeader title="Tu perfil de barbero" />
          <Link to="/mi-perfil/editar" className="promo">
            <span className="promo__body">
              <span className="t-card-title">{myBarber.name}</span>
              <span className="t-detail">Edita tu foto, descripción y especialidades.</span>
            </span>
            <Icon name="chevron" size={22} />
          </Link>
        </section>
      )}

      {myBarber && config.billing && subscription && (
        <section className="stack-12">
          <SectionHeader title="Suscripción" aside={STATUS_LABEL[subscription.status]} />
          <div className="sub-card">
            <span className="t-card-title">Cuenta de barbero · {PLAN_LABEL}</span>
            <span className="t-detail">
              {subscription.status === 'active' && subscription.periodEnd && `Pagada hasta el ${formatDay(subscription.periodEnd)}.`}
              {subscription.status === 'canceled' && subscription.periodEnd && `No se renueva. Tu perfil sale hasta el ${formatDay(subscription.periodEnd)}.`}
              {subscription.status === 'past_due' && 'No pudimos cobrar el último mes.'}
              {subscription.status === 'pending' && 'Todavía no la activas: tu perfil no sale.'}
              {subscription.status === 'expired' && 'Venció: tu perfil no sale y no recibes citas.'}
            </span>
          </div>
          {subscription.status === 'active' || subscription.status === 'past_due' ? (
            <Button variant="danger" onClick={cancelSubscription} disabled={busy}>
              {busy ? 'Cancelando…' : 'Cancelar suscripción'}
            </Button>
          ) : (
            <Button onClick={checkout.start} disabled={checkout.busy}>
              {subscription.status === 'canceled' ? 'Reactivar' : `Pagar · ${PLAN_LABEL}`}
            </Button>
          )}
          <FormError message={error ?? checkout.error} />
        </section>
      )}

      {!myBarber && (
        <section className="stack-12">
          <SectionHeader title="¿Eres barbero?" />
          <Link to="/soy-barbero" className="promo">
            <span className="promo__ribbon polo-ribbon" aria-hidden="true" />
            <span className="promo__body">
              <span className="t-card-title">Muestra tus cortes</span>
              <span className="t-detail">Crea tu cuenta de barbero por $3.99 al mes.</span>
            </span>
            <Icon name="chevron" size={22} />
          </Link>
        </section>
      )}
    </Screen>
  );
}
