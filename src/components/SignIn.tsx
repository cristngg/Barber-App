import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import { renderGoogleButton } from '../state/google';
import { Button } from './Button';
import { TextField } from './Field';
import { Icon } from './Icon';
import { Screen } from './Screen';

/* El botón de Google (y, solo en desarrollo, entrar con un nombre de prueba). */
export function SignInPanel() {
  const { config, theme, signInWithGoogle, signInDev } = useAppState();
  const slot = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [devName, setDevName] = useState('');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const clientId = config.googleClientId;
  useEffect(() => {
    if (!clientId || !slot.current) return;
    renderGoogleButton(slot.current, clientId, (credential) => run(() => signInWithGoogle(credential)), theme === 'dark').catch(
      () => setError('No se pudo cargar Google. Revisa tu internet y prueba otra vez.'),
    );
    // run y signInWithGoogle cambian con cada render; el botón solo se dibuja de nuevo si cambia el tema o el cliente.
  }, [clientId, theme]);

  const devSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (devName.trim()) run(() => signInDev(devName.trim()));
  };

  return (
    <div className="signin" aria-busy={busy}>
      {clientId ? (
        <div ref={slot} className="signin__google" />
      ) : (
        !config.devLogin && <p className="t-detail">El inicio con Google todavía no está configurado en el servidor.</p>
      )}

      {busy && (
        <p className="t-detail" role="status">
          Entrando…
        </p>
      )}

      {error && (
        <span className="field__error" role="alert">
          <Icon name="alert" size={16} strokeWidth={2} />
          {error}
        </span>
      )}

      {config.devLogin && (
        <form className="signin__dev" onSubmit={devSubmit}>
          <TextField
            label="Entrar de prueba (solo desarrollo)"
            placeholder="Tu nombre"
            value={devName}
            onChange={(e) => setDevName(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={busy || !devName.trim()}>
            Entrar de prueba
          </Button>
        </form>
      )}

      <p className="t-detail">Solo usamos tu nombre, correo y foto de Google para tu cuenta de Filo.</p>
    </div>
  );
}

type GateProps = {
  children: ReactNode;
  title: string;
  reason: string;
  /* La barra inferior en pestañas; si no, un botón para volver. */
  footer?: ReactNode;
  backTo?: string;
};

/* Muestra `children` solo con sesión abierta; si no, pide entrar ahí mismo y vuelve sola al entrar. */
export function RequireAuth({ children, title, reason, footer, backTo }: GateProps) {
  const { user } = useAppState();
  if (user) return <>{children}</>;
  return (
    <Screen footer={footer}>
      {backTo && (
        <Link to={backTo} className="icon-btn page-head__back" aria-label="Volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
      )}
      <div className="stack-16">
        <div className="polo-ribbon plan-ribbon" aria-hidden="true" />
        <h1 className="t-display plan-title">{title}</h1>
        <p className="t-body signin__reason">{reason}</p>
      </div>
      <SignInPanel />
    </Screen>
  );
}
