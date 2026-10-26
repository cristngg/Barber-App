import { useId, type InputHTMLAttributes } from 'react';
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
