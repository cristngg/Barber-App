import { Link } from 'react-router-dom';
import { barberDistance, type Barber } from '../data/barbers';
import { formatKm } from '../data/geo';
import { useAppState } from '../state/AppState';
import { Photo } from './Photo';
import { Rating } from './Rating';
import { StatusTag } from './StatusTag';

/* Toda la tarjeta es un solo enlace. Distancia y disponibilidad siempre visibles. */
export function BarberCard({ barber }: { barber: Barber }) {
  const { here } = useAppState();
  const km = barberDistance(barber, here);
  return (
    <Link to={`/barbero/${barber.id}`} className="barber-card">
      <Photo src={barber.avatar} alt="" className="barber-card__photo" />
      <div className="barber-card__body">
        <span className="t-card-title">{barber.name}</span>
        <span className="t-detail">{barber.specialties.join(' · ')}</span>
        <div className="barber-card__meta">
          <Rating value={barber.rating} />
          <span>{km == null ? barber.area : formatKm(km)}</span>
        </div>
      </div>
      <StatusTag status={barber.freeToday ? 'free' : 'full'} compact />
    </Link>
  );
}
