import { Link, useParams } from 'react-router-dom';
import { formatPrice, getBarber } from '../data/barbers';
import { ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { Rating } from '../components/Rating';
import { ActionBar, Screen, SectionHeader } from '../components/Screen';
import { StatusTag } from '../components/StatusTag';
import { NotFound } from './NotFound';
import './screens.css';

export function Perfil() {
  const { id } = useParams();
  const barber = getBarber(id);
  if (!barber) return <NotFound />;

  return (
    <Screen
      padded={false}
      footer={
        <ActionBar>
          <ButtonLink to={`/barbero/${barber.id}/reservar`} icon={<Icon name="calendar" size={20} strokeWidth={2} />}>
            Apartar cita
          </ButtonLink>
        </ActionBar>
      }
    >
      <div className="cover">
        <Photo src={barber.cover} alt="" label="FOTO DE PORTADA" className="cover__photo" />
        <Link to="/" className="icon-btn icon-btn--solid cover__back" aria-label="Volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
      </div>

      <div className="profile">
        <div className="stack-10">
          <div className="profile__title">
            <h1 className="profile__name">{barber.name}</h1>
            <StatusTag status={barber.freeToday ? 'free' : 'full'} compact />
          </div>
          <div className="profile__meta">
            <Rating value={barber.rating} size={16} />
            <span>
              {barber.distanceKm.toFixed(1)} km · {barber.area}
            </span>
          </div>
          <p className="t-body">{barber.bio}</p>
        </div>

        <section className="stack-12">
          <SectionHeader title="Mis cortes" aside={`${barber.photoCount} fotos`} />
          <ul className="portfolio" role="list">
            {barber.services.map((s) => (
              <li key={s.id} className="portfolio__item">
                <Photo src={s.photo} alt={s.name} label="" className="portfolio__photo" />
                <span className="portfolio__name">{s.name}</span>
                <span className="portfolio__price">{formatPrice(s.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Screen>
  );
}
