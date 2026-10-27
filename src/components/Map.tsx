import L from 'leaflet';
import { useEffect, useRef, type ReactNode } from 'react';
import { DEFAULT_CENTER, type LatLng } from '../data/geo';

/*
 * Mapas con Leaflet y los mosaicos de OpenStreetMap (gratis, sin clave).
 * OpenStreetMap pide la atribución visible y un uso moderado; con mucho tráfico, cambia TILE_URL
 * por un proveedor de mosaicos (MapTiler, Stadia, etc.).
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type MapPin = { id: string; at: LatLng; label: string; on: boolean };

function pinIcon(on: boolean, selected: boolean) {
  return L.divIcon({
    className: '',
    html: `<span class="map-pin${on ? '' : ' map-pin--off'}${selected ? ' map-pin--selected' : ''}"></span>`,
    iconSize: selected ? [30, 30] : [22, 22],
    iconAnchor: selected ? [15, 15] : [11, 11],
  });
}

const meIcon = L.divIcon({ className: '', html: '<span class="map-me"></span>', iconSize: [16, 16], iconAnchor: [8, 8] });

/* Crea el mapa de Leaflet una sola vez y lo destruye al salir. */
function useLeaflet(options: L.MapOptions) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: false, attributionControl: false, ...options });
    L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(m);
    L.control.attribution({ prefix: false }).addAttribution(ATTRIBUTION).addTo(m);
    map.current = m;
    /* Si el contenedor cambió de tamaño al montar (fuentes, scroll), Leaflet necesita medir otra vez. */
    const remeasure = window.setTimeout(() => m.invalidateSize(), 100);
    return () => {
      window.clearTimeout(remeasure);
      m.remove();
      map.current = null;
    };
    // Las opciones son solo iniciales.
  }, []);
  return { box, map };
}

type BarberMapProps = {
  pins: MapPin[];
  here: LatLng | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /* Interactivo (arrastrar y acercar) o una vista fija. */
  interactive?: boolean;
  className?: string;
  label: string;
  children?: ReactNode;
};

/* Barberos en el mapa; tocar un pin lo selecciona. */
export function BarberMap({ pins, here, selectedId, onSelect, interactive = true, className = '', label, children }: BarberMapProps) {
  const { box, map } = useLeaflet({
    center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
    zoom: 13,
    dragging: interactive,
    touchZoom: interactive,
    scrollWheelZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: false,
    keyboard: interactive,
  });
  const layer = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  /* Pines y punto azul. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layer.current?.remove();
    const group = L.layerGroup();
    for (const p of pins) {
      L.marker([p.at.lat, p.at.lng], {
        icon: pinIcon(p.on, p.id === selectedId),
        title: p.label,
        alt: p.label,
        keyboard: interactive,
        zIndexOffset: p.id === selectedId ? 1000 : 0,
      })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          select.current?.(p.id);
        })
        .addTo(group);
    }
    if (here) L.marker([here.lat, here.lng], { icon: meIcon, interactive: false, keyboard: false }).addTo(group);
    group.addTo(m);
    layer.current = group;
  }, [map, pins, here, selectedId, interactive]);

  /* Encuadre: todos los pines (y yo) cuando cambia el conjunto. */
  const pinKey = pins.map((p) => p.id).join(',');
  const hereKey = here ? `${here.lat.toFixed(3)},${here.lng.toFixed(3)}` : '';
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const points = pins.map((p) => L.latLng(p.at.lat, p.at.lng));
    if (here) points.push(L.latLng(here.lat, here.lng));
    if (points.length === 1) m.setView(points[0], 15);
    else if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
  }, [map, pinKey, hereKey]);

  /* Tocar fuera de un pin quita la selección. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const clear = () => select.current?.(null);
    m.on('click', clear);
    return () => {
      m.off('click', clear);
    };
  }, [map]);

  return (
    <div className={`map ${className}`}>
      <div ref={box} className="map__canvas" role="region" aria-label={label} />
      {children}
    </div>
  );
}

type PickerProps = {
  value: LatLng | null;
  onChange: (at: LatLng) => void;
  label: string;
};

/* Elegir un punto: tocar el mapa o arrastrar el pin. */
export function LocationPicker({ value, onChange, label }: PickerProps) {
  const start = value ?? DEFAULT_CENTER;
  const { box, map } = useLeaflet({ center: [start.lat, start.lng], zoom: value ? 16 : 13 });
  const marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pick = (e: L.LeafletMouseEvent) => change.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    m.on('click', pick);
    return () => {
      m.off('click', pick);
    };
  }, [map]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { icon: pinIcon(true, true), draggable: true, title: 'Tu barbería' })
        .on('dragend', () => {
          const at = marker.current!.getLatLng();
          change.current({ lat: at.lat, lng: at.lng });
        })
        .addTo(m);
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
    }
    if (!m.getBounds().pad(-0.1).contains([value.lat, value.lng])) m.setView([value.lat, value.lng], Math.max(m.getZoom(), 16));
  }, [map, value]);

  return (
    <div className="map map--picker">
      <div ref={box} className="map__canvas" role="region" aria-label={label} />
    </div>
  );
}
