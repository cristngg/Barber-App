# Filo

App móvil para que los barberos muestren su trabajo y los clientes aparten su puesto.
Construida sobre el sistema de diseño **Filo** (tinta, hueso y latón; variante clara).

## Correr

Necesita Node 22.13 o más nuevo (usa la base SQLite que trae Node).

```bash
npm install
cp .env.example .env   # trae el ID de cliente de Google de Filo

# Desarrollo: dos terminales
npm run dev:server   # API en http://localhost:3001 (con "Entrar de prueba" activado)
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
| `GOOGLE_CLIENT_ID` | (vacío) | ID de cliente OAuth de Google. Sin él, nadie puede entrar con Google. |
| `ROUTING_URL` | `https://routing.openstreetmap.de` | Servicio de rutas compatible con OSRM para "Cómo llegar". El de OpenStreetMap (FOSSGIS) es gratis y de uso moderado; con mucho tráfico, usa tu propio OSRM o un proveedor. |
| `BILLING_PROVIDER` | `test` (desarrollo) / `off` (producción) | Cobro de la cuenta de barbero. `test`: pago simulado, no cobra (no se permite en producción). `off`: sin cobro, todas las cuentas son públicas. |
| `TRUST_PROXY` | `0` | Con `1`, usa la IP real del cliente cuando el servidor está detrás de un proxy (Nginx, Cloudflare, el del hosting). Hace falta para que el límite de intentos de contraseña funcione bien. |
| `DEV_LOGIN` | `0` | Con `1`, muestra "Entrar de prueba" (entrar con un nombre, sin Google). Solo para desarrollo: el servidor no arranca si está activo con `NODE_ENV=production`. |

### Configurar "Continuar con Google"

1. Entra a [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto (o usa uno) y abre **APIs y servicios → Pantalla de consentimiento de OAuth**. Elige "Externo" y pon el nombre de la app (Filo), tu correo de soporte y el logo si quieres.
2. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, elige **Aplicación web**.
3. En **Orígenes de JavaScript autorizados** agrega cada dirección desde donde se abre la app: `http://localhost`, `http://localhost:5173`, `http://localhost:3001` y tu dominio de producción (`https://tu-dominio.com`). Google pide `http://localhost` sin puerto además de cada puerto. No hace falta ninguna URI de redireccionamiento. Los cambios pueden tardar unos minutos en aplicarse.
4. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) en `GOOGLE_CLIENT_ID` dentro de `.env`. El servidor lee `.env` al arrancar; una variable del sistema con el mismo nombre tiene prioridad.

Mientras la pantalla de consentimiento esté "en prueba", solo entran los correos que agregues como usuarios de prueba; publícala para abrirla a todos.

## Hospedar

Cualquier servicio que corra Docker con un **volumen persistente** montado en `/data` (Railway, Fly.io, Render con disco, un VPS):

```bash
docker build -t filo .
docker run -p 3001:3001 -v filo-data:/data -e GOOGLE_CLIENT_ID=... filo
```

Sin volumen persistente, cada reinicio borra los perfiles, las fotos y las citas.

## Estructura

- `src/styles/tokens.css`: tokens del sistema (color, tipografía, espacio, esquinas) para el tema oscuro y el claro (`data-theme`).
- `src/components/`: Button, Chip, SearchField/TextField, StatusTag, BarberCard, BottomNav, AppointmentRow, Photo, Rating, Icon.
- `src/screens/`, cliente: Explorar (`/`), Cortes (`/cortes`), Perfil (`/barbero/:id`), Apartar cita (`/barbero/:id/reservar`), Mis citas (`/citas`), Cuenta (`/cuenta`).
- `src/screens/`, barbero: Cuenta de barbero (`/soy-barbero`), Portafolio (`/mi-perfil`), Editar perfil (`/mi-perfil/editar`), Editar corte (`/mi-perfil/corte/:id`, `nuevo` para agregar), Horario (`/mi-perfil/horario`), Agenda (`/agenda`).
- `src/data/barbers.ts`: barberos de ejemplo; cámbialos por tu API.
- `src/state/api.ts`: cliente de la API. `src/state/AppState.tsx`: barberos, mi perfil y mis citas, cargados del servidor; tema y modo quedan en el teléfono.
- `src/state/photos.ts`: las fotos se reducen en el teléfono y se suben al servidor.
- `server/`: API (Express), base SQLite (`db.ts`) y pruebas (`app.test.ts`).

