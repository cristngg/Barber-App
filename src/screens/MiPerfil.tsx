import { Link, Navigate, useLocation } from 'react-router-dom';
import { formatDistance, formatPrice } from '../data/barbers';
import { BottomNav } from '../components/BottomNav';
import { ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { Rating } from '../components/Rating';
import { Screen, SectionHeader } from '../components/Screen';
import { StatusTag } from '../components/StatusTag';
import { useAppState } from '../state/AppState';
import './screens.css';

/* Portafolio: el perfil del barbero visto por su dueño, con todo editable. */
export function MiPerfil() {
  const { myBarber: barber, here } = useAppState();
  const location = useLocation();
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome;

  if (!barber) return <Navigate to="/soy-barbero" replace />;

  return (
    <Screen padded={false} footer={<BottomNav />}>
      <Photo src={barber.cover} alt="" label="SIN FOTO DE PORTADA" className="cover__photo" />

      <div className="profile">
        {welcome && (
          <div className="notice" role="status">
            <Icon name="check" size={20} strokeWidth={2.2} />
            Listo, tu perfil ya existe. Sube tus cortes con foto y precio para que te encuentren.
          </div>
        )}

        <div className="stack-10">
          <div className="profile__title">
            <div className="owner-head">
              <Photo src={barber.avatar} alt="" label="" className="owner-head__avatar" />
              <h1 className="profile__name">{barber.name}</h1>
            </div>
            <StatusTag status={barber.freeToday ? 'free' : 'full'} compact />
          </div>
          <div className="profile__meta">
            <Rating value={barber.rating} size={16} />
            <span>{formatDistance(barber, here)}</span>
          </div>
          {barber.bio ? (
            <p className="t-body">{barber.bio}</p>
          ) : (
            <p className="t-detail">Todavía no tienes descripción. Cuenta qué cortes haces y cuándo atiendes.</p>
          )}
        </div>

        {!barber.location && (
          <Link to="/mi-perfil/editar#ubicacion" className="notice notice--warn">
            <Icon name="pin" size={20} strokeWidth={2} />
            <span>Marca dónde atiendes para salir en el mapa y que te encuentren cerca.</span>
          </Link>
        )}

        <div className="button-pair">
          <ButtonLink to="/mi-perfil/editar" variant="secondary" icon={<Icon name="edit" size={20} />}>
            Editar perfil
          </ButtonLink>
          <ButtonLink to={`/barbero/${barber.id}`} variant="ghost" icon={<Icon name="eye" size={20} />}>
            Ver como cliente
          </ButtonLink>
        </div>

        <section className="stack-12">
          <SectionHeader title="Mis cortes" aside={barber.photoCount === 1 ? '1 foto' : `${barber.photoCount} fotos`} />
          <ul className="portfolio" role="list">
            {barber.services.map((s) => (
              <li key={s.id}>
                <Link to={`/mi-perfil/corte/${s.id}`} className="portfolio__item portfolio__item--link">
                  <Photo src={s.photo} alt={s.name} label="SIN FOTO" className="portfolio__photo" />
                  <span className="portfolio__name">{s.name}</span>
                  {s.price == null ? (
                    <span className="portfolio__missing">Pon tu precio</span>
                  ) : (
                    <span className="portfolio__price">{formatPrice(s.price)}</span>
                  )}
                  <span className="sr-only">, editar</span>
                </Link>
              </li>
            ))}
            <li>
              <Link to="/mi-perfil/corte/nuevo" className="upload-tile">
                <Icon name="camera" size={28} />
                <span>Subir foto</span>
              </Link>
            </li>
          </ul>
          <p className="t-detail">Toca un corte para cambiar su foto, nombre o precio.</p>
        </section>
      </div>
    </Screen>
  );
}
