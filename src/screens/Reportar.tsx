import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ButtonLink } from '../components/Button';
import { TextArea } from '../components/Field';
import { Icon } from '../components/Icon';
import { ActionBar, Screen } from '../components/Screen';
import { FormError } from '../components/SignIn';
import { api, errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import { NotFound } from './NotFound';
import './screens.css';

/* Los mismos motivos que el servidor (ver server/reports.ts). */
const REASONS = [
  { id: 'falso', label: 'Perfil falso', hint: 'No es una barbería real o se hace pasar por otra persona.' },
  { id: 'fotos', label: 'Fotos que no son suyas', hint: 'Usa cortes de otros barberos.' },
  { id: 'trato', label: 'Mal trato o acoso', hint: 'Te faltó el respeto o te hizo sentir inseguro.' },
  { id: 'cobro', label: 'Cobro indebido o estafa', hint: 'Te cobró de más o pidió pagos por fuera.' },
  { id: 'otro', label: 'Otro', hint: 'Cuéntanos qué pasó.' },
];

/* Reportar un perfil: el motivo y, si quiere, qué pasó. Lo revisa una persona. */
export function Reportar() {
  const { id } = useParams();
  const { getBarber, myBarber } = useAppState();
  const barber = getBarber(id);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!barber || barber.id === myBarber?.id) return <NotFound />;

  const send = async () => {
    if (!reason) {
      setError('Elige un motivo.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.reportBarber(barber.id, reason, details.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <h1 className="t-title t-title--sm">Gracias por avisar</h1>
        <p className="t-body">
          Vamos a revisar el perfil de {barber.name}. Si varias personas lo reportan, lo ocultamos mientras lo revisamos.
          Nadie sabe quién reportó.
        </p>
        <ButtonLink to="/" variant="secondary">
          Volver a explorar
        </ButtonLink>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <ActionBar>
          <FormError message={error} />
          <Button variant="danger" onClick={send} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar reporte'}
          </Button>
        </ActionBar>
      }
    >
      <div className="page-head">
        <Link to={`/barbero/${barber.id}`} className="icon-btn page-head__back" aria-label="Volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">Reportar perfil</h1>
      </div>
      <p className="t-detail">
        ¿Qué pasa con {barber.name}? Tu reporte es anónimo: el barbero no sabe quién lo hizo.
      </p>

      <div className="stack-10" role="radiogroup" aria-label="Motivo">
        {REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={reason === r.id}
            className="option option--tall"
            onClick={() => {
              setReason(r.id);
              setError(undefined);
            }}
          >
            <span className="option__lead">
              <Icon name={reason === r.id ? 'checkCircle' : 'circle'} size={20} strokeWidth={2} />
              <span className="option__name">
                {r.label}
                <span className="option__meta">{r.hint}</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      <TextArea
        label={reason === 'otro' ? 'Qué pasó' : 'Qué pasó (opcional)'}
        rows={4}
        maxLength={500}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
    </Screen>
  );
}
