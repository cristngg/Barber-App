import { Icon } from './Icon';

/* `null` = perfil nuevo, todavía sin valoraciones. */
export function Rating({ value, size = 14 }: { value: number | null; size?: number }) {
  return (
    <span className="rating">
      <Icon name="star" size={size} strokeWidth={1.5} filled={value != null} />
      <span className="sr-only">Valoración</span>
      {value == null ? 'Nuevo' : value.toFixed(1)}
    </span>
  );
}
