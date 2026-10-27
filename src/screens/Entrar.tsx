import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Chip, ChipRow } from '../components/Chip';
import { PasswordField, TextField } from '../components/Field';
import { Screen } from '../components/Screen';
import { DevSignIn, FormError, GoogleSignIn } from '../components/SignIn';
import { errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import './screens.css';

type Mode = 'login' | 'register';
type Errors = Partial<Record<'name' | 'email' | 'password', string>>;

const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Lo primero que ve quien no ha entrado: Google o correo y contraseña. */
export function Entrar() {
  const { signInWithPassword, register } = useAppState();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [googleError, setGoogleError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(undefined);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {
      name: isRegister && !name.trim() ? 'Escribe tu nombre.' : undefined,
      email: EMAIL_RE.test(email.trim()) ? undefined : 'Escribe un correo válido.',
      password: !password
        ? 'Escribe tu contraseña.'
        : isRegister && password.length < PASSWORD_MIN
          ? `Usa al menos ${PASSWORD_MIN} caracteres.`
          : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || busy) return;
    setBusy(true);
    setFormError(undefined);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await signInWithPassword(email.trim(), password);
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <header className="login-head">
        <div className="polo-ribbon plan-ribbon" aria-hidden="true" />
        <h1 className="t-display login-brand">Filo</h1>
        <p className="t-title t-title--sm">Tu corte, a un toque</p>
        <p className="t-body signin__reason">Encuentra barbero cerca y aparta tu puesto. Si cortas, muestra tu trabajo.</p>
      </header>

      <GoogleSignIn onError={setGoogleError} />
      <FormError message={googleError} />

      <div className="login-divider" role="separator">
        <span>o con tu correo</span>
      </div>

      <ChipRow label="¿Ya tienes cuenta?">
        <Chip selected={!isRegister} onToggle={() => switchMode('login')}>
          Entrar
        </Chip>
        <Chip selected={isRegister} onToggle={() => switchMode('register')}>
          Crear cuenta
        </Chip>
      </ChipRow>

      <form className="form-stack" onSubmit={submit} noValidate>
        {isRegister && (
          <TextField
            label="Tu nombre"
            placeholder="Como te dicen"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
        )}
        <TextField
          label="Correo"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField
          label="Contraseña"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={isRegister ? `Al menos ${PASSWORD_MIN} caracteres.` : undefined}
        />
        <FormError message={formError} />
        <Button type="submit" disabled={busy}>
          {busy ? (isRegister ? 'Creando tu cuenta…' : 'Entrando…') : isRegister ? 'Crear cuenta' : 'Entrar'}
        </Button>
      </form>

      <p className="t-detail login-fine">Al entrar aceptas los [TÉRMINOS Y POLÍTICA DE PRIVACIDAD] de Filo.</p>

      <DevSignIn />
    </Screen>
  );
}
