import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { ActionBar, Screen } from '../components/Screen';
import './screens.css';

const PLAN_PRICE = '$3.99';

const BENEFITS = [
  'Perfil público con tu portafolio de cortes',
  'Apareces cuando te buscan cerca',
  'Recibes citas en tu agenda',
];

export function Suscripcion() {
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; zone?: string }>({});
  const [sent, setSent] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : 'Escribe tu nombre o el de tu barbería.',
      zone: zone.trim() ? undefined : 'Escribe el barrio donde atiendes.',
    };
    setErrors(next);
    if (next.name || next.zone) return;
    // TODO: conectar con el cobro y la creación de cuenta.
    setSent(true);
  };

  return (
    <Screen
      footer={
        <ActionBar>
          <Button type="submit" form="plan-form" disabled={sent}>
            Crear mi cuenta · {PLAN_PRICE}/mes
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

      {sent ? (
        <div className="notice" role="status">
          <Icon name="check" size={20} strokeWidth={2.2} />
          Listo, {name.trim()}. Te avisamos cuando tu perfil esté publicado.
        </div>
      ) : (
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
      )}
    </Screen>
  );
}
