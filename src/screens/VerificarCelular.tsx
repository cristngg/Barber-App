import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PhoneVerify } from '../components/PhoneVerify';
import { Screen } from '../components/Screen';
import './screens.css';

/* Para barberos que ya tenían cuenta antes de pedir el celular. */
export function VerificarCelular() {
  const navigate = useNavigate();
  return (
    <Screen>
      <div className="page-head">
        <Link to="/mi-perfil" className="icon-btn page-head__back" aria-label="Volver">
          <Icon name="back" size={22} strokeWidth={2} />
        </Link>
        <h1 className="t-title t-title--sm">Tu celular</h1>
      </div>
      <PhoneVerify onDone={() => navigate('/mi-perfil', { replace: true })} />
    </Screen>
  );
}
