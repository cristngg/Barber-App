import type { CSSProperties } from 'react';

type Props = {
  src?: string;
  alt: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/* La foto del trabajo manda: va sin filtros ni marcos.
   Sin `src`, muestra el patrón de rayas con una etiqueta. */
export function Photo({ src, alt, label = 'FOTO', className = '', style }: Props) {
  return (
    <div className={`photo ${className}`} style={style}>
      {src ? <img src={src} alt={alt} /> : <span className="photo__label">{label}</span>}
    </div>
  );
}
