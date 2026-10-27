import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ButtonLink } from '../components/Button';
import { Chip, ChipRow } from '../components/Chip';
import { Icon } from '../components/Icon';
import { BarberMap } from '../components/Map';
import { FormError } from '../components/SignIn';
import { directionsUrl, distanceKm, formatDuration, formatKm, type LatLng } from '../data/geo';
import { api, errorMessage, type Route, type TravelMode } from '../state/api';
import { useAppState } from '../state/AppState';
import { NotFound } from './NotFound';
import './screens.css';

/* Si te mueves más de esto desde donde se trazó la ruta, se vuelve a trazar. */
const REROUTE_M = 200;
const SHEET_PX = 300;

/* "Cómo llegar": la ruta dibujada en el mapa, con tiempo y distancia, como en una app de viajes. */
export function Ruta() {
  const { id } = useParams();
  const { getBarber, here, locate, locationStatus } = useAppState();
  const barber = getBarber(id);
  const to = barber?.location ?? null;

  const [mode, setMode] = useState<TravelMode>('car');
  const [me, setMe] = useState<LatLng | null>(here);
  const [route, setRoute] = useState<Route | null>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  /* Pedir la ubicación al entrar (la persona acaba de tocar "Cómo llegar") y seguirla mientras esté aquí. */
  useEffect(() => {
    if (!here) locate();
  }, []);
  useEffect(() => {
    if (here) setMe(here);
  }, [here]);
  useEffect(() => {
    if (locationStatus !== 'on' || !('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [locationStatus]);

  /* Trazar al tener ubicación, al cambiar carro/a pie, o si te alejaste del punto de partida. */
  const lastAsk = useRef(0);
  const needsRoute = !!me && !!to && (!origin || !route || route.mode !== mode || distanceKm(origin, me) * 1000 > REROUTE_M);
  const meKey = me ? `${me.lat.toFixed(3)},${me.lng.toFixed(3)}` : '';
  useEffect(() => {
    if (!needsRoute || !me || !to) return;
    if (route && route.mode === mode && Date.now() - lastAsk.current < 30_000) return;
    lastAsk.current = Date.now();
    let alive = true;
    setLoading(true);
    setError(undefined);
    const from = me;
    api
      .route(from, to, mode)
      .then((r) => {
        if (!alive) return;
        setRoute(r);
        setOrigin(from);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [needsRoute, mode, meKey]);

  const path = useMemo(() => route?.path.map(([lat, lng]) => ({ lat, lng })) ?? null, [route]);

  if (!barber) return <NotFound />;
  if (!to) {
    return (
      <div className="route-screen route-screen--empty">
        <p className="t-body">Este barbero todavía no marcó dónde atiende.</p>
        <ButtonLink to={`/barbero/${barber.id}`} variant="secondary">
          Volver al perfil
        </ButtonLink>
      </div>
    );
  }

  const showing = route && route.mode === mode ? route : null;

  return (
    <div className="route-screen">
      <BarberMap
        pins={[{ id: barber.id, at: to, label: barber.name, on: true }]}
        here={me}
        route={showing ? path : null}
        fitInset={[88, SHEET_PX + 24]}
        label={`Ruta hasta ${barber.name}`}
        className="route-map"
      />

      <Link to={`/barbero/${barber.id}`} className="icon-btn icon-btn--solid route-back" aria-label="Volver al perfil">
        <Icon name="back" size={22} strokeWidth={2} />
      </Link>

      <section className="sheet" aria-label="Cómo llegar">
        <span className="sheet__handle" aria-hidden="true" />
        <div className="sheet__head">
          <span className="t-label">Cómo llegar a</span>
          <span className="t-card-title">{barber.name}</span>
        </div>

        <ChipRow label="Cómo vas">
          <Chip selected={mode === 'car'} onToggle={() => setMode('car')}>
            En carro
          </Chip>
          <Chip selected={mode === 'foot'} onToggle={() => setMode('foot')}>
            A pie
          </Chip>
        </ChipRow>

        <div className="route-eta" aria-live="polite">
          {locationStatus === 'denied' ? (
            <span className="t-detail">
              Tu navegador bloqueó la ubicación. Permítela para ver la ruta, o ábrela en Google Maps.
            </span>
          ) : showing ? (
            <>
              <span className="route-eta__time">{formatDuration(showing.durationS)}</span>
              <span className="route-eta__dist">
                {formatKm(showing.distanceM / 1000)} · aprox.
              </span>
            </>
          ) : loading || locationStatus === 'asking' || !me ? (
            <span className="t-detail" role="status">
              {me ? 'Trazando la ruta…' : 'Buscando tu ubicación…'}
            </span>
          ) : null}
        </div>
        <FormError message={error} />

        <div className="button-pair button-pair--row">
          <ButtonLink to={`/barbero/${barber.id}/reservar`} icon={<Icon name="calendar" size={20} strokeWidth={2} />}>
            Apartar cita
          </ButtonLink>
          <a href={directionsUrl(to, mode)} target="_blank" rel="noopener noreferrer" className="btn btn--secondary">
            Google Maps
          </a>
        </div>
      </section>
    </div>
  );
}
