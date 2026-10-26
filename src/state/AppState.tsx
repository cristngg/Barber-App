import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_HOURS, sampleBarbers, type Barber } from '../data/barbers';
import { load, save } from './storage';

export type Theme = 'dark' | 'light';
export type Mode = 'client' | 'barber';

export type Appointment = {
  id: string;
  barberId: string;
  serviceId: string;
  /* ISO yyyy-mm-dd */
  date: string;
  hour: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: number;
};

type AppState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  /* Todos los barberos visibles: el perfil propio (si hay) más los de ejemplo. */
  barbers: Barber[];
  getBarber: (id: string | undefined) => Barber | undefined;
  /* El perfil del barbero que usa la app, editable. */
  myBarber: Barber | null;
  createMyBarber: (name: string, area: string) => Barber;
  saveMyBarber: (update: (b: Barber) => Barber) => void;
  appointments: Appointment[];
  book: (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>) => Appointment;
  cancel: (id: string) => void;
  confirm: (id: string) => void;
};

const Ctx = createContext<AppState | null>(null);

const THEME_KEY = 'filo.theme';
const MODE_KEY = 'filo.mode';
const APPTS_KEY = 'filo.appointments';
const MY_BARBER_KEY = 'filo.myBarber';

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => load<Theme>(THEME_KEY, 'dark'));
  const [mode, setMode] = useState<Mode>(() => load<Mode>(MODE_KEY, 'client'));
  const [appointments, setAppointments] = useState<Appointment[]>(() => load<Appointment[]>(APPTS_KEY, []));
  const [myBarber, setMyBarber] = useState<Barber | null>(() => load<Barber | null>(MY_BARBER_KEY, null));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F1012' : '#FFFDF8');
    save(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => save(MODE_KEY, mode), [mode]);
  useEffect(() => save(APPTS_KEY, appointments), [appointments]);
  useEffect(() => save(MY_BARBER_KEY, myBarber), [myBarber]);

  const barbers = useMemo(() => (myBarber ? [myBarber, ...sampleBarbers] : sampleBarbers), [myBarber]);
  const getBarber = useCallback((id: string | undefined) => barbers.find((b) => b.id === id), [barbers]);

  const createMyBarber = useCallback((name: string, area: string) => {
    const barber: Barber = {
      id: `yo-${crypto.randomUUID().slice(0, 8)}`,
      name,
      area,
      specialties: [],
      tags: [],
      rating: null,
      distanceKm: null,
      freeToday: true,
      openNow: true,
      bio: '',
      photoCount: 0,
      workDays: [2, 3, 4, 5, 6],
      hours: DEFAULT_HOURS,
      services: [],
      map: { x: 12 + Math.round(Math.random() * 76), y: 15 + Math.round(Math.random() * 55) },
    };
    setMyBarber(barber);
    setMode('barber');
    return barber;
  }, []);

  const saveMyBarber = useCallback((update: (b: Barber) => Barber) => {
    setMyBarber((b) => {
      if (!b) return b;
      const next = update(b);
      return { ...next, photoCount: next.services.filter((s) => s.photo).length };
    });
  }, []);

  const book = useCallback<AppState['book']>((a) => {
    const appt: Appointment = { ...a, id: crypto.randomUUID(), status: 'pending', createdAt: Date.now() };
    setAppointments((list) => [...list, appt]);
    return appt;
  }, []);

  const setStatus = (id: string, status: Appointment['status']) =>
    setAppointments((list) => list.map((a) => (a.id === id ? { ...a, status } : a)));
  const cancel = useCallback((id: string) => setStatus(id, 'cancelled'), []);
  const confirm = useCallback((id: string) => setStatus(id, 'confirmed'), []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      mode,
      setMode,
      barbers,
      getBarber,
      myBarber,
      createMyBarber,
      saveMyBarber,
      appointments,
      book,
      cancel,
      confirm,
    }),
    [theme, mode, barbers, getBarber, myBarber, createMyBarber, saveMyBarber, appointments, book, cancel, confirm],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState debe usarse dentro de <AppStateProvider>');
  return ctx;
}

export function toISODate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISODate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
