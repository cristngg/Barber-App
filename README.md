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
- `src/screens/`: Explorar (`/`), Perfil (`/barbero/:id`), Apartar cita (`/barbero/:id/reservar`), Mis citas (`/citas`), Cuenta (`/cuenta`), Cuenta de barbero (`/soy-barbero`).
- `src/data/barbers.ts`: datos de ejemplo; cámbialos por tu API.
- `src/state/AppState.tsx`: tema y citas, guardados en `localStorage`.

## Pendiente

- Precios reales por servicio (hoy se muestran como `$[PRECIO]`).
- Fotos reales (`avatar`, `cover` y `photo` de cada servicio).
- Backend: barberos, disponibilidad, citas, cobro de la suscripción y `[TÉRMINOS DE COBRO Y CANCELACIÓN]`.
