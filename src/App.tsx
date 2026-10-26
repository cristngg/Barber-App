import { Route, Routes } from 'react-router-dom';
import { Citas } from './screens/Citas';
import { Cuenta } from './screens/Cuenta';
import { Explorar } from './screens/Explorar';
import { NotFound } from './screens/NotFound';
import { Perfil } from './screens/Perfil';
import { Reservar } from './screens/Reservar';
import { Suscripcion } from './screens/Suscripcion';

export function App() {
  return (
    <div className="app-frame">
      <Routes>
        <Route path="/" element={<Explorar />} />
        <Route path="/barbero/:id" element={<Perfil />} />
        <Route path="/barbero/:id/reservar" element={<Reservar />} />
        <Route path="/citas" element={<Citas />} />
        <Route path="/cuenta" element={<Cuenta />} />
        <Route path="/soy-barbero" element={<Suscripcion />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
