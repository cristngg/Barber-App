import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type Review } from '../state/api';
import { Button } from './Button';
import { TextArea } from './Field';
import { SectionHeader } from './Screen';
import { FormError } from './SignIn';
import { Stars } from './Stars';

function when(ms: number) {
  return new Date(ms).toLocaleDateString('es-PA', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Props = {
  barberId: string;
  /* El dueño del perfil puede responder cada reseña. */
  canReply?: boolean;
};

/* Reseñas de un barbero: promedio, las más nuevas y "Ver más". */
export function Reviews({ barberId, canReply = false }: Props) {
  const [items, setItems] = useState<Review[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(undefined);
      try {
        const page = await api.reviews(barberId, offset);
        setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
        setRating(page.rating);
        setTotal(page.total);
        setNextOffset(page.nextOffset);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [barberId],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const replied = (id: string, reply: string | null) => setItems((list) => list.map((r) => (r.id === id ? { ...r, reply } : r)));

  return (
    <section className="stack-12">
      <SectionHeader title="Reseñas" aside={total ? `${total} ${total === 1 ? 'reseña' : 'reseñas'}` : undefined} />
      {rating != null && (
        <div className="reviews-summary">
          <span className="reviews-summary__avg">{rating.toFixed(1)}</span>
          <Stars value={rating} size={20} />
        </div>
      )}
      {total === 0 && (
        <p className="t-detail">
          {canReply ? 'Cuando tus clientes te califiquen, sus reseñas salen aquí.' : 'Todavía no tiene reseñas.'}
        </p>
      )}
      <ul className="review-list" role="list">
        {items.map((r) => (
          <li key={r.id} className="review">
            <div className="review__head">
              <Stars value={r.rating} size={14} />
              <span className="t-detail">{when(r.createdAt)}</span>
            </div>
            {r.text && <p className="t-body">{r.text}</p>}
            <span className="t-detail">
              {r.author} · {r.service}
            </span>
            {r.reply && !canReply && (
              <div className="review__reply">
                <span className="t-label">Respuesta del barbero</span>
                <p className="t-body">{r.reply}</p>
              </div>
            )}
            {canReply && <ReplyBox review={r} onSaved={(reply) => replied(r.id, reply)} />}
          </li>
        ))}
      </ul>
      <FormError message={error} />
      {nextOffset != null && (
        <Button variant="ghost" onClick={() => load(nextOffset)} disabled={loading}>
          {loading ? 'Cargando…' : 'Ver más reseñas'}
        </Button>
      )}
    </section>
  );
}

function ReplyBox({ review, onSaved }: { review: Review; onSaved: (reply: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(review.reply ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) {
    return (
      <div className="review__reply">
        {review.reply && (
          <>
            <span className="t-label">Tu respuesta</span>
            <p className="t-body">{review.reply}</p>
          </>
        )}
        <Button variant="ghost" onClick={() => setOpen(true)} className="review__reply-btn">
          {review.reply ? 'Editar respuesta' : 'Responder'}
        </Button>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const r = await api.replyReview(review.id, text);
      onSaved(r.reply);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="review__reply stack-10">
      <TextArea label="Tu respuesta" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      <FormError message={error} />
      <div className="button-pair button-pair--row">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Publicar'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
