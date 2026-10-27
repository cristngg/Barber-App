import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPrice } from '../data/barbers';
import { formatKm } from '../data/geo';
import { BottomNav } from '../components/BottomNav';
import { Chip, ChipRow } from '../components/Chip';
import { SearchField } from '../components/Field';
import { Photo } from '../components/Photo';
import { Screen, SectionHeader } from '../components/Screen';
import { FormError } from '../components/SignIn';
import { api, errorMessage, type Cut } from '../state/api';
import { useAppState } from '../state/AppState';
import { useSearchLogger, useTrendingPills } from '../state/trending';
import './screens.css';

const PAGE = 12;

/* Muro de cortes: buscar por estilo y bajar sin fin; cada corte lleva al perfil de su barbero. */
export function Cortes() {
  const { here } = useAppState();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  /* Píldora elegida: un tipo de corte o una palabra que la zona busca mucho. */
  const pills = useTrendingPills();
  const [pillKey, setPillKey] = useState<string | null>(null);
  const pill = pills.find((p) => p.key === pillKey) ?? null;
  const style = pill?.style ?? null;
  const fullQuery = [query, pill?.q ?? ''].join(' ').trim();
  useSearchLogger(input);
  const [items, setItems] = useState<Cut[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  /* Buscar mientras se escribe, sin pedir en cada letra. */
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(input.trim()), 300);
    return () => window.clearTimeout(t);
  }, [input]);

  /* Cada búsqueda nueva empieza de cero. `search` cambia de número para descartar respuestas viejas. */
  const search = useRef(0);
  const nearKey = here ? `${here.lat.toFixed(2)},${here.lng.toFixed(2)}` : '';
  const load = useCallback(
    async (offset: number) => {
      const id = search.current;
      setLoading(true);
      setError(undefined);
      try {
        const page = await api.cuts({ q: fullQuery, style, near: here, offset, limit: PAGE });
        if (id !== search.current) return;
        setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
        setTotal(page.total);
        setNextOffset(page.nextOffset);
      } catch (err) {
        if (id === search.current) setError(errorMessage(err));
      } finally {
        if (id === search.current) setLoading(false);
      }
    },
    // `here` va por nearKey: moverse unos metros no reinicia la lista.
    [fullQuery, style, nearKey],
  );

  useEffect(() => {
    search.current++;
    setItems([]);
    setTotal(null);
    setNextOffset(0);
    load(0);
  }, [load]);

  /* Al acercarse al final, pedir la página siguiente. */
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || nextOffset == null || nextOffset === 0 || loading || error) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && load(nextOffset), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [nextOffset, loading, error, load]);

  return (
    <Screen footer={<BottomNav />}>
      <header className="explore-head">
        <h1 className="t-title">Busca tu corte</h1>
        <p className="t-detail">Mira el trabajo de los barberos y aparta con quien te guste.</p>
      </header>

      <SearchField value={input} onChange={setInput} label="Trenzas, alisado, tinte, fade…" />

      <ChipRow label="Lo más buscado cerca">
        <Chip selected={pillKey == null} onToggle={() => setPillKey(null)}>
          Todos
        </Chip>
        {pills.map((p) => (
          <Chip key={p.key} selected={pillKey === p.key} onToggle={() => setPillKey(pillKey === p.key ? null : p.key)}>
            {p.label}
          </Chip>
        ))}
      </ChipRow>

      <section className="stack-12" aria-busy={loading}>
        {total != null && (
          <SectionHeader
            title={total === 1 ? '1 corte' : `${total} cortes`}
            aside={here ? 'Más cerca primero' : 'Más nuevos primero'}
          />
        )}

        <ul className="cut-grid" role="list">
          {items.map((c) => (
            <li key={c.id}>
              <Link to={`/barbero/${c.barber.id}?corte=${c.id}`} className="cut-card">
                <Photo src={c.photo} alt={c.name} label={c.styleLabel?.toUpperCase() ?? 'SIN FOTO'} className="cut-card__photo" />
                <span className="cut-card__body">
                  <span className="cut-card__name">{c.name}</span>
                  <span className="cut-card__price">{formatPrice(c.price)}</span>
                  <span className="cut-card__barber">
                    {c.barber.name}
                    {c.distanceKm != null ? ` · ${formatKm(c.distanceKm)}` : ` · ${c.barber.area}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {total === 0 && !loading && (
          <p className="empty">
            {query
              ? `No encontramos “${query}”. Prueba con otra palabra o quita el filtro.`
              : 'Todavía no hay cortes de este tipo.'}
          </p>
        )}
        <FormError message={error} />
        {error && nextOffset != null && (
          <button type="button" className="btn btn--secondary" onClick={() => load(nextOffset)}>
            Reintentar
          </button>
        )}
        {loading && (
          <p className="t-detail cut-grid__status" role="status">
            {items.length ? 'Cargando más…' : 'Buscando cortes…'}
          </p>
        )}
        {nextOffset == null && items.length > PAGE && <p className="t-detail cut-grid__status">Eso es todo.</p>}
        <div ref={sentinel} aria-hidden="true" />
      </section>
    </Screen>
  );
}
