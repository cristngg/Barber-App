import { Route, Routes, useParams } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Button } from './components/Button';
import { Screen } from './components/Screen';
import { RequireAuth } from './components/SignIn';
import { Agenda } from './screens/Agenda';
import { Citas } from './screens/Citas';
import { Cuenta } from './screens/Cuenta';
import { EditarCorte } from './screens/EditarCorte';
import { EditarPerfil } from './screens/EditarPerfil';
import { Explorar } from './screens/Explorar';
import { MiPerfil } from './screens/MiPerfil';
import { NotFound } from './screens/NotFound';
import { Perfil } from './screens/Perfil';
import { Reservar } from './screens/Reservar';
import { Suscripcion } from './screens/Suscripcion';
import { useAppState } from './state/AppState';

/* Las pantallas del barbero piden entrar primero: el perfil queda ligado a su cuenta de Google. */
function Barbero({ page }: { page: JSX.Element }) {
  return (
    <RequireAuth
      title="Muestra tus cortes"
      reason="Entra con tu cuenta para crear y editar tu perfil de barbero desde cualquier teléfono."
      backTo="/cuenta"
    >
      {page}
    </RequireAuth>
  );
}

function ReservarGate() {
  const { id } = useParams();
  return (
    <RequireAuth
      title="Entra para apartar"
      reason="Así tu cita queda a tu nombre y la ves en cualquier teléfono."
      backTo={`/barbero/${id}`}
    >
      <Reservar />
    </RequireAuth>
  );
}

export function App() {
  const { status, retry } = useAppState();

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
      ) : (
        <Routes>
          <Route path="/" element={<Explorar />} />
          <Route path="/barbero/:id" element={<Perfil />} />
          <Route
            path="/barbero/:id/reservar"
            element={
              <ReservarGate />
            }
          />
          <Route
            path="/citas"
            element={
              <RequireAuth title="Tus citas" reason="Entra para ver y cancelar las citas que apartaste." footer={<BottomNav />}>
                <Citas />
              </RequireAuth>
            }
          />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/soy-barbero" element={<Barbero page={<Suscripcion />} />} />
          <Route path="/mi-perfil" element={<Barbero page={<MiPerfil />} />} />
          <Route path="/mi-perfil/editar" element={<Barbero page={<EditarPerfil />} />} />
          <Route path="/mi-perfil/corte/:serviceId" element={<Barbero page={<EditarCorte />} />} />
          <Route path="/agenda" element={<Barbero page={<Agenda />} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
    </div>
  );
}
