import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import { renderGoogleButton } from '../state/google';
import { Button } from './Button';
import { TextField } from './Field';
import { Icon } from './Icon';

/* El botón oficial de Google. */
export function GoogleSignIn({ onError }: { onError: (message: string | undefined) => void }) {
  const { config, theme, signInWithGoogle } = useAppState();
  const slot = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const clientId = config.googleClientId;

  useEffect(() => {
    if (!clientId || !slot.current) return;
    const onCredential = async (credential: string) => {
      setBusy(true);
      onError(undefined);
      try {
        await signInWithGoogle(credential);
      } catch (err) {
        onError(errorMessage(err));
        setBusy(false);
      }
    };
    renderGoogleButton(slot.current, clientId, onCredential, theme === 'dark').catch(() =>
      onError('No se pudo cargar Google. Revisa tu internet o entra con tu correo.'),
    );
    // El botón solo se dibuja de nuevo si cambia el tema o el cliente.
  }, [clientId, theme]);

  if (!clientId) return null;
  return (
    <div className="signin__google" aria-busy={busy}>
      <div ref={slot} className="signin__slot" />
      {busy && (
        <p className="t-detail" role="status">
          Entrando…
        </p>
      )}
    </div>
  );
}

/* Solo desarrollo: entrar con un nombre, sin Google ni contraseña. */
export function DevSignIn() {
  const { config, signInDev } = useAppState();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!config.devLogin) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await signInDev(name.trim());
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form className="signin__dev" onSubmit={submit}>
      <TextField
        label="Entrar de prueba (solo desarrollo)"
        placeholder="Tu nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      <Button type="submit" variant="ghost" disabled={busy || !name.trim()}>
        Entrar de prueba
      </Button>
    </form>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="field__error" role="alert">
      <Icon name="alert" size={16} strokeWidth={2} />
      {message}
    </span>
  );
}
