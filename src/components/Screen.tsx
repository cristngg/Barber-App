import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /* Barra de acción fija abajo (CTA) o la navegación inferior. */
  footer?: ReactNode;
  padded?: boolean;
};

/* Marco de pantalla móvil: contenido con scroll y pie fijo. */
export function Screen({ children, footer, padded = true }: Props) {
  return (
    <div className="screen">
      <main className={`screen__main${padded ? ' screen__main--padded' : ''}`}>{children}</main>
      {footer}
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}

export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="section-header">
      <h2 className="t-label">{title}</h2>
      {aside && <span className="section-header__aside">{aside}</span>}
    </div>
  );
}