## Servidor

- **Entrada:** sin sesión, lo primero que se ve es la pantalla de entrada (`src/screens/Entrar.tsx`): "Continuar con Google" o correo y contraseña ("Entrar" / "Crear cuenta").
- **Correo y contraseña:** contraseñas de al menos 8 caracteres, guardadas con `scrypt` (`server/passwords.ts`); nunca se guarda la contraseña. Tras 8 intentos fallidos en 15 minutos para un mismo correo e IP, se bloquea un rato. Un correo es una sola cuenta: si alguien creó su cuenta con contraseña y luego entra con Google con ese mismo correo (verificado por Google), las dos formas quedan unidas.
- **Identidad con Google:** La app recibe una credencial de Google, el servidor la verifica con `google-auth-library` y entrega un token de sesión propio (se guarda solo su hash). La cuenta de barbero y las citas quedan ligadas a la cuenta de Google, así que se recuperan desde cualquier teléfono. Una sesión sin uso en 180 días vence; "Cerrar sesión" la borra del servidor.
- **Mapa:** Leaflet con mosaicos de OpenStreetMap (gratis, sin clave; `src/components/Map.tsx`). Cada barbero marca dónde atiende en "Editar perfil" (tocando el mapa, arrastrando el pin o con "Estoy aquí"). El cliente comparte su ubicación desde el navegador (solo se pide tras un toque) y las distancias se calculan en el teléfono.
- **Cómo llegar** (`src/screens/Ruta.tsx`): mapa a pantalla completa con la ruta dibujada desde tu ubicación hasta la barbería, como en una app de viajes, y una hoja con tiempo y distancia aproximados, "En carro" / "A pie", "Apartar cita" y "Google Maps" para la navegación paso a paso. La ruta se pide a `GET /api/route`, que la calcula con OSRM (`ROUTING_URL`), la guarda 10 minutos en caché y limita a 30 rutas por minuto por persona. Para trazarla, la ubicación del cliente pasa por el servidor y el servicio de rutas; no se guarda. Si te alejas más de 200 m del punto de partida, se vuelve a trazar. OpenStreetMap pide la atribución visible y un uso moderado: con mucho tráfico, cambia `TILE_URL` por un proveedor de mosaicos.
- **Cortes** (`src/screens/Cortes.tsx`): muro con las fotos de los cortes de todos los barberos. Se busca por palabra o se filtra por tipo, y carga más al bajar (12 por página, `GET /api/cuts`). La búsqueda (`server/search.ts`) ignora acentos y mayúsculas, trata "z" como "s" ("alizado" = "alisado") y entiende sinónimos ("pintado", "mechas" o "rayitos" = Tinte; "braids" o "cornrows" = Trenzas; "keratina" = Alisado). Con la ubicación del cliente, los más cercanos van primero. Tocar un corte abre el perfil del barbero con ese corte resaltado y ya elegido al apartar. Cada corte lleva un **tipo** que el barbero elige al subirlo (Fade, Barba, Diseños, Trenzas, Alisado, Tinte, Niños, Clásico, Navaja). Filtra en memoria: va bien hasta unos miles de cortes.
- **Píldoras de búsqueda por zona** (`server/trending.ts`, `src/state/trending.ts`): las píldoras de Explorar y Cortes muestran lo que más busca la gente a menos de 50 km en los últimos 30 días, con la palabra que usan ahí ("Rayitos" en un lugar, "Mechas" en otro; las dos filtran Tinte). Un tipo sale una sola vez, con su palabra más buscada; después van los tipos fijos. Una búsqueda se anota cuando la persona deja de escribir 1.5 s (`POST /api/searches`), solo si encuentra algún corte, una vez al día por persona y palabra. Una palabra solo se vuelve píldora si la buscaron 3 personas distintas o más. Se guarda la ubicación redondeada a ~1 km; las búsquedas de más de 30 días se borran. Sin datos de la zona, se usan los de todas partes.
- **Horario real** (`server/schedule.ts`, `src/screens/Horario.tsx`): cada barbero pone sus horas de cada día (o lo cierra) y sus días libres. Cada corte dice cuánto dura (de 15 min a 6 h). Al apartar, la app ofrece horas cada 30 min que caben enteras en el horario y no se cruzan con otras citas; las citas guardan inicio y duración. "Abierto ahora" y "Libre hoy" se calculan solos con el horario y las citas del día.
- **Reseñas** (`server/reviews.ts`, `src/components/Reviews.tsx`): quien tuvo la cita la puede calificar (1 a 5 estrellas y un texto opcional) cuando terminó y hasta 30 días después, desde "Mis citas → Pasadas". Una reseña por cita, que se puede corregir. Sale con el nombre corto ("Ana P."). El barbero responde desde su portafolio. Las estrellas del perfil son el promedio real; sin reseñas, dice "Nuevo".
- **Cobro de la cuenta de barbero** (`server/billing.ts`, `src/state/billing.ts`): $3.99 por 30 días. Una cuenta nueva queda *pendiente* y su perfil no sale en el mapa, la búsqueda ni recibe citas hasta pagar. Cada pago suma 30 días (desde hoy o desde el fin de lo ya pagado). Si no renueva, 5 días de gracia y luego *vence*. Si cancela, sigue visible hasta el fin de lo pagado. El portafolio avisa qué falta y Cuenta muestra la suscripción con "Cancelar" o "Pagar/Reactivar". Las cuentas creadas antes del cobro quedan activas 30 días.
  - **Proveedor:** hoy solo existe el de prueba (`/pago-prueba/:id`, "Pagar" o "Simular pago rechazado", sin cobrar). Para conectar PayPal u otro, escribe un `BillingProvider` en `server/billing.ts` con `checkout` (devuelve la URL de pago), `cancel` y `parseWebhook` (verifica la firma y devuelve eventos `paid`, `failed`, `canceled`), y elígelo con `BILLING_PROVIDER`. El aviso del proveedor llega a `POST /api/billing/webhook`; aplicar un pago es idempotente.
