import type { ReactNode } from 'react';
import { Icon } from './Icon';

type Props = {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/* Chip de filtro: seleccionado = relleno latón y palomita. */
export function Chip({ selected, onToggle, children }: Props) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onToggle}>
      {selected && <Icon name="check" size={18} strokeWidth={2} />}
      {children}
    </button>
  );
}

export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {children}
    </div>
  );
}
