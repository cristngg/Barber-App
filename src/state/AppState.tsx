import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Barber } from '../data/barbers';
import { api, ApiError, hasSession, onSessionExpired, type Appointment, type BarberPatch, type Config, type ServiceInput, type User } from './api';
import { load, save } from './storage';

export type { Appointment, User } from './api';
export type Theme = 'dark' | 'light';
export type Mode = 'client' | 'barber';
export type Status = 'loading' | 'ready' | 'offline';

type AppState = {
  status: Status;
  retry: () => void;
  config: Config;
  /* La persona con sesión abierta, o null si no ha entrado. */
  user: User | null;
  signInWithGoogle: (credential: string) => Promise<void>;
  signInDev: (name: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  barbers: Barber[];
  getBarber: (id: string | undefined) => Barber | undefined;
  refreshBarbers: () => Promise<void>;
  /* El perfil del barbero que usa este teléfono. */
  myBarber: Barber | null;
  createMyBarber: (name: string, area: string) => Promise<Barber>;
  updateMyBarber: (patch: BarberPatch) => Promise<void>;
  saveService: (id: string | null, s: ServiceInput) => Promise<void>;
  removeService: (id: string) => Promise<void>;
  /* Las citas que apartó este teléfono como cliente. */
  appointments: Appointment[];
  refreshAppointments: () => Promise<void>;
  book: (a: { barberId: string; serviceId: string; date: string; hour: number }) => Promise<Appointment>;
  cancel: (id: string) => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

const THEME_KEY = 'filo.theme';
const MODE_KEY = 'filo.mode';

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => load<Theme>(THEME_KEY, 'dark'));
  const [mode, setMode] = useState<Mode>(() => load<Mode>(MODE_KEY, 'client'));
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [myBarber, setMyBarber] = useState<Barber | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [config, setConfig] = useState<Config>({ googleClientId: null, devLogin: false });
  const [user, setUser] = useState<User | null>(null);

  const clearSession = useCallback(() => {
    setUser(null);
    setMyBarber(null);
    setAppointments([]);
    setMode('client');
  }, []);

  useEffect(() => onSessionExpired(clearSession), [clearSession]);

  /* Con sesión: quién soy, mi perfil de barbero y mis citas. */
  const loadMine = useCallback(async () => {
    const [me, appts] = await Promise.all([api.me(), api.appointments()]);
    setUser(me.user);
    setMyBarber(me.barber);
    setAppointments(appts);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F1012' : '#FFFDF8');
    save(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => save(MODE_KEY, mode), [mode]);

  /* Carga inicial: configuración y barberos; lo mío solo si hay sesión. */
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    const mine = hasSession()
      ? loadMine().catch((err) => {
          if (err instanceof ApiError && err.status === 401) return; // sesión vencida: entra de nuevo
          throw err;
        })
      : Promise.resolve();
    Promise.all([api.config(), api.barbers(), mine])
      .then(([cfg, list]) => {
        if (!alive) return;
        setConfig(cfg);
        setBarbers(list);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('offline'));
    return () => {
      alive = false;
    };
  }, [attempt, loadMine]);

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      await api.signInWithGoogle(credential);
      await loadMine();
    },
    [loadMine],
  );

  const signInDev = useCallback(
    async (name: string) => {
      await api.signInDev(name);
      await loadMine();
    },
    [loadMine],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      await api.signInWithPassword(email, password);
      await loadMine();
    },
    [loadMine],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await api.register(name, email, password);
      await loadMine();
    },
    [loadMine],
  );

  const signOut = useCallback(async () => {
    await api.signOut();
    window.google?.accounts.id.disableAutoSelect();
    clearSession();
  }, [clearSession]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const getBarber = useCallback((id: string | undefined) => barbers.find((b) => b.id === id), [barbers]);

  const refreshBarbers = useCallback(async () => {
    setBarbers(await api.barbers());
  }, []);

  /* Tras cada cambio del perfil, el servidor devuelve el perfil completo. */
  const applyMine = useCallback((b: Barber) => {
    setMyBarber(b);
    setBarbers((list) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b]));
  }, []);

  const createMyBarber = useCallback(
    async (name: string, area: string) => {
      const b = await api.createBarber(name, area);
      applyMine(b);
      setMode('barber');
      return b;
    },
    [applyMine],
  );

  const updateMyBarber = useCallback(async (patch: BarberPatch) => applyMine(await api.updateBarber(patch)), [applyMine]);

  const saveService = useCallback(
    async (id: string | null, s: ServiceInput) => applyMine(await (id ? api.updateService(id, s) : api.addService(s))),
    [applyMine],
  );

  const removeService = useCallback(async (id: string) => applyMine(await api.removeService(id)), [applyMine]);

  const refreshAppointments = useCallback(async () => {
    setAppointments(await api.appointments());
  }, []);

  const book = useCallback<AppState['book']>(async (a) => {
    const appt = await api.book(a);
    setAppointments((list) => [...list, appt]);
    return appt;
  }, []);

  const cancel = useCallback(async (id: string) => {
    const appt = await api.cancel(id);
    setAppointments((list) => list.map((a) => (a.id === id ? appt : a)));
  }, []);

  const value = useMemo(
    () => ({
      status,
      retry,
      config,
      user,
      signInWithGoogle,
      signInDev,
      signInWithPassword,
      register,
      signOut,
      theme,
      setTheme,
      mode,
      setMode,
      barbers,
      getBarber,
      refreshBarbers,
      myBarber,
      createMyBarber,
      updateMyBarber,
      saveService,
      removeService,
      appointments,
      refreshAppointments,
      book,
      cancel,
    }),
    [status, retry, config, user, signInWithGoogle, signInDev, signInWithPassword, register, signOut, theme, mode, barbers, getBarber, refreshBarbers, myBarber, createMyBarber, updateMyBarber,
      saveService, removeService, appointments, refreshAppointments, book, cancel],
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
