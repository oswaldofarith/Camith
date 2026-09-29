#!/bin/sh
set -e

# Solo el contenedor web aplica migraciones y prepara estáticos; los workers
# de Celery arrancan con RUN_MIGRATIONS=0.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    python manage.py migrate --noinput
    python manage.py sync_roles
    python manage.py collectstatic --noinput --verbosity 0
fi

exec "$@"
