import { Link, useParams } from 'react-router-dom';
import { formatDistance, formatPrice } from '../data/barbers';
import { BarberMap } from '../components/Map';
import { ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { Rating } from '../components/Rating';
import { ActionBar, Screen, SectionHeader } from '../components/Screen';
import { StatusTag } from '../components/StatusTag';
import { useAppState } from '../state/AppState';
import { NotFound } from './NotFound';
import './screens.css';

export function Perfil() {
  const { id } = useParams();
  const { getBarber, myBarber, here } = useAppState();
  const barber = getBarber(id);
  if (!barber) return <NotFound />;
  const backTo = barber.id === myBarber?.id ? '/mi-perfil' : '/';

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
        <Link to={backTo} className="icon-btn icon-btn--solid cover__back" aria-label="Volver">
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
            <span>{formatDistance(barber, here)}</span>
          </div>
          {barber.bio && <p className="t-body">{barber.bio}</p>}
        </div>

        {barber.location && (
          <section className="stack-12">
            <SectionHeader title="Dónde atiende" aside={barber.area} />
            <BarberMap
              pins={[{ id: barber.id, at: barber.location, label: barber.name, on: barber.freeToday }]}
              here={here}
              interactive={false}
              label={`Ubicación de ${barber.name}`}
              className="profile-map"
            />
            <ButtonLink to={`/barbero/${barber.id}/ruta`} variant="secondary" icon={<Icon name="pin" size={20} />}>
              Cómo llegar
            </ButtonLink>
          </section>
        )}

        <section className="stack-12">
          <SectionHeader title="Mis cortes" aside={barber.photoCount === 1 ? '1 foto' : `${barber.photoCount} fotos`} />
          <ul className="portfolio" role="list">
            {barber.services.map((s) => (
              <li key={s.id} className="portfolio__item">
                <Photo src={s.photo} alt={s.name} label="" className="portfolio__photo" />
                <span className="portfolio__name">{s.name}</span>
                <span className="portfolio__price">{formatPrice(s.price)}</span>
              </li>
            ))}
          </ul>
          {barber.services.length === 0 && <p className="t-detail">Este barbero todavía no ha subido sus cortes.</p>}
        </section>
      </div>
    </Screen>
  );
}
