import { Icon, type IconName } from './Icon';

export type Status = 'confirmed' | 'pending' | 'free' | 'cancelled' | 'full';

const config: Record<Status, { label: string; icon?: IconName }> = {
  confirmed: { label: 'Confirmada', icon: 'check' },
  pending: { label: 'Por confirmar', icon: 'clock' },
  free: { label: 'Libre hoy', icon: 'info' },
  cancelled: { label: 'Cancelada', icon: 'x' },
  full: { label: 'Sin puestos' },
};

/* Cada estado lleva icono y palabra: el color nunca va solo.
   `compact` es la variante de 28 px que va dentro de las tarjetas. */
export function StatusTag({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { label, icon } = config[status];
  return (
    <span className={`tag tag--${status}${compact ? ' tag--compact' : ''}`}>
      {icon && !compact && <Icon name={icon} size={16} strokeWidth={2.2} />}
      {label}
    </span>
  );
}
