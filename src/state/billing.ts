import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage, type Plan, type SubStatus, type Subscription } from './api';

export const PLAN_LABEL = '$3.99/mes';

export function formatPlan(plan: Plan) {
  return `$${(plan.amountCents / 100).toFixed(2)}`;
}

export function formatDay(ms: number) {
  return new Date(ms).toLocaleDateString('es-PA', { day: 'numeric', month: 'long' });
}

/* Qué decirle al barbero según el estado de su cuenta; null si no hay nada que avisar. */
export function subscriptionNotice(sub: Subscription | null): { tone: 'warn' | 'alert' | 'ok'; text: string; action?: string } | null {
  if (!sub) return null;
  const until = sub.periodEnd ? formatDay(sub.periodEnd) : '';
  const notices: Record<SubStatus, ReturnType<typeof subscriptionNotice>> = {
    pending: { tone: 'warn', text: 'Tu perfil todavía no sale en el mapa: falta activar tu cuenta.', action: `Activar · ${PLAN_LABEL}` },
    active: null,
    past_due: { tone: 'alert', text: `No pudimos cobrar tu mes. Tu perfil sigue visible unos días más.`, action: `Pagar · ${PLAN_LABEL}` },
    canceled: { tone: 'warn', text: `Cancelaste tu suscripción. Tu perfil sale hasta el ${until}.`, action: 'Reactivar' },
    expired: { tone: 'alert', text: 'Tu suscripción venció: tu perfil no sale y no recibes citas.', action: `Pagar · ${PLAN_LABEL}` },
  };
  return notices[sub.status];
}

export const STATUS_LABEL: Record<SubStatus, string> = {
  pending: 'Sin activar',
  active: 'Activa',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  expired: 'Vencida',
};

/* Abrir el pago: el proveedor de prueba es una pantalla de la app; uno real, una página de afuera. */
export function useCheckout() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const { url } = await api.checkout();
      if (url.startsWith('/')) navigate(url);
      else window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return { start, busy, error };
}
