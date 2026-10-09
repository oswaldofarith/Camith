"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { layers, namedFlavor } from "@protomaps/basemaps";
import { useQuery } from "@tanstack/react-query";
import { addProtocol, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { useTheme } from "next-themes";
import { Protocol } from "pmtiles";
import { forwardRef, useMemo } from "react";
import Map, { type MapRef, NavigationControl, ScaleControl } from "react-map-gl/maplibre";

/** Archivos servidos por Caddy (ver deploy/mapas/preparar.sh). */
const ARCHIVO = "/mapas/guayaquil.pmtiles";
const ATRIBUCION =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

// Guayaquil, Durán, Samborondón, Vía a la Costa y General Villamil Playas.
export const CENTRO_POR_DEFECTO = { latitude: -2.19, longitude: -79.9, zoom: 11 };
const LIMITES: [number, number, number, number] = [-80.75, -2.95, -79.5, -1.8]; // oeste, sur, este, norte

let protocoloRegistrado = false;
function registrarProtocolo() {
  if (!protocoloRegistrado) {
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); // ver scripts/copiar-maplibre-worker.mjs
    addProtocol("pmtiles", new Protocol().tile);
    protocoloRegistrado = true;
  }
}

/** ¿Está instalado el mapa base? En desarrollo normalmente no lo está. */
function useMapaBaseDisponible() {
  return useQuery({
    queryKey: ["mapa-base"],
    queryFn: async () => (await fetch(ARCHIVO, { method: "HEAD" })).ok,
    staleTime: Infinity,
    retry: false,
  });
}

function estilo(oscuro: boolean, conMapaBase: boolean): StyleSpecification {
  if (!conMapaBase) {
    return {
      version: 8,
      sources: {},
      layers: [{ id: "fondo", type: "background", paint: { "background-color": oscuro ? "#20242b" : "#eef1f4" } }],
    };
  }
  const origen = window.location.origin;
  const sabor = oscuro ? "dark" : "light";
  return {
    version: 8,
    glyphs: `${origen}/mapas/assets/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origen}/mapas/assets/sprites/v4/${sabor}`,
    sources: {
      protomaps: { type: "vector", url: `pmtiles://${origen}${ARCHIVO}`, attribution: ATRIBUCION },
    },
    layers: layers("protomaps", namedFlavor(sabor), { lang: "es" }),
  };
}

type Props = React.ComponentProps<typeof Map> & { className?: string };

/** Mapa MapLibre con el mapa base autoalojado; los hijos son capas y marcadores. */
const MapaBase = forwardRef<MapRef, Props>(function MapaBase({ className, children, ...props }, ref) {
  registrarProtocolo();
  const { resolvedTheme } = useTheme();
  const disponible = useMapaBaseDisponible();
  const oscuro = resolvedTheme === "dark";
  const estiloMapa = useMemo(() => estilo(oscuro, !!disponible.data), [oscuro, disponible.data]);

  return (
    <div className={`relative overflow-hidden rounded-md border ${className ?? "h-96"}`}>
      {!disponible.isPending && (
        <Map
          ref={ref}
          initialViewState={CENTRO_POR_DEFECTO}
          maxBounds={LIMITES}
          mapStyle={estiloMapa}
          attributionControl={{ compact: true }}
          style={{ width: "100%", height: "100%" }}
          {...props}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <ScaleControl position="bottom-left" unit="metric" />
          {children}
        </Map>
      )}
      {disponible.data === false && (
        <p className="bg-background/90 text-muted-foreground absolute top-2 left-2 rounded-md border px-2 py-1 text-xs">
          Mapa base no instalado (ejecuta <code>deploy/mapas/preparar.sh</code> en el servidor).
        </p>
      )}
    </div>
  );
});

export default MapaBase;
