"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { use, useEffect, useState } from "react";

import { Cargando, ErrorCarga } from "@/components/common/Estado";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api/client";
import { useCatalogos, useUsuarios } from "@/lib/api/hooks";

/** Hoja de la orden de trabajo para imprimir o guardar como PDF desde el navegador. */
export default function ImprimirOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const catalogos = useCatalogos();
  const usuarios = useUsuarios();
  const [qr, setQr] = useState<string | null>(null);
  const orden = useQuery({
    queryKey: ["ordenes", "detalle", id],
    queryFn: () => unwrap(api.GET("/api/ordenes/{orden_id}", { params: { path: { orden_id: id } } })),
  });

  const usuario = (uid: number) => usuarios.data?.find((u) => u.id === uid);

  useEffect(() => {
    if (!orden.data || !usuarios.data) return;
    const o = orden.data;
    // Mismos datos que el QR de la versión anterior, para verificar la hoja en campo.
    const datos = {
      ordenId: o.display_id,
      fechaCreacion: o.fecha_creacion,
      creadorCI: usuarios.data.find((u) => u.id === o.creado_por_id)?.cedula ?? "N/A",
      placasVehiculos: o.unidades.map((u) => u.placa),
      cedulasTecnicos: o.unidades.flatMap((u) => u.tecnicos.map((t) => usuarios.data.find((x) => x.id === t.id)?.cedula ?? "N/A")),
      coordenadasRevisiones: o.trabajos.map((t) => `${t.equipo.lat.toFixed(6)},${t.equipo.lng.toFixed(6)}`),
    };
    QRCode.toDataURL(JSON.stringify(datos), { errorCorrectionLevel: "M", margin: 1 }).then(setQr, () => setQr(null));
  }, [orden.data, usuarios.data]);

  if (orden.isPending) return <Cargando />;
  if (orden.isError) return <ErrorCarga error={orden.error} />;
  const o = orden.data;
  const tipoEquipo = (v: string) => catalogos.data?.tipos_equipo.find((t) => t.valor === v)?.etiqueta ?? v;

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-sm text-black print:p-0">
      <Button onClick={() => window.print()} className="fixed top-4 right-4 print:hidden">
        <Printer /> Imprimir
      </Button>
      <header className="mb-6 flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <Icons.logo className="mb-2 h-10 w-auto" />
          <p>{catalogos.data?.configuracion.empresa_nombre}</p>
          <p className="text-xs">{catalogos.data?.configuracion.empresa_departamento}</p>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">ORDEN DE TRABAJO</h1>
          <h2 className="text-lg font-semibold">{o.display_id}</h2>
          <p>Creada: {format(new Date(o.fecha_creacion), "dd/MM/yyyy HH:mm")}</p>
          <p>Por: {o.creado_por_nombre}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador */}
        {qr && <img src={qr} alt="Código QR de verificación" className="ml-4 size-28" />}
      </header>

      <section className="mb-6">
        <h3 className="mb-2 font-bold uppercase">Unidades asignadas</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1 text-left">Vehículo</th>
              <th className="border p-1 text-left">Técnico</th>
              <th className="border p-1 text-left">Cédula</th>
            </tr>
          </thead>
          <tbody>
            {o.unidades.flatMap((u) =>
              u.tecnicos.map((t, i) => (
                <tr key={`${u.vehiculo}-${t.id}`}>
                  <td className="border p-1">{i === 0 ? u.placa : ""}</td>
                  <td className="border p-1">{t.nombre}</td>
                  <td className="border p-1">{usuario(t.id)?.cedula ?? "—"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 font-bold uppercase">Trabajos ({o.trabajos.length})</h3>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1">#</th>
              <th className="border p-1 text-left">Equipo</th>
              <th className="border p-1 text-left">Dirección</th>
              <th className="border p-1 text-left">Coordenadas</th>
              <th className="border p-1 text-left">Trabajo</th>
              <th className="border p-1 text-left">Solicitud</th>
              <th className="border p-1 text-left">Observaciones / firma</th>
            </tr>
          </thead>
          <tbody>
            {o.trabajos.map((t) => (
              <tr key={t.id} className="break-inside-avoid">
                <td className="border p-1 text-center">{t.secuencia}</td>
                <td className="border p-1">
                  {t.equipo.codigo}
                  <div className="text-[10px]">{tipoEquipo(t.equipo.tipo)}{t.equipo.requiere_canasta ? " · canasta" : ""}{t.equipo.zona_peligrosa ? " · ⚠ zona peligrosa" : ""}</div>
                </td>
                <td className="border p-1">{t.equipo.direccion}</td>
                <td className="border p-1 whitespace-nowrap">{t.equipo.lat.toFixed(6)}, {t.equipo.lng.toFixed(6)}</td>
                <td className="border p-1">{t.tipo_trabajo_nombre} ({t.tiempo_servicio_estimado ?? "?"} min)</td>
                <td className="border p-1">{t.solicitud_display_id}</td>
                <td className="h-12 w-40 border p-1" />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-16 grid grid-cols-2 gap-16 text-center">
        <div className="border-t border-black pt-1">Supervisor</div>
        <div className="border-t border-black pt-1">Responsable de la unidad</div>
      </footer>
    </div>
  );
}
