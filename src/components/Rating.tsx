import { Icon } from './Icon';

/* `null` = perfil nuevo, todavía sin reseñas. Con `count`, "4.8 (12)". */
export function Rating({ value, count, size = 14 }: { value: number | null; count?: number; size?: number }) {
  return (
    <span className="rating">
      <Icon name="star" size={size} strokeWidth={1.5} filled={value != null} />
      <span className="sr-only">Valoración</span>
      {value == null ? 'Nuevo' : value.toFixed(1)}
      {value != null && count != null && (
        <span className="rating__count">
          {' '}
          ({count}
          <span className="sr-only"> {count === 1 ? 'reseña' : 'reseñas'}</span>)
        </span>
      )}
    </span>
  );
}
