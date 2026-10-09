# Caddy con la configuración incluida, para Coolify: así no depende de montar
# archivos del repositorio en el servidor.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
