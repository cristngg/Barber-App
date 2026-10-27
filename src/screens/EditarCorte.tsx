import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { parsePrice, SPECIALTIES } from '../data/barbers';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { PhotoPicker } from '../components/PhotoPicker';
import { ActionBar, Screen } from '../components/Screen';
import { errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import './screens.css';

type Errors = Partial<Record<'name' | 'price' | 'style', string>>;

/* Un corte del portafolio: foto, tipo, nombre y precio. También es el servicio que el cliente aparta y lo que sale en "Cortes". */
export function EditarCorte() {
  const { serviceId } = useParams();
  const { myBarber, saveService, removeService } = useAppState();
  const navigate = useNavigate();
  const isNew = serviceId === 'nuevo';
  const existing = myBarber?.services.find((s) => s.id === serviceId);

  const [photo, setPhoto] = useState(existing?.photo);
  const [name, setName] = useState(existing?.name ?? '');
  const [price, setPrice] = useState(existing?.price != null ? existing.price.toFixed(2) : '');
  const [style, setStyle] = useState<string | null>(existing?.style ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  if (!myBarber) return <Navigate to="/soy-barbero" replace />;
  if (!isNew && !existing) return <Navigate to="/mi-perfil" replace />;

  /* Corre una acción contra el servidor y, si sale bien, vuelve al portafolio. */
  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await action();
      navigate('/mi-perfil');
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parsePrice(price);
    const next: Errors = {
      name: name.trim() ? undefined : 'Ponle nombre al corte, como “Fade bajo”.',
      price: parsed != null ? undefined : 'Escribe el precio en dólares, como 12 o 12.50.',
      style: style ? undefined : 'Elige el tipo: así te encuentran cuando buscan ese corte.',
    };
    setErrors(next);
    if (next.name || next.price || next.style || parsed == null || !style || saving) return;
    run(() => saveService(existing?.id ?? null, { name: name.trim(), price: parsed, photo: photo ?? null, style }));
  };

  const remove = () => {
    if (!existing || saving || !window.confirm(`¿Quitar “${existing.name}” de tu portafolio?`)) return;
    run(() => removeService(existing.id));
  };

  return (
    <Screen
      footer={
        <ActionBar>
          {saveError && (
            <span className="field__error" role="alert">
              <Icon name="alert" size={16} strokeWidth={2} />
              {saveError}
            </span>
          )}
          <Button type="submit" form="cut-form" disabled={saving}>
            {saving ? 'Guardando…' : isNew ? 'Agregar corte' : 'Guardar cambios'}
          </Button>
          {!isNew && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              Quitar corte
            </Button>
          )}
        </ActionBar>
      }
    >
      <div className="page-head">
        <Link to="/mi-perfil" className="icon-btn page-head__back" aria-label="Volver sin guardar">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">{isNew ? 'Nuevo corte' : 'Editar corte'}</h1>
      </div>

      <form id="cut-form" className="form-stack" onSubmit={submit} noValidate>
        <PhotoPicker label="Foto del corte" value={photo} onChange={setPhoto} previewClass="picker-cut" maxSide={1080} />
        <fieldset className="step">
          <legend className="field__label">Tipo de corte</legend>
          <div className="chip-wrap" role="group" aria-label="Tipo de corte">
            {SPECIALTIES.map((s) => (
              <Chip key={s.tag} selected={style === s.tag} onToggle={() => setStyle(s.tag)}>
                {s.label}
              </Chip>
            ))}
          </div>
          {errors.style && (
            <span className="field__error">
              <Icon name="alert" size={16} strokeWidth={2} />
              {errors.style}
            </span>
          )}
        </fieldset>
        <TextField
          label="Nombre del corte"
          placeholder="Fade bajo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <TextField
          label="Precio en dólares"
          placeholder="12.00"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={errors.price}
          hint="Lo que paga el cliente por este corte."
        />
      </form>
    </Screen>
  );
}
