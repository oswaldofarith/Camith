# AMI-FieldWorkManager

Gestión de operaciones de campo: solicitudes, órdenes de trabajo, equipos,
vehículos, cuadrillas, planificación de rutas y reportes.

La aplicación funciona sobre **Django + PostgreSQL/PostGIS**, con mapas y rutas
autoalojados, desplegada en Coolify. Los datos se migraron desde la versión
anterior en Firebase, que queda solo como referencia en `legacy/firebase/`.

## Estructura del repositorio

```
backend/          API y gestión de usuarios (Django 5.2 LTS, Django Ninja, allauth)
frontend/         Interfaz web (Next.js 16, React 19, Tailwind 4, TanStack Query)
deploy/Caddyfile  Reverse proxy con HTTPS automático
compose.yaml      Stack de producción para un VPS con Docker (Caddy con HTTPS propio)
compose.coolify.yaml  El mismo stack para Coolify (su proxy pone el HTTPS)
compose.dev.yaml  PostgreSQL/PostGIS y Redis para desarrollo local
legacy/firebase/  Reglas de Firestore (referencia) y exportador de datos para la fase 6
```

## Arquitectura

```
            Caddy (HTTPS automático)
   /api, /admin, /static     /media (requiere sesión)      resto
          │                        │                          │
   Django + Gunicorn  ◄── forward_auth ──┘               Next.js (standalone)
          │
   PostgreSQL 17 + PostGIS · Redis · Celery (worker + beat)
```

Frontend y API comparten dominio: la autenticación usa la **cookie de sesión de
Django con CSRF**, sin JWT ni CORS.

### Backend (`backend/`)

| App | Contenido |
|---|---|
| `accounts` | Usuario con login por email, habilidades, historial de estado. Los roles (`administrador`, `supervisor`, `ingenieroDeOficina`, `tecnicoDeCampo`) son grupos de Django |
| `catalogs` | Marcas, zonas, tipos de equipo y de trabajo, estados, urgencias, localidades y la configuración general (singleton) |
| `assets` | Vehículos y equipos (ubicación como `PointField` de PostGIS) |
| `operations` | Solicitudes, unidades de campo, órdenes de trabajo, trabajos, fotos y planes de mantenimiento |
| `notifications` | Notificaciones por usuario |
| `core` | IDs legibles secuenciales (`SOL-20260929-001`, `OT-…`), utilidades comunes |

### API

Documentación interactiva completa en `/api/docs` (solo usuarios con acceso al
admin). Todas las rutas exigen sesión salvo `health` y `csrf`; las que
modifican datos exigen además el encabezado `X-CSRFToken`.

