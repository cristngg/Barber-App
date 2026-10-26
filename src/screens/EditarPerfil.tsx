import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { SPECIALTIES, type Barber } from '../data/barbers';
import { Button } from '../components/Button';
import { Chip, ChipRow } from '../components/Chip';
import { TextArea, TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { PhotoPicker } from '../components/PhotoPicker';
import { ActionBar, Screen } from '../components/Screen';
import { errorMessage } from '../state/api';
import { useAppState } from '../state/AppState';
import './screens.css';

const BIO_MAX = 240;

/* Lunes primero, como se lee una semana de trabajo. */
const WEEK = [
  { day: 1, label: 'Lun' },
  { day: 2, label: 'Mar' },
  { day: 3, label: 'Mié' },
  { day: 4, label: 'Jue' },
  { day: 5, label: 'Vie' },
  { day: 6, label: 'Sáb' },
  { day: 0, label: 'Dom' },
];

type Errors = Partial<Record<'name' | 'area' | 'workDays', string>>;

export function EditarPerfil() {
  const { myBarber, updateMyBarber } = useAppState();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Barber | null>(myBarber);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  if (!myBarber || !draft) return <Navigate to="/soy-barbero" replace />;

  const set = <K extends keyof Barber>(key: K, value: Barber[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  /* La foto anterior la borra el servidor al guardar. */
  const setPhoto = (key: 'cover' | 'avatar', url: string) => set(key, url);

  const toggleTag = (tag: string) => {
    const tags = draft.tags.includes(tag) ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag];
    setDraft({
      ...draft,
      tags,
      specialties: SPECIALTIES.filter((s) => tags.includes(s.tag)).map((s) => s.label),
    });
  };

  const toggleDay = (day: number) =>
    set('workDays', draft.workDays.includes(day) ? draft.workDays.filter((d) => d !== day) : [...draft.workDays, day]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {
      name: draft.name.trim() ? undefined : 'Escribe tu nombre o el de tu barbería.',
      area: draft.area.trim() ? undefined : 'Escribe el barrio donde atiendes.',
      workDays: draft.workDays.length ? undefined : 'Marca al menos un día.',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || saving) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await updateMyBarber({
        name: draft.name,
        area: draft.area,
        bio: draft.bio,
        tags: draft.tags,
        workDays: draft.workDays,
        freeToday: draft.freeToday,
        avatar: draft.avatar ?? null,
        cover: draft.cover ?? null,
      });
      navigate('/mi-perfil');
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
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
          <Button type="submit" form="profile-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </ActionBar>
      }
    >
      <div className="page-head">
        <Link to="/mi-perfil" className="icon-btn page-head__back" aria-label="Volver sin guardar">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">Editar perfil</h1>
      </div>

      <form id="profile-form" className="form-stack" onSubmit={submit} noValidate>
        <PhotoPicker
          label="Foto de portada"
          value={draft.cover}
          onChange={(ref) => setPhoto('cover', ref)}
          previewClass="picker-cover"
          maxSide={1600}
        />
        <PhotoPicker
          label="Foto de perfil"
          value={draft.avatar}
          onChange={(ref) => setPhoto('avatar', ref)}
          previewClass="picker-avatar"
          maxSide={600}
        />

        <TextField
          label="Tu nombre o el de tu barbería"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          autoComplete="organization"
        />
        <TextField
          label="Barrio o zona"
          value={draft.area}
          onChange={(e) => set('area', e.target.value)}
          error={errors.area}
        />
        <TextArea
          label="Descripción"
          rows={4}
          maxLength={BIO_MAX}
          placeholder="Fade, barba y diseños a navaja. Atiendo con cita, de martes a sábado."
          value={draft.bio}
          onChange={(e) => set('bio', e.target.value)}
          hint={`${draft.bio.length}/${BIO_MAX}`}
        />

        <fieldset className="step">
          <legend className="field__label">Especialidades</legend>
          <ChipRow label="Especialidades">
            {SPECIALTIES.map((s) => (
              <Chip key={s.tag} selected={draft.tags.includes(s.tag)} onToggle={() => toggleTag(s.tag)}>
                {s.label}
              </Chip>
            ))}
          </ChipRow>
        </fieldset>

        <fieldset className="step">
          <legend className="field__label">Días que atiendes</legend>
          <div className="week-grid" role="group" aria-label="Días que atiendes">
            {WEEK.map((w) => (
              <button
                key={w.day}
                type="button"
                className="chip chip--day"
                aria-pressed={draft.workDays.includes(w.day)}
                onClick={() => toggleDay(w.day)}
              >
                {w.label}
              </button>
            ))}
          </div>
          {errors.workDays && (
            <span className="field__error">
              <Icon name="alert" size={16} strokeWidth={2} />
              {errors.workDays}
            </span>
          )}
        </fieldset>

        <fieldset className="step">
          <legend className="field__label">Hoy</legend>
          <ChipRow label="Disponibilidad de hoy">
            <Chip selected={draft.freeToday} onToggle={() => set('freeToday', true)}>
              Libre hoy
            </Chip>
            <Chip selected={!draft.freeToday} onToggle={() => set('freeToday', false)}>
              Sin puestos
            </Chip>
          </ChipRow>
        </fieldset>
      </form>
    </Screen>
  );
}