- **Citas:** el servidor valida que el barbero atienda ese día y a esa hora, que no haya pasado y que no se cruce con otra cita; revisa y guarda en una sola transacción. Cancelar libera el espacio.
- **Fotos:** solo se aceptan JPEG, PNG o WebP de hasta 6 MB, y cada quien solo puede usar las fotos que subió. Al reemplazar o quitar una foto, el servidor la borra.

## Modo barbero

Al crear la cuenta de barbero, la persona entra a su portafolio. Desde ahí puede:

- Editar foto de portada, foto de perfil, nombre, barrio, descripción, especialidades, días que atiende y si está libre hoy.
- Subir cortes con foto, nombre y precio. Cada corte es también un servicio que el cliente puede apartar.
- Ver su perfil como lo ve un cliente, y confirmar o cancelar citas en su agenda.

En Cuenta se cambia entre usar Filo como cliente o como barbero.

## Pendiente

- Recuperar contraseña ("¿Olvidaste tu contraseña?") y confirmar el correo: necesitan un servicio para enviar correos.
- Más formas de entrar (teléfono, Apple).
- Conectar un proveedor de pago real (PayPal, etc.) y los `[TÉRMINOS DE COBRO Y CANCELACIÓN]`.
- Límite de solicitudes por IP antes de abrirlo al público.
- Los barberos de ejemplo siguen con `$[PRECIO]` y sin fotos; se apagan con `SEED_DEMO=0`.
