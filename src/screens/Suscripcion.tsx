import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { PhoneVerify } from '../components/PhoneVerify';
import { ActionBar, Screen, SectionHeader } from '../components/Screen';
import { errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import { useCheckout } from '../state/billing';
import './screens.css';

const PLAN_PRICE = '$3.99';

const BENEFITS = [
  'Perfil público con tu portafolio de cortes',
  'Apareces cuando te buscan cerca',
  'Recibes citas en tu agenda',
];

export function Suscripcion() {
  const { myBarber, createMyBarber, user, config, phone } = useAppState();
  /* Si se pide, primero el celular verificado (una cuenta por número). */
  const needsPhone = config.phoneVerification && !phone.verified;
  const checkout = useCheckout();
  const [hadAccount] = useState(!!myBarber);
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [zone, setZone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; zone?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  /* Si ya tenía cuenta al llegar, va a su portafolio (ahí está el aviso para pagar si falta). */
  if (hadAccount) return <Navigate to="/mi-perfil" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : 'Escribe tu nombre o el de tu barbería.',
      zone: zone.trim() ? undefined : 'Escribe el barrio donde atiendes.',
    };
    setErrors(next);
    if (next.name || next.zone || saving || needsPhone) return;
    /* La cuenta ya se creó pero el pago no abrió: solo reintentar el pago. */
    if (myBarber) {
      await checkout.start();
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      await createMyBarber(name.trim(), zone.trim());
      /* Con cobro: la cuenta queda pendiente y se abre el pago. Sin cobro: ya es pública. */
      if (config.billing) await checkout.start();
      else navigate('/mi-perfil', { replace: true, state: { welcome: true } });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionBar>
          {(saveError ?? checkout.error) && (
            <span className="field__error" role="alert">
              <Icon name="alert" size={16} strokeWidth={2} />
              {saveError ?? checkout.error}
            </span>
          )}
          {needsPhone && <span className="t-detail fine-print">Primero verifica tu celular.</span>}
          <Button type="submit" form="plan-form" disabled={saving || checkout.busy || needsPhone}>
            {saving ? 'Creando tu cuenta…' : `Crear mi cuenta · ${PLAN_PRICE}/mes`}
          </Button>
          <span className="t-detail fine-print">[TÉRMINOS DE COBRO Y CANCELACIÓN]</span>
        </ActionBar>
      }
    >
      <Link to="/cuenta" className="icon-btn page-head__back" aria-label="Volver">
        <Icon name="back" size={22} strokeWidth={2} />
      </Link>

      <div className="stack-16">
        <div className="polo-ribbon plan-ribbon" aria-hidden="true" />
        <h1 className="t-display plan-title">Muestra tus cortes. Que te encuentren cerca.</h1>
      </div>

      <div className="plan-price">
        <span className="plan-price__amount">{PLAN_PRICE}</span>
        <span className="plan-price__unit">al mes · cuenta de barbero</span>
      </div>

      <ul className="check-list">
        {BENEFITS.map((b) => (
          <li key={b}>
            <Icon name="check" size={20} strokeWidth={2.2} />
            {b}
          </li>
        ))}
      </ul>

      {config.phoneVerification && (
        <section className="stack-12">
          <SectionHeader title="1 · Tu celular" />
          <PhoneVerify />
        </section>
      )}

      {config.phoneVerification && <SectionHeader title="2 · Tu barbería" />}
      <form id="plan-form" className="stack-14" onSubmit={submit} noValidate>
        <TextField
          label="Tu nombre o el de tu barbería"
          placeholder="Carlos M."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoComplete="organization"
        />
        <TextField
          label="Barrio o zona"
          placeholder="Bella Vista"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          error={errors.zone}
        />
      </form>
    </Screen>
  );
}
