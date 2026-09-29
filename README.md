# AMI-FieldWorkManager

Gestión de operaciones de campo: solicitudes, órdenes de trabajo, equipos,
vehículos, cuadrillas, planificación de rutas y reportes.

> **Migración en curso.** La aplicación se está migrando de Firebase a
> **Django + PostgreSQL/PostGIS**, autoalojada en un VPS. El frontend en
> `frontend/` todavía usa Firebase hasta completar la fase 3.

## Estructura del repositorio

```
backend/          API y gestión de usuarios (Django 5.2 LTS, Django Ninja, allauth)
frontend/         Interfaz web (Next.js)
deploy/Caddyfile  Reverse proxy con HTTPS automático
compose.yaml      Stack de producción para el VPS
compose.dev.yaml  PostgreSQL/PostGIS y Redis para desarrollo local
legacy/firebase/  Configuración de Firebase (referencia durante la migración)
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

Endpoints disponibles:

- `GET /api/health`: estado del servicio.
- `GET /api/csrf`: fija la cookie `csrftoken`.
- `GET /api/accounts/me`: perfil, roles y habilidades del usuario autenticado.
- `/api/auth/browser/v1/…`: login, logout, sesión y reseteo de contraseña
  ([allauth headless](https://docs.allauth.org/en/latest/headless/openapi-specification/)).
- `/api/docs`: documentación OpenAPI interactiva (solo usuarios con acceso al admin).
- `/admin/`: panel de administración de Django.

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

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev                              # http://localhost:3000
```

## Despliegue en el VPS

1. Instalar Docker y el plugin de Compose. Abrir solo los puertos 22, 80 y 443.
2. Apuntar el DNS del dominio a la IP del VPS.
3. Clonar el repositorio y crear `.env` a partir de `.env.example`.
4. `docker compose up -d --build`
5. Crear el primer administrador:
   `docker compose exec backend python manage.py createsuperuser`

Caddy obtiene el certificado HTTPS automáticamente. Las migraciones, los roles y
los archivos estáticos se aplican al arrancar el contenedor `backend`.

## Plan de migración

- [x] **Fase 1: base.** Monorepo, proyecto Django, modelos en PostgreSQL/PostGIS,
      admin, autenticación (allauth headless), roles, Docker Compose, Caddy y CI.
- [ ] **Fase 2: API.** Endpoints por módulo con Django Ninja y permisos por objeto.
- [ ] **Fase 3: frontend.** Next.js 16, React 19, Tailwind 4, shadcn/ui actual,
      TanStack Query con un cliente generado desde OpenAPI; eliminar Firebase.
- [ ] **Fase 4: mapas y rutas autoalojados.** MapLibre GL, teselas propias,
      OSRM/Valhalla y optimización de rutas con OR-Tools.
- [ ] **Fase 5: reportes.** Agregaciones SQL, PDF con WeasyPrint, Excel con openpyxl.
- [ ] **Fase 6: migración de datos** desde Firestore y puesta en producción.