| Módulo | Rutas |
|---|---|
| Sistema | `GET /api/health`, `GET /api/csrf` |
| Autenticación | `/api/auth/browser/v1/…`: login, logout, sesión, recuperar y cambiar contraseña ([allauth headless](https://docs.allauth.org/en/latest/headless/openapi-specification/)) |
| Mi perfil | `GET/PATCH /api/accounts/me`, `POST /api/accounts/me/foto` |
| Usuarios | `/api/accounts/usuarios` (CRUD), `…/{id}/estado` (activar o desactivar con motivo), `…/{id}/password-temporal`, `GET /api/accounts/skills` |
| Catálogos | `GET /api/catalogos` (todo en una respuesta), `/api/catalogos/{marcas\|zonas\|tipos-equipo\|…}`, `…/tipos-trabajo`, `…/localidades`, `PUT …/configuracion` |
| Vehículos | `/api/vehiculos` (CRUD por código) |
| Equipos | `/api/equipos` (CRUD por código; filtros por catálogo, texto, cercanía `cerca_lat/cerca_lng/radio_m` y `bbox`), `GET /api/equipos/mapa` (GeoJSON), `POST /api/equipos/lote` (importación) |
| Solicitudes | `/api/solicitudes` (CRUD y filtros), `…/{id}/cancelar` |
| Unidades de campo | `GET/PUT /api/unidades-campo` |
| Órdenes de trabajo | `/api/ordenes` (crear varias a la vez, listar, detalle, borrar) |
| Trabajos | `GET /api/trabajos/mios`, `…/{id}/reportar` (técnico), `…/{id}/revisar` (ingeniero/supervisor), `…/{id}/cancelar`, `…/{id}/fotos` |
| Mantenimiento | `/api/planes-mantenimiento` (CRUD), `…/previsualizar` y `…/generar` (planificador de reglas fijas), `…/{id}/generar-solicitudes` (crea el tipo de trabajo “Mantenimiento preventivo” si falta) |
| Notificaciones | `GET /api/notificaciones`, `…/conteo`, `…/{id}/leer`, `…/leer-todas` |
| Dashboard | `GET /api/dashboard/kpis`, `GET /api/dashboard/tendencias` |
| Planificación | `POST /api/planificacion/optimizar` (OR-Tools; tiempos de OSRM o estimados si no está), `GET /api/planificacion/rutas-del-dia` (rutas con geometría para el dashboard y el NOC) |
| Admin | `/admin/`: panel de administración de Django |

La lógica de negocio (estados de trabajos, sincronización con la solicitud,
conteo de revisiones del equipo y notificaciones) está en
`backend/apps/*/services.py` y se ejecuta en una transacción.

El planificador de mantenimiento (`backend/apps/operations/planificador.py`) no
usa IA: toma los equipos activos que no cumplen ninguna exclusión, prioriza los
nunca revisados, luego la revisión más antigua, la fabricación más antigua y el
mayor número de revisiones, y los reparte por igual entre los días hábiles del
plazo. Cada mantenimiento indica su motivo concreto.

Los permisos de cada rol están en `backend/apps/accounts/roles.py` y se aplican
con `python manage.py sync_roles` (idempotente; el contenedor lo ejecuta al
arrancar).

## Desarrollo local

Requisitos: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 22, Docker y
las librerías GDAL/GEOS (`apt install gdal-bin` o `brew install gdal`).

```bash
# Base de datos y Redis
docker compose -f compose.dev.yaml up -d

# Backend
cd backend
cp .env.example .env
uv sync
uv run python manage.py migrate
uv run python manage.py sync_roles
uv run python manage.py createsuperuser
uv run python manage.py runserver        # http://localhost:8000/admin/

# Tests y lint
uv run pytest
uv run ruff check . && uv run ruff format --check .

# Frontend (en otra terminal). Next reenvía /api y /media a Django.
cd frontend
npm install
npm run dev                              # http://localhost:3000

# Si cambia la API: regenerar el esquema y los tipos del frontend
cd backend && uv run python manage.py export_openapi_schema --api config.api.api --output openapi.json --indent 2
cd frontend && npm run api:types
```

## Despliegue en un VPS con Docker (sin Coolify)

1. Instalar Docker y el plugin de Compose. Abrir solo los puertos 22, 80 y 443.
2. Apuntar el DNS del dominio a la IP del VPS.
3. Clonar el repositorio y crear `.env` a partir de `.env.example`.
4. `docker compose up -d --build`
5. Crear el primer administrador:
   `docker compose exec backend python manage.py createsuperuser`

Caddy obtiene el certificado HTTPS automáticamente. Las migraciones, los roles y
los archivos estáticos se aplican al arrancar el contenedor `backend`.

### Mapas y rutas (Guayaquil y General Villamil Playas)

El mapa base (PMTiles de Protomaps) y el motor de rutas (OSRM) se sirven desde el
propio VPS; no se usa ningún servicio externo. Se preparan una sola vez (y cuando
se quiera actualizar la cartografía):

```bash
sudo apt install osmium-tool curl       # además de Docker
./deploy/mapas/preparar.sh              # descarga OSM de Ecuador, recorta el área,
                                        # procesa OSRM y extrae las teselas
docker compose --profile mapas up -d    # arranca el servicio osrm
```

- Los datos quedan en `deploy/mapas/datos/` (ignorado por git). Caddy sirve el
  mapa base en `/mapas/`; el backend consulta OSRM en `http://osrm:5000`.
- El área (`BBOX` en el script) cubre Guayaquil, Durán, la vía a la Costa y
  Playas. Procesarla usa ~1,5 GB de RAM durante unos minutos; en marcha OSRM
  ocupa ~300 MB, así que 4 GB de RAM alcanzan para toda la aplicación.
- Sin estos datos la app sigue funcionando: el mapa muestra un fondo liso con un
  aviso y el optimizador usa tiempos estimados por distancia (lo indica en el
  tablero).
- La pantalla para el monitor de operaciones está en `/noc`.

## Despliegue en Coolify

`compose.coolify.yaml` es el mismo stack adaptado a Coolify 4: Traefik (el
proxy de Coolify) termina el HTTPS y entrega todo al servicio `web` (Caddy), que
reparte entre Django y Next.js como en `compose.yaml`. No publica puertos, así
que convive con los demás servicios del servidor.

1. **Crear el recurso:** proyecto → **+ New** → el repositorio (GitHub App o
   deploy key) → rama a desplegar → build pack **Docker Compose**.
   - Base Directory: `/`
   - Docker Compose Location: `/compose.coolify.yaml`
2. **Dominio:** en el servicio **web**, campo **Domains**:
   `https://camith.tudominio.com` (un solo dominio, con `https`). Apuntar antes
   el DNS a la IP del servidor. El resto de servicios no lleva dominio.
3. **Variables** (Environment Variables). Coolify genera solas la clave de
   Django (`SERVICE_BASE64_64_DJANGO`), la contraseña de PostgreSQL
   (`SERVICE_PASSWORD_POSTGRES`) y la URL pública (`SERVICE_URL_WEB`,
   `SERVICE_FQDN_WEB`, sacadas del dominio del paso 2). Hay que completar:

   | Variable | Obligatoria | Ejemplo |
   | :-- | :-- | :-- |
   | `EMAIL_HOST` | sí | `smtp.tuproveedor.com` |
   | `DEFAULT_FROM_EMAIL` | sí | `AMI-FieldWorkManager <no-reply@tudominio.com>` |
   | `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | según el SMTP | |
   | `EMAIL_PORT`, `EMAIL_USE_TLS` | no (`587`, `true`) | |
   | `POSTGRES_DB`, `POSTGRES_USER`, `TIME_ZONE` | no | |

   El correo es imprescindible: los usuarios migrados entran con “¿Olvidaste tu
   contraseña?”. No cambiar `SERVICE_PASSWORD_POSTGRES` después del primer
   despliegue (la base ya se creó con ella).
4. **Deploy.** El primer build tarda unos minutos. Todos los servicios quedan
   *healthy* salvo `worker`, `beat` y `osrm`, que no tienen healthcheck.
   Migraciones, roles y estáticos se aplican al arrancar `backend`.
5. **Mapas y rutas** (opcional; sin ellos la app funciona con fondo liso y
   tiempos estimados). Por SSH en el servidor, con el repositorio clonado en
   cualquier carpeta:
   ```bash
   sudo apt install osmium-tool curl
   sudo DATOS=/data/camith/mapas ./deploy/mapas/preparar.sh
   ```
   Luego, en Coolify, reiniciar los servicios `osrm` y `web` (o redesplegar).
   La carpeta `/data/camith/mapas` está fija en `compose.coolify.yaml`.

Para comandos dentro de los contenedores, Coolify ofrece **Terminal** en la
aplicación. Por SSH, los contenedores se llaman `<servicio>-<uuid>`, donde
`<uuid>` es el identificador de la aplicación (aparece en su URL de Coolify);
filtrar por él evita confundirlos con los de otras aplicaciones del servidor:

```bash
UUID=<uuid-de-la-aplicación>
B=$(docker ps -q -f name=backend-$UUID)
docker exec -it $B python manage.py createsuperuser   # si no se importan datos
```

La base de datos va dentro del stack (volumen `pgdata`), así que las copias de
seguridad programadas de Coolify para bases de datos no la cubren. Una copia
diaria por cron en el servidor:

```bash
DB=$(docker ps -q -f name=db-$UUID)
docker exec $DB pg_dump -U camith -Fc camith > /root/backups/camith-$(date +%F).dump
```

## Migración de datos desde Firebase

1. Exportar Firestore y las cuentas de Auth (desde `legacy/firebase/export/`,
   con `serviceAccountKey.json` en esa carpeta o su contenido en base64 en la
   variable `FIREBASE_SERVICE_ACCOUNT_B64`):
   `npm install && npm run exportar` (genera `firestore-export/` en la raíz)
2. Copiar `firestore-export/` al VPS, probar con `--simular` y luego importar:
   ```bash
   docker compose cp firestore-export backend:/tmp/firestore-export
   docker compose exec -e ADMIN_TEMP_PASSWORD='<temporal>' backend \
     python manage.py importar_datos --dir /tmp/firestore-export \
     --admin-email <email-admin> --simular
   # revisar los avisos y repetir sin --simular
   ```
   En Coolify, por SSH en el servidor (copiar antes la carpeta con `scp`):
   ```bash
   B=$(docker ps -q -f name=backend-<uuid-de-la-aplicación>)
   docker cp firestore-export $B:/tmp/firestore-export
   docker exec -e ADMIN_TEMP_PASSWORD='<temporal>' $B \
     python manage.py importar_datos --dir /tmp/firestore-export \
     --admin-email <email-admin> --simular
   ```

`importar_datos` importa usuarios, configuración y catálogos, vehículos, equipos
(con su historial), unidades de campo, solicitudes, órdenes con sus trabajos,
planes de mantenimiento, notificaciones y las fotos de Firebase Storage.

- Se conservan los códigos de equipos y vehículos y los `displayId` de
  solicitudes, órdenes y trabajos.
- Los catálogos se emparejan sin distinguir mayúsculas ni tildes («Urgente» =
  `urgente`); los valores que no existan se crean y se avisan.
- Equipos sin coordenadas quedan en la sede con el campo adicional
  `ubicacion_pendiente`; las IP inválidas se guardan en `ip_original`.
- Lo que apunte a usuarios que ya no existen queda a nombre de «Usuario no
  migrado» (`desconocido@migracion.invalid`, inactivo).
- Es idempotente: lo ya importado no se toca, así que se puede repetir.
  `--sin-fotos` omite la descarga de fotos.

Política de contraseñas:
- **No se envía ningún correo.** Los usuarios importados quedan sin contraseña
  usable y cada uno la define con “¿Olvidaste tu contraseña?”. Ese flujo sí
  envía un correo con el enlace, así que el SMTP (`EMAIL_*` en `.env`) debe estar
  configurado.
- Solo el administrador indicado recibe la contraseña temporal. Queda marcado
  con `debe_cambiar_password`, que desaparece al cambiarla.
- Reimportar no pisa contraseñas ya elegidas.

## Plan de migración (completado)

- [x] **Fase 1: base.** Monorepo, proyecto Django, modelos en PostgreSQL/PostGIS,
      admin, autenticación (allauth headless), roles, Docker Compose, Caddy y CI.
- [x] **Fase 2: API.** Endpoints por módulo con Django Ninja y permisos por objeto.
- [x] **Fase 3: frontend.** Next.js 16, React 19, Tailwind 4, shadcn/ui actual,
      TanStack Query con un cliente generado desde OpenAPI; sin Firebase.
- [x] **Fase 4: mapas y rutas autoalojados.** MapLibre GL, teselas PMTiles propias,
      OSRM y optimización de rutas con OR-Tools; tablero de
      planificación, mapa del dashboard y pantalla NOC.
- [x] **Fase 5: reportes.** Agregaciones SQL en `/api/reportes`, gráficos con
      Recharts 3 y exportación a Excel; la OT se imprime o guarda como PDF desde
      el navegador.
- [x] **Fase 6: migración de datos y puesta en producción.** Importación de
      Firestore con `importar_datos` y despliegue en Coolify
      (`compose.coolify.yaml`).
