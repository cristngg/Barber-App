import { NavLink } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { Icon, type IconName } from './Icon';

type Item = { to: string; label: string; icon: IconName; end?: boolean };

const clientItems: Item[] = [
  { to: '/', label: 'Explorar', icon: 'pin', end: true },
  { to: '/cortes', label: 'Cortes', icon: 'scissors' },
  { to: '/citas', label: 'Citas', icon: 'calendar' },
  { to: '/cuenta', label: 'Cuenta', icon: 'user' },
];

const barberItems: Item[] = [
  { to: '/mi-perfil', label: 'Portafolio', icon: 'scissors' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/cuenta', label: 'Cuenta', icon: 'user' },
];

/* Tres o cuatro destinos por rol. El activo lleva latón y una pestaña arriba; los demás, humo. */
export function BottomNav() {
  const { mode, myBarber } = useAppState();
  const isBarber = mode === 'barber' && !!myBarber;
  const items = isBarber ? barberItems : clientItems;
  return (
    <nav className="bottom-nav" aria-label={isBarber ? 'Navegación de barbero' : 'Navegación de cliente'}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="bottom-nav__item">
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
