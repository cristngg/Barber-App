import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import { Button } from './Button';
import { TextField } from './Field';
import { Icon } from './Icon';
import { FormError } from './SignIn';

/* Verificar el celular: escribir el número, recibir un código de 6 dígitos y escribirlo. */
export function PhoneVerify({ onDone }: { onDone?: () => void }) {
  const { phone: status, refreshMe } = useAppState();
  const [number, setNumber] = useState(status.phone?.replace(/^\+507/, '') ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [testCode, setTestCode] = useState<string>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (status.verified) {
    return (
      <div className="notice" role="status">
        <Icon name="check" size={20} strokeWidth={2.2} />
        Celular verificado: {status.phone}
      </div>
    );
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!number.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.startPhone(number);
      setSentTo(r.phone);
      setTestCode(r.testCode);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.verifyPhone(code);
      await refreshMe();
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (!sentTo) {
    return (
      <form className="phone-verify" onSubmit={send} noValidate>
        <TextField
          label="Tu celular"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="6000-0000"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          hint="Te enviamos un código para confirmar que es tuyo. Los clientes no lo ven."
        />
        <FormError message={error} />
        <Button type="submit" variant="secondary" disabled={busy || !number.trim()}>
          {busy ? 'Enviando…' : 'Enviar código'}
        </Button>
      </form>
    );
  }

  return (
    <form className="phone-verify" onSubmit={verify} noValidate>
      {testCode && (
        <div className="notice notice--warn" role="note">
          <Icon name="info" size={20} strokeWidth={2} />
          <span>Modo de prueba: no se envía ningún mensaje. Tu código es {testCode}.</span>
        </div>
      )}
      <TextField
        label={`Código que llegó a ${sentTo}`}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="field__input code-input"
      />
      <FormError message={error} />
      <Button type="submit" disabled={busy || code.length !== 6}>
        {busy ? 'Verificando…' : 'Verificar'}
      </Button>
      <div className="button-pair button-pair--row">
        <Button variant="ghost" onClick={() => send()} disabled={busy}>
          Reenviar código
        </Button>
        <Button variant="ghost" onClick={() => setSentTo(null)} disabled={busy}>
          Cambiar número
        </Button>
      </div>
    </form>
  );
}
