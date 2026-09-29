#!/usr/bin/env bash
# Descarga y prepara, en el VPS, los datos de mapas y rutas autoalojados:
#   - Motor de rutas OSRM con las calles de OpenStreetMap (Geofabrik).
#   - Mapa base en un único archivo PMTiles (Protomaps) + fuentes e iconos.
# Cubre Guayaquil, Durán, Samborondón, Vía a la Costa y General Villamil Playas.
#
# Uso:   ./deploy/mapas/preparar.sh          (≈ 10 min, ≈ 1 GB de disco temporal)
# Luego: docker compose --profile mapas up -d
# En Coolify: sudo DATOS=/data/camith/mapas ./deploy/mapas/preparar.sh y
#         reiniciar los servicios osrm y web.
# Repetir cada pocos meses para actualizar calles y mapa.
#
# Requisitos: docker, curl, osmium-tool (apt install osmium-tool).
set -euo pipefail

# oeste,sur,este,norte — ampliar aquí si se añaden zonas.
BBOX="${BBOX:--80.55,-2.80,-79.70,-1.95}"
OSRM_IMAGEN="${OSRM_IMAGEN:-ghcr.io/project-osrm/osrm-backend:v5.27.1}"
MAX_ZOOM="${MAX_ZOOM:-15}"

# DATOS cambia la carpeta de destino (en Coolify: la de MAPAS_DIR).
RAIZ="${DATOS:-$(cd "$(dirname "$0")" && pwd)/datos}"
TMP="$RAIZ/tmp"
OSRM="$RAIZ/osrm"
PUBLICO="$RAIZ/publico"   # lo sirve Caddy en /mapas/
mkdir -p "$TMP" "$OSRM" "$PUBLICO/assets"

command -v osmium >/dev/null || { echo "Falta osmium-tool: sudo apt install osmium-tool"; exit 1; }
command -v docker >/dev/null || { echo "Falta docker"; exit 1; }

echo "==> 1/4 Calles de Ecuador (OpenStreetMap, Geofabrik)"
curl -fL --retry 3 -o "$TMP/ecuador.osm.pbf" \
  https://download.geofabrik.de/south-america/ecuador-latest.osm.pbf

echo "==> 2/4 Recorte a la zona de servicio ($BBOX)"
osmium extract --bbox "$BBOX" --strategy smart --overwrite \
  -o "$OSRM/guayaquil.osm.pbf" "$TMP/ecuador.osm.pbf"

echo "==> 3/4 Preparación de OSRM (perfil de automóvil, algoritmo MLD)"
docker run --rm -v "$OSRM:/data" "$OSRM_IMAGEN" osrm-extract -p /opt/car.lua /data/guayaquil.osm.pbf
docker run --rm -v "$OSRM:/data" "$OSRM_IMAGEN" osrm-partition /data/guayaquil.osrm
docker run --rm -v "$OSRM:/data" "$OSRM_IMAGEN" osrm-customize /data/guayaquil.osrm

echo "==> 4/4 Mapa base (Protomaps) y recursos"
if ! command -v pmtiles >/dev/null; then
  url=$(curl -fsSL https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
    | grep -o 'https://[^"]*Linux_x86_64.tar.gz' | head -1)
  curl -fsSL "$url" | tar -xz -C "$TMP" pmtiles
  PMTILES="$TMP/pmtiles"
else
  PMTILES=pmtiles
fi
# Las compilaciones diarias se conservan unos días: se prueba desde ayer hacia atrás.
for dias in 1 2 3 4 5 6 7; do
  fecha=$(date -u -d "-$dias day" +%Y%m%d)
  if "$PMTILES" extract "https://build.protomaps.com/$fecha.pmtiles" "$PUBLICO/guayaquil.pmtiles" \
      --bbox="$BBOX" --maxzoom="$MAX_ZOOM"; then
    echo "    Mapa base del $fecha"
    break
  fi
done
[ -s "$PUBLICO/guayaquil.pmtiles" ] || { echo "No se pudo descargar el mapa base"; exit 1; }

curl -fsSL https://github.com/protomaps/basemaps-assets/archive/refs/heads/main.tar.gz \
  | tar -xz -C "$TMP"
rm -rf "$PUBLICO/assets/fonts" "$PUBLICO/assets/sprites"
cp -r "$TMP"/basemaps-assets-main/fonts "$TMP"/basemaps-assets-main/sprites "$PUBLICO/assets/"

rm -rf "$TMP"
echo
echo "Listo. Tamaños:"
du -sh "$OSRM" "$PUBLICO/guayaquil.pmtiles" "$PUBLICO/assets"
echo "Arranca el motor de rutas con: docker compose --profile mapas up -d"
echo "(en Coolify: reinicia los servicios osrm y web)"
