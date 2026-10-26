import { ButtonLink } from '../components/Button';
import { Screen } from '../components/Screen';

export function NotFound() {
  return (
    <Screen>
      <h1 className="t-title">No está aquí</h1>
      <p className="t-body">Ese barbero o esa página ya no existe.</p>
      <ButtonLink to="/" variant="secondary">
        Volver a explorar
      </ButtonLink>
    </Screen>
  );
}
