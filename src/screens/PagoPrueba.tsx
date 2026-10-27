import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ActionBar, Screen } from '../components/Screen';
import { FormError } from '../components/SignIn';
import { api, errorMessage, type Plan } from '../state/api';
import { useAppState } from '../state/AppState';
import { formatPlan } from '../state/billing';
import './screens.css';

/*
 * Pago simulado (proveedor de prueba). Aquí iría la página de PayPal u otro proveedor:
 * no pide tarjeta ni cobra nada; solo deja probar qué pasa cuando el pago sale bien o mal.
 */
export function PagoPrueba() {
  const { id = '' } = useParams();
  const { refreshMe, refreshBarbers } = useAppState();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ plan: Plan; barberName: string; open: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.testPayment(id).then(setInfo).catch((err) => setError(errorMessage(err)));
  }, [id]);

  const finish = async (outcome: 'pay' | 'fail') => {
    setBusy(true);
    setError(undefined);
    try {
      await api.testPaymentOutcome(id, outcome);
      await refreshMe();
      await refreshBarbers();
      navigate('/mi-perfil', { replace: true, state: { payment: outcome } });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionBar>
          <FormError message={error} />
          <Button onClick={() => finish('pay')} disabled={!info?.open || busy}>
            {busy ? 'Procesando…' : info ? `Pagar ${formatPlan(info.plan)}` : 'Pagar'}
          </Button>
          <Button variant="ghost" onClick={() => finish('fail')} disabled={!info?.open || busy}>
            Simular pago rechazado
          </Button>
        </ActionBar>
      }
    >
      <div className="page-head">
        <Link to="/mi-perfil" className="icon-btn page-head__back" aria-label="Cancelar y volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">Pago</h1>
      </div>

      <div className="notice notice--warn" role="note">
        <Icon name="info" size={20} strokeWidth={2} />
        <span>Modo de prueba: no se cobra nada. Cuando conectes PayPal u otro proveedor, aquí se abre su página de pago.</span>
      </div>

      {info && (
        <div className="plan-card">
          <div className="polo-ribbon plan-card__ribbon" aria-hidden="true" />
          <span className="t-label">Cuenta de barbero</span>
          <span className="t-card-title">{info.barberName}</span>
          <div className="plan-price">
            <span className="plan-price__amount">{formatPlan(info.plan)}</span>
            <span className="plan-price__unit">al mes · {info.plan.days} días por pago</span>
          </div>
          {!info.open && <p className="t-detail">Este pago ya se cerró. Vuelve a tu portafolio para empezar otro.</p>}
        </div>
      )}
    </Screen>
  );
}
