import { useId, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, error, hint, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  return (
    <div className="field">
      <label htmlFor={inputId} className="field__label">
        {label}
      </label>
      <input
        id={inputId}
        className="field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        {...rest}
      />
      {error ? (
        <span id={msgId} className="field__error">
          <Icon name="alert" size={16} strokeWidth={2} />
          {error}
        </span>
      ) : hint ? (
        <span id={msgId} className="t-detail">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/* Contraseña con botón para mostrarla u ocultarla. */
export function PasswordField({ label, error, hint, id, ...rest }: Omit<TextFieldProps, 'type'>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={inputId} className="field__label">
        {label}
      </label>
      <div className="field__with-action">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          autoCapitalize="none"
          spellCheck={false}
          {...rest}
        />
        <button
          type="button"
          className="icon-btn field__action"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={22} />
        </button>
      </div>
      {error ? (
        <span id={msgId} className="field__error">
          <Icon name="alert" size={16} strokeWidth={2} />
          {error}
        </span>
      ) : hint ? (
        <span id={msgId} className="t-detail">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export function TextArea({ label, hint, id, ...rest }: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  return (
    <div className="field">
      <label htmlFor={inputId} className="field__label">
        {label}
      </label>
      <textarea
        id={inputId}
        className="field__input field__input--area"
        aria-describedby={hint ? msgId : undefined}
        {...rest}
      />
      {hint && (
        <span id={msgId} className="t-detail">
          {hint}
        </span>
      )}
    </div>
  );
}

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

export function SearchField({ value, onChange, label = 'Buscar barbero o barrio' }: SearchFieldProps) {
  const id = useId();
  return (
    <div className="search">
      <Icon name="search" size={22} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}
