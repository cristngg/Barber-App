# Filo

App móvil para que los barberos muestren su trabajo y los clientes aparten su puesto.
Construida sobre el sistema de diseño **Filo** (tinta, hueso y latón; variante clara).

## Correr

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Estructura

- `src/styles/tokens.css`: tokens del sistema (color, tipografía, espacio, esquinas) para el tema oscuro y el claro (`data-theme`).
- `src/components/`: Button, Chip, SearchField/TextField, StatusTag, BarberCard, BottomNav, AppointmentRow, Photo, Rating, Icon.
- `src/screens/`, cliente: Explorar (`/`), Perfil (`/barbero/:id`), Apartar cita (`/barbero/:id/reservar`), Mis citas (`/citas`), Cuenta (`/cuenta`).
- `src/screens/`, barbero: Cuenta de barbero (`/soy-barbero`), Portafolio (`/mi-perfil`), Editar perfil (`/mi-perfil/editar`), Editar corte (`/mi-perfil/corte/:id`, `nuevo` para agregar), Agenda (`/agenda`).
- `src/data/barbers.ts`: barberos de ejemplo; cámbialos por tu API.
- `src/state/AppState.tsx`: tema, modo (cliente/barbero), perfil del barbero y citas, guardados en `localStorage`.
- `src/state/photos.ts`: fotos que sube el barbero, reducidas en el teléfono y guardadas en IndexedDB.

## Modo barbero

Al crear la cuenta de barbero, la persona entra a su portafolio. Desde ahí puede:

- Editar foto de portada, foto de perfil, nombre, barrio, descripción, especialidades, días que atiende y si está libre hoy.
- Subir cortes con foto, nombre y precio. Cada corte es también un servicio que el cliente puede apartar.
- Ver su perfil como lo ve un cliente, y confirmar o cancelar citas en su agenda.

En Cuenta se cambia entre usar Filo como cliente o como barbero.

## Pendiente

- Los barberos de ejemplo siguen con `$[PRECIO]` y sin fotos; los perfiles reales los llena cada barbero.
- Backend: hoy el perfil, las fotos y las citas viven solo en el teléfono. Con servidor, `savePhoto` debe subir la foto y devolver su URL, y el perfil y las citas deben guardarse en la API para que los clientes los vean.
- Cobro de la suscripción y `[TÉRMINOS DE COBRO Y CANCELACIÓN]`.
