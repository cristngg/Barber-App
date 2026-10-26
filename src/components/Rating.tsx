import { Icon } from './Icon';

export function Rating({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="rating">
      <Icon name="star" size={size} strokeWidth={1.5} filled />
      <span className="sr-only">Valoración</span>
      {value.toFixed(1)}
    </span>
  );
}
