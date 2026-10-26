# Filo

App móvil para que los barberos muestren su trabajo y los clientes aparten su puesto.
Construida sobre el sistema de diseño **Filo** (tinta, hueso y latón; variante clara).

## Correr

Necesita Node 22.13 o más nuevo (usa la base SQLite que trae Node).

```bash
npm install

# Desarrollo: dos terminales
npm run dev:server   # API en http://localhost:3001
npm run dev          # app en http://localhost:5173 (pasa /api y /uploads al servidor)

# Producción: un solo proceso sirve la API, las fotos y la app
npm run build
npm start            # http://localhost:3001

npm test             # pruebas de la API
```

### Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `PORT` | `3001` | Puerto del servidor |
| `DATA_DIR` | `./data` | Carpeta de la base (`filo.db`) y las fotos (`uploads/`). En producción debe ser un disco persistente. |
| `BUSINESS_TZ` | `America/Panama` | Zona horaria que define qué es "hoy" y qué horas ya pasaron |
| `SEED_DEMO` | `1` | Con `0`, no crea los 3 barberos de ejemplo en una base vacía |

## Hospedar

Cualquier servicio que corra Docker con un **volumen persistente** montado en `/data` (Railway, Fly.io, Render con disco, un VPS):

```bash
docker build -t filo .
docker run -p 3001:3001 -v filo-data:/data filo
```

Sin volumen persistente, cada reinicio borra los perfiles, las fotos y las citas.

## Estructura

- `src/styles/tokens.css`: tokens del sistema (color, tipografía, espacio, esquinas) para el tema oscuro y el claro (`data-theme`).
- `src/components/`: Button, Chip, SearchField/TextField, StatusTag, BarberCard, BottomNav, AppointmentRow, Photo, Rating, Icon.
- `src/screens/`, cliente: Explorar (`/`), Perfil (`/barbero/:id`), Apartar cita (`/barbero/:id/reservar`), Mis citas (`/citas`), Cuenta (`/cuenta`).
- `src/screens/`, barbero: Cuenta de barbero (`/soy-barbero`), Portafolio (`/mi-perfil`), Editar perfil (`/mi-perfil/editar`), Editar corte (`/mi-perfil/corte/:id`, `nuevo` para agregar), Agenda (`/agenda`).
- `src/data/barbers.ts`: barberos de ejemplo; cámbialos por tu API.
- `src/state/api.ts`: cliente de la API. `src/state/AppState.tsx`: barberos, mi perfil y mis citas, cargados del servidor; tema y modo quedan en el teléfono.
- `src/state/photos.ts`: las fotos se reducen en el teléfono y se suben al servidor.
- `server/`: API (Express), base SQLite (`db.ts`) y pruebas (`app.test.ts`).

## Servidor

- **Identidad:** cada teléfono pide un token anónimo (`POST /api/session`) y lo guarda. Ese token es la llave de su perfil de barbero y de sus citas. Si se borran los datos del navegador, se pierde el acceso: falta un inicio de sesión real (teléfono o correo).
- **Citas:** el servidor valida que el barbero atienda ese día, que la hora no haya pasado y que nadie la haya tomado (una hora solo se aparta una vez; cancelar la libera).
- **Fotos:** solo se aceptan JPEG, PNG o WebP de hasta 6 MB, y cada quien solo puede usar las fotos que subió. Al reemplazar o quitar una foto, el servidor la borra.

## Modo barbero

Al crear la cuenta de barbero, la persona entra a su portafolio. Desde ahí puede:

- Editar foto de portada, foto de perfil, nombre, barrio, descripción, especialidades, días que atiende y si está libre hoy.
- Subir cortes con foto, nombre y precio. Cada corte es también un servicio que el cliente puede apartar.
- Ver su perfil como lo ve un cliente, y confirmar o cancelar citas en su agenda.

En Cuenta se cambia entre usar Filo como cliente o como barbero.

## Pendiente

- Inicio de sesión real (teléfono o correo) para no depender del token del navegador.
- Cobro de la suscripción y `[TÉRMINOS DE COBRO Y CANCELACIÓN]`.
- Distancia real (ubicación del cliente y del barbero); hoy los perfiles nuevos muestran solo el barrio.
- Límite de solicitudes por IP antes de abrirlo al público.
- Los barberos de ejemplo siguen con `$[PRECIO]` y sin fotos; se apagan con `SEED_DEMO=0`.
