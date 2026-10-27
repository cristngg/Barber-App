import { Route, Routes } from 'react-router-dom';
import { Button } from './components/Button';
import { Screen } from './components/Screen';
import { Agenda } from './screens/Agenda';
import { Calificar } from './screens/Calificar';
import { Citas } from './screens/Citas';
import { Cortes } from './screens/Cortes';
import { Cuenta } from './screens/Cuenta';
import { EditarCorte } from './screens/EditarCorte';
import { EditarPerfil } from './screens/EditarPerfil';
import { Entrar } from './screens/Entrar';
import { Explorar } from './screens/Explorar';
import { Horario } from './screens/Horario';
import { MiPerfil } from './screens/MiPerfil';
import { NotFound } from './screens/NotFound';
import { Perfil } from './screens/Perfil';
import { Reservar } from './screens/Reservar';
import { Ruta } from './screens/Ruta';
import { Suscripcion } from './screens/Suscripcion';
import { useAppState } from './state/AppState';

export function App() {
  const { status, retry, user } = useAppState();

  return (
    <div className="app-frame">
      {status === 'loading' ? (
        <Screen>
          <p className="t-detail" role="status">
            Cargando…
          </p>
        </Screen>
      ) : status === 'offline' ? (
        <Screen>
          <h1 className="t-title">Sin conexión</h1>
          <p className="t-body">No pudimos llegar a Filo. Revisa tu internet y prueba otra vez.</p>
          <Button variant="secondary" onClick={retry}>
            Reintentar
          </Button>
        </Screen>
      ) : !user ? (
        /* Sin sesión, lo primero es entrar; al entrar se muestra la dirección que se pidió. */
        <Entrar />
      ) : (
        <Routes>
          <Route path="/" element={<Explorar />} />
          <Route path="/barbero/:id" element={<Perfil />} />
          <Route path="/barbero/:id/reservar" element={<Reservar />} />
          <Route path="/barbero/:id/ruta" element={<Ruta />} />
          <Route path="/cortes" element={<Cortes />} />
          <Route path="/citas" element={<Citas />} />
          <Route path="/citas/:id/calificar" element={<Calificar />} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/soy-barbero" element={<Suscripcion />} />
          <Route path="/mi-perfil" element={<MiPerfil />} />
          <Route path="/mi-perfil/editar" element={<EditarPerfil />} />
          <Route path="/mi-perfil/horario" element={<Horario />} />
          <Route path="/mi-perfil/corte/:serviceId" element={<EditarCorte />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
    </div>
  );
}
