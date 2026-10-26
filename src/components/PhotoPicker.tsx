import { useId, useState, type ChangeEvent } from 'react';
import { savePhoto } from '../state/photos';
import { Icon } from './Icon';
import { Photo } from './Photo';

type Props = {
  label: string;
  value?: string;
  onChange: (ref: string) => void;
  /* Clase de tamaño de la vista previa (portada, avatar, corte). */
  previewClass: string;
  maxSide?: number;
};

/* Subir o cambiar una foto. El campo de archivo real queda oculto tras una etiqueta con forma de botón. */
export function PhotoPicker({ label, value, onChange, previewClass, maxSide }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      onChange(await savePhoto(file, maxSide));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo guardar la foto. Prueba con otra.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="photo-picker">
        {value ? (
          <Photo src={value} alt={label} label="" className={previewClass} />
        ) : (
          <div className={`photo-picker__empty ${previewClass}`} aria-hidden="true">
            <Icon name="camera" size={28} />
          </div>
        )}
        <input id={id} type="file" accept="image/*" className="sr-only photo-picker__input" onChange={pick} disabled={busy} />
        <label htmlFor={id} className="btn btn--secondary photo-picker__btn" aria-busy={busy}>
          <Icon name="camera" size={20} />
          {busy ? 'Guardando…' : value ? 'Cambiar foto' : 'Subir foto'}
        </label>
      </div>
      {error && (
        <span className="field__error" role="alert">
          <Icon name="alert" size={16} strokeWidth={2} />
          {error}
        </span>
      )}
    </div>
  );
}
