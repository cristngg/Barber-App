/*
 * Google Identity Services: el botón oficial "Continuar con Google".
 * https://developers.google.com/identity/gsi/web
 */

type CredentialResponse = { credential: string };

type ButtonOptions = {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
          }) => void;
          renderButton: (parent: HTMLElement, options: ButtonOptions) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

const SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

export function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('No se pudo cargar Google.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/* Dibuja el botón de Google dentro de `parent`; `onCredential` recibe el token a verificar en el servidor. */
export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
  dark: boolean,
) {
  await loadGoogle();
  const id = window.google!.accounts.id;
  id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), ux_mode: 'popup' });
  parent.replaceChildren();
  id.renderButton(parent, {
    type: 'standard',
    theme: dark ? 'filled_black' : 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'center',
    width: Math.min(400, Math.max(200, Math.floor(parent.clientWidth))),
    locale: 'es',
  });
}
