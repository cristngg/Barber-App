import { Link } from 'react-router-dom';
import type { Barber } from '../data/barbers';
import { Photo } from './Photo';
import { Rating } from './Rating';
import { StatusTag } from './StatusTag';

/* Toda la tarjeta es un solo enlace. Distancia y disponibilidad siempre visibles. */
export function BarberCard({ barber }: { barber: Barber }) {
  return (
    <Link to={`/barbero/${barber.id}`} className="barber-card">
      <Photo src={barber.avatar} alt="" className="barber-card__photo" />
      <div className="barber-card__body">
        <span className="t-card-title">{barber.name}</span>
        <span className="t-detail">{barber.specialties.join(' · ')}</span>
        <div className="barber-card__meta">
          <Rating value={barber.rating} />
          <span>{barber.distanceKm == null ? barber.area : `${barber.distanceKm.toFixed(1)} km`}</span>
        </div>
      </div>
      <StatusTag status={barber.freeToday ? 'free' : 'full'} compact />
    </Link>
  );
}
