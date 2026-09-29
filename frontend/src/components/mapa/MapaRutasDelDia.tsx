"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Popup } from "react-map-gl/maplibre";

import { ESTADO_TRABAJO, SERIES } from "@/components/common/estados";
import { api, unwrap } from "@/lib/api/client";

import { LineaRuta, Mapa, MarcadorParada, MarcadorSede } from ".";
import { limites } from "./utilidades";

type Seleccion = { lat: number; lng: number; texto: string; ordenId: number } | null;

/** Órdenes del día sobre el mapa: una línea por orden y las paradas por estado. */
export function MapaRutasDelDia({ className, refresco = 60_000 }: { className?: string; refresco?: number }) {
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const datos = useQuery({
    queryKey: ["planificacion", "rutas-del-dia"],
    queryFn: () => unwrap(api.GET("/api/planificacion/rutas-del-dia")),
    refetchInterval: refresco,
  });
  const rutas = datos.data?.rutas ?? [];
  const puntos = [...rutas.flatMap((r) => r.trabajos), ...(datos.data?.sede ? [datos.data.sede] : [])];
  const encuadre = limites(puntos);
  // El color sigue a la orden, en orden fijo; más de 8 rutas reutilizarían colores.
  const color = (i: number) => SERIES[i % SERIES.length];

  return (
    <div className="space-y-2">
      <Mapa
        key={encuadre ? "con-datos" : "sin-datos"}
        className={className}
        initialViewState={encuadre ? { bounds: encuadre, fitBoundsOptions: { padding: 48 } } : undefined}
      >
        {rutas.map((r, i) => (
          <LineaRuta key={r.orden_id} id={String(r.orden_id)} coordenadas={r.geometria} color={color(i)} />
        ))}
        {datos.data?.sede && <MarcadorSede {...datos.data.sede} />}
        {rutas.flatMap((r) =>
          r.trabajos.map((t) => (
            <MarcadorParada
              key={t.id}
              lat={t.lat}
              lng={t.lng}
              texto={t.secuencia}
              color={ESTADO_TRABAJO[t.estado]?.color ?? "gray"}
              titulo={`${r.display_id} · ${t.secuencia}. ${t.equipo} · ${ESTADO_TRABAJO[t.estado]?.etiqueta ?? t.estado}`}
              onClick={() =>
                setSeleccion({
                  lat: t.lat,
                  lng: t.lng,
                  ordenId: r.orden_id,
                  texto: `${t.secuencia}. ${t.equipo} — ${ESTADO_TRABAJO[t.estado]?.etiqueta ?? t.estado}`,
                })
              }
            />
          )),
        )}
        {seleccion && (
          <Popup latitude={seleccion.lat} longitude={seleccion.lng} onClose={() => setSeleccion(null)} closeOnClick={false} offset={14}>
            <div className="text-xs text-black">
              <p className="font-medium">{seleccion.texto}</p>
              <Link href={`/work-orders/${seleccion.ordenId}`} className="text-blue-700 underline">Ver orden</Link>
            </div>
          </Popup>
        )}
      </Mapa>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {rutas.map((r, i) => (
          <span key={r.orden_id} className="flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full" style={{ background: color(i) }} />
            <Link href={`/work-orders/${r.orden_id}`} className="hover:underline">{r.display_id}</Link>
            <span className="text-muted-foreground">{r.placas.join(", ")}</span>
          </span>
        ))}
        {!rutas.length && !datos.isPending && <span className="text-muted-foreground">No hay órdenes en curso hoy.</span>}
        <span className="text-muted-foreground ml-auto flex gap-3">
          {Object.values(ESTADO_TRABAJO).map((e) => (
            <span key={e.etiqueta} className="flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: e.color }} /> {e.etiqueta}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
