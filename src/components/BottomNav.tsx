import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type Item = { to: string; label: string; icon: IconName; end?: boolean };

const clientItems: Item[] = [
  { to: '/', label: 'Explorar', icon: 'pin', end: true },
  { to: '/citas', label: 'Citas', icon: 'calendar' },
  { to: '/cuenta', label: 'Cuenta', icon: 'user' },
];

/* Tres destinos por rol. El activo lleva latón y una pestaña arriba; los demás, humo. */
export function BottomNav({ items = clientItems, label = 'Navegación de cliente' }: { items?: Item[]; label?: string }) {
  return (
    <nav className="bottom-nav" aria-label={label}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="bottom-nav__item">
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
