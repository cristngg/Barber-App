import { Icon } from './Icon';

const LABELS = ['Malo', 'Regular', 'Bien', 'Muy bien', 'Excelente'];

/* Estrellas para mostrar (solo lectura). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} strokeWidth={1.5} filled={n <= Math.round(value)} />
      ))}
    </span>
  );
}

/* Elegir de 1 a 5 estrellas: botones de radio reales, con su palabra debajo. */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="star-input">
      <div role="radiogroup" aria-label="Calificación" className="star-input__row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} de 5: ${LABELS[n - 1]}`}
            className={`star-input__star${n <= value ? ' is-on' : ''}`}
            onClick={() => onChange(n)}
          >
            <Icon name="star" size={36} strokeWidth={1.5} filled={n <= value} />
          </button>
        ))}
      </div>
      <span className="star-input__label" aria-hidden="true">
        {value ? LABELS[value - 1] : 'Toca una estrella'}
      </span>
    </div>
  );
}
