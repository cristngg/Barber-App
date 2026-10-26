import { useMemo, useState } from 'react';
import { barbers } from '../data/barbers';
import { BarberCard } from '../components/BarberCard';
import { BottomNav } from '../components/BottomNav';
import { Chip, ChipRow } from '../components/Chip';
import { SearchField } from '../components/Field';
import { Icon } from '../components/Icon';
import { Screen, SectionHeader } from '../components/Screen';
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
    .replace(/[̀-ͯ]/g, '');

export function Explorar() {
  const [query, setQuery] = useState('');
  const [byDistance, setByDistance] = useState(true);
  const [active, setActive] = useState<Set<FilterId>>(new Set());

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
    return byDistance ? [...list].sort((a, b) => a.distanceKm - b.distanceKm) : [...list].sort((a, b) => b.rating - a.rating);
  }, [query, active, byDistance]);

  return (
    <Screen footer={<BottomNav />}>
      <header className="explore-head">
        <button type="button" className="location-btn">
          <Icon name="pin" size={18} strokeWidth={2} />
          Bella Vista, Panamá
        </button>
        <h1 className="t-title">Barberos cerca de ti</h1>
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

      <div className="mini-map" aria-hidden="true">
        <span className="mini-map__label">MAPA</span>
        {barbers.map((b) => (
          <span
            key={b.id}
            className={`mini-map__pin${b.freeToday ? '' : ' mini-map__pin--off'}`}
            style={{ left: `${b.map.x}%`, top: `${b.map.y}%` }}
          />
        ))}
        <span className="mini-map__me" style={{ left: '42%', top: '32%' }} />
      </div>

      <section className="stack-10" aria-live="polite">
        <SectionHeader
          title={results.length === 1 ? '1 cerca de ti' : `${results.length} cerca de ti`}
          aside={byDistance ? 'Por distancia' : 'Por valoración'}
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
