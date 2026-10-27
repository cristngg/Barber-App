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
import { useSearchLogger, useTrendingPills } from '../state/trending';
import './screens.css';

const OPEN_NOW = 'abierto';

/* Igual que en el servidor: sin acentos ni mayúsculas, y "z" = "s". */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/z/g, 's');

export function Explorar() {
  const { barbers, refreshBarbers, here, locationStatus, locate } = useAppState();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [byDistance, setByDistance] = useState(true);
  const [active, setActive] = useState<Set<string>>(new Set());
  /* Píldoras de la zona: lo que más se busca cerca, con la palabra que usan aquí. */
  const pills = useTrendingPills();
  useSearchLogger(query);

  useEffect(() => {
    refreshBarbers().catch(() => {});
  }, [refreshBarbers]);

  const toggle = (id: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const list = barbers.filter((b) => {
      const text = normalize([b.name, b.area, ...b.specialties, ...b.services.map((s) => s.name)].join(' '));
      if (q && !text.includes(q)) return false;
      for (const key of active) {
        if (key === OPEN_NOW) {
          if (!b.openNow) return false;
          continue;
        }
        const pill = pills.find((p) => p.key === key);
        if (!pill) continue;
        if (pill.style && !b.tags.includes(pill.style) && !b.services.some((s) => s.style === pill.style)) return false;
        if (pill.q && !text.includes(normalize(pill.q))) return false;
      }
      return true;
    });
    const km = (b: (typeof list)[number]) => barberDistance(b, here) ?? Infinity;
    return byDistance && here
      ? [...list].sort((a, b) => km(a) - km(b))
      : [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [barbers, query, active, byDistance, here, pills]);

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
        <Chip selected={active.has(OPEN_NOW)} onToggle={() => toggle(OPEN_NOW)}>
          Abierto ahora
        </Chip>
        {pills.map((p) => (
          <Chip key={p.key} selected={active.has(p.key)} onToggle={() => toggle(p.key)}>
            {p.label}
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
