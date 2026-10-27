import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { barberDistance, formatDistance } from '../data/barbers';
import { BarberCard } from '../components/BarberCard';
import { BarberMap, type MapPin } from '../components/Map';
import { Rating } from '../components/Rating';
import { StatusTag } from '../components/StatusTag';
import { BottomNav } from '../components/BottomNav';
import { Chip, ChipRow } from '../components/Chip';
import { SearchField } from '../components/Field';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
import { useAppState } from '../state/AppState';
import './screens.css';

const FILTERS = [
  { id: 'abierto', label: 'Abierto ahora' },
  { id: 'fade', label: 'Fade' },
  { id: 'barba', label: 'Barba' },
  { id: 'disenos', label: 'Diseños' },
  { id: 'ninos', label: 'Niños' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function Explorar() {
  const { barbers, refreshBarbers, here, locationStatus, locate } = useAppState();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [byDistance, setByDistance] = useState(true);
  const [active, setActive] = useState<Set<FilterId>>(new Set());

  useEffect(() => {
    refreshBarbers().catch(() => {});
  }, [refreshBarbers]);

  const toggle = (id: FilterId) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const list = barbers.filter((b) => {
      if (q && !normalize([b.name, b.area, ...b.specialties].join(' ')).includes(q)) return false;
      for (const f of active) {
        if (f === 'abierto' ? !b.openNow : !b.tags.includes(f)) return false;
      }
      return true;
    });
    const km = (b: (typeof list)[number]) => barberDistance(b, here) ?? Infinity;
    return byDistance && here
      ? [...list].sort((a, b) => km(a) - km(b))
      : [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [barbers, query, active, byDistance, here]);

  const pins = useMemo<MapPin[]>(
    () => results.flatMap((b) => (b.location ? [{ id: b.id, at: b.location, label: b.name, on: b.freeToday }] : [])),
    [results],
  );
  const selected = results.find((b) => b.id === selectedId);

  const locationText = {
    idle: 'Usar mi ubicación',
    asking: 'Buscando tu ubicación…',
    on: 'Cerca de ti',
    denied: 'Ubicación bloqueada',
    unavailable: 'No encontramos tu ubicación',
  }[locationStatus];

  return (
    <Screen footer={<BottomNav />}>
      <header className="explore-head">
        <button type="button" className="location-btn" onClick={() => locate()} disabled={locationStatus === 'asking'}>
          <Icon name="pin" size={18} strokeWidth={2} />
          {locationText}
        </button>
        <h1 className="t-title">Barberos cerca de ti</h1>
        {locationStatus === 'denied' && (
          <p className="t-detail">Para ver distancias, permite la ubicación en los ajustes del navegador.</p>
        )}
      </header>

      <SearchField value={query} onChange={setQuery} />

      <ChipRow label="Filtros">
        <Chip selected={byDistance} onToggle={() => setByDistance((v) => !v)}>
          Cerca
        </Chip>
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={active.has(f.id)} onToggle={() => toggle(f.id)}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      <BarberMap
        pins={pins}
        here={here}
        selectedId={selectedId}
        onSelect={setSelectedId}
        label="Mapa de barberos. Toca un pin para ver quién es."
        className="explore-map"
      >
        <button
          type="button"
          className="icon-btn icon-btn--solid map__locate"
          aria-label="Centrar en mi ubicación"
          onClick={() => locate()}
        >
          <Icon name="pin" size={20} strokeWidth={2} />
        </button>
        {selected && (
          <Link to={`/barbero/${selected.id}`} className="map__card">
            <span className="map__card-body">
              <span className="map__card-name">{selected.name}</span>
              <span className="barber-card__meta">
                <Rating value={selected.rating} />
                <span>{formatDistance(selected, here)}</span>
              </span>
            </span>
            <StatusTag status={selected.freeToday ? 'free' : 'full'} compact />
            <Icon name="chevron" size={20} />
          </Link>
        )}
      </BarberMap>

      <section className="stack-10" aria-live="polite">
        <SectionHeader
          title={results.length === 1 ? '1 cerca de ti' : `${results.length} cerca de ti`}
          aside={byDistance && here ? 'Por distancia' : 'Por valoración'}
        />
        {results.map((b) => (
          <BarberCard key={b.id} barber={b} />
        ))}
        {results.length === 0 && (
          <p className="empty">No hay barberos con esos filtros. Prueba quitando alguno.</p>
        )}
      </section>
    </Screen>
  );
}
