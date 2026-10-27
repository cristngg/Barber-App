import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { formatTimeRange, weekdayShort } from '../data/dates';
import { Button } from '../components/Button';
import { TextArea } from '../components/Field';
import { Icon } from '../components/Icon';
import { ActionBar, Screen } from '../components/Screen';
import { FormError } from '../components/SignIn';
import { StarInput } from '../components/Stars';
import { api, errorMessage } from '../state/api';
import { fromISODate, useAppState } from '../state/AppState';
import './screens.css';

const TEXT_MAX = 500;

/* Calificar una cita que ya pasó: estrellas y, si quiere, unas palabras. */
export function Calificar() {
  const { id } = useParams();
  const { appointments, refreshAppointments } = useAppState();
  const navigate = useNavigate();
  const appt = appointments.find((a) => a.id === id);
  const [rating, setRating] = useState(appt?.review?.rating ?? 0);
  const [text, setText] = useState(appt?.review?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!appt || !appt.canReview) return <Navigate to="/citas" replace />;

  const send = async () => {
    if (!rating) {
      setError('Toca de 1 a 5 estrellas.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await api.review(appt.id, rating, text.trim());
      await refreshAppointments();
      navigate('/citas', { replace: true, state: { reviewed: appt.barberName } });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const date = fromISODate(appt.date);

  return (
    <Screen
      footer={
        <ActionBar>
          <FormError message={error} />
          <Button onClick={send} disabled={saving}>
            {saving ? 'Enviando…' : appt.review ? 'Guardar cambios' : 'Enviar reseña'}
          </Button>
        </ActionBar>
      }
    >
      <div className="page-head">
        <Link to="/citas" className="icon-btn page-head__back" aria-label="Volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">¿Cómo te fue?</h1>
      </div>

      <div className="mini-barber">
        <div className="mini-barber__body">
          <span className="mini-barber__name">{appt.barberName}</span>
          <span className="t-detail">
            {appt.serviceName} · {weekdayShort(date)} {date.getDate()}, {formatTimeRange(appt.startMin, appt.durationMin)}
          </span>
        </div>
      </div>

      <StarInput
        value={rating}
        onChange={(v) => {
          setRating(v);
          setError(undefined);
        }}
      />

      <TextArea
        label="Cuéntale a otros (opcional)"
        rows={4}
        maxLength={TEXT_MAX}
        placeholder="¿Qué tal el corte, la puntualidad, el trato?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        hint={`${text.length}/${TEXT_MAX} · Sale con tu nombre corto, por ejemplo "Ana P."`}
      />
    </Screen>
  );
}
