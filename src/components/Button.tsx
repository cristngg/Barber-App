import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './components.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Common = { variant?: ButtonVariant; icon?: ReactNode; children: ReactNode };

export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`btn btn--${variant} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/* Un enlace con forma de botón (navegar, no actuar). */
export function ButtonLink({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...rest
}: Common & LinkProps) {
  return (
    <Link className={`btn btn--${variant} ${className}`} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
