import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { load, save } from './storage';

export type Theme = 'dark' | 'light';

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
  appointments: Appointment[];
  book: (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>) => Appointment;
  cancel: (id: string) => void;
};

const Ctx = createContext<AppState | null>(null);

const THEME_KEY = 'filo.theme';
const APPTS_KEY = 'filo.appointments';

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => load<Theme>(THEME_KEY, 'dark'));
  const [appointments, setAppointments] = useState<Appointment[]>(() => load<Appointment[]>(APPTS_KEY, []));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F1012' : '#FFFDF8');
    save(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => save(APPTS_KEY, appointments), [appointments]);

  const book = useCallback<AppState['book']>((a) => {
    const appt: Appointment = { ...a, id: crypto.randomUUID(), status: 'pending', createdAt: Date.now() };
    setAppointments((list) => [...list, appt]);
    return appt;
  }, []);

  const cancel = useCallback((id: string) => {
    setAppointments((list) => list.map((a) => (a.id === id ? { ...a, status: 'cancelled' } : a)));
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, appointments, book, cancel }),
    [theme, appointments, book, cancel],
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
