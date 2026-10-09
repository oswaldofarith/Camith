// MapLibre 6 carga su web worker (módulo ES) junto a su propio archivo; tras el
// empaquetado de Next esa ruta no existe, así que se publican en public/maplibre/
// y MapBase.tsx los indica con setWorkerUrl(). Se ejecuta antes de dev y build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const origen = path.dirname(require.resolve("maplibre-gl/package.json"));
const destino = path.join(import.meta.dirname, "..", "public", "maplibre");
mkdirSync(destino, { recursive: true });
for (const archivo of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(origen, "dist", archivo), path.join(destino, archivo));
}
