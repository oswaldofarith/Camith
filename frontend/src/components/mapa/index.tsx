"use client";

import dynamic from "next/dynamic";
import { Layer, Marker, Source } from "react-map-gl/maplibre";

import { Skeleton } from "@/components/ui/skeleton";

/** MapLibre solo funciona en el navegador: se carga sin renderizado en servidor. */
export const Mapa = dynamic(() => import("./MapaBase"), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});

export { CENTRO_POR_DEFECTO } from "./MapaBase";

/** Punto numerado (orden de visita) con el color de su estado. */
export function MarcadorParada({
  lat,
  lng,
  color,
  texto,
  titulo,
  onClick,
  resaltado,
}: {
  lat: number;
  lng: number;
  color: string;
  texto?: string | number;
  titulo: string;
  onClick?: () => void;
  resaltado?: boolean;
}) {
  return (
    <Marker latitude={lat} longitude={lng} anchor="center" onClick={(e) => { e.originalEvent.stopPropagation(); onClick?.(); }}>
      <button
        type="button"
        title={titulo}
        aria-label={titulo}
        className={`flex items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-md ${resaltado ? "size-7 ring-2 ring-black/40" : "size-6"}`}
        style={{ background: color }}
      >
        {texto}
      </button>
    </Marker>
  );
}

export function MarcadorSede({ lat, lng }: { lat: number; lng: number }) {
  return (
    <Marker latitude={lat} longitude={lng} anchor="bottom">
      <div title="Sede central" className="bg-primary text-primary-foreground rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow-md">
        Sede
      </div>
    </Marker>
  );
}

/** Trazado de una ruta ([[lng, lat], ...]) como línea de 2 px con borde claro. */
export function LineaRuta({ id, coordenadas, color }: { id: string; coordenadas: number[][]; color: string }) {
  if (coordenadas.length < 2) return null;
  return (
    <Source id={`ruta-${id}`} type="geojson" data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coordenadas } }}>
      <Layer id={`ruta-${id}-borde`} type="line" paint={{ "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.8 }} layout={{ "line-cap": "round", "line-join": "round" }} />
      <Layer id={`ruta-${id}`} type="line" paint={{ "line-color": color, "line-width": 3 }} layout={{ "line-cap": "round", "line-join": "round" }} />
    </Source>
  );
}
