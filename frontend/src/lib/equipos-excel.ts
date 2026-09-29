/**
 * Importación y exportación de equipos en CSV/XLSX.
 * Usa las mismas columnas que la plantilla anterior para que los archivos
 * existentes sigan sirviendo.
 */
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";

import type { components } from "./api/schema";
import type { Catalogos, Equipo, ItemCatalogo } from "./api/types";

type EquipoIn = components["schemas"]["EquipoIn"];

export const COLUMNAS = [
  "identificacion",
  "tipo",
  "direccion",
  "marca",
  "estado",
  "requiereCanasta",
  "zonaPeligrosa",
  "ip",
  "tipoComunicacion",
  "piloto",
  "latitud",
  "longitud",
  "zona",
  "fechaUltimaRevision (YYYY-MM-DD)",
  "revisionCount",
  "proximoMantenimientoProgramado (YYYY-MM-DD)",
  "intervaloMantenimientoDias",
  "intervaloMantenimientoRevisiones",
] as const;

const OBLIGATORIAS = ["identificacion", "tipo", "direccion", "marca", "estado", "latitud", "longitud", "zona"];

/** "fechaUltimaRevision (YYYY-MM-DD)" → "fechaultimarevision" */
const normalizar = (encabezado: string) => encabezado.replace(/\(.*\)/, "").trim().toLowerCase();

type Celda = string | number | boolean | Date | null | undefined;

async function leerFilas(archivo: File): Promise<Celda[][]> {
  if (archivo.name.toLowerCase().endsWith(".csv")) {
    const texto = await archivo.text();
    return Papa.parse<string[]>(texto.trim(), { skipEmptyLines: true }).data;
  }
  return (await readSheet(archivo)) as Celda[][];
}

function aTexto(v: Celda): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v === null || v === undefined ? "" : String(v).trim();
}

function aBooleano(v: Celda): boolean {
  return ["true", "sí", "si", "1", "x", "verdadero"].includes(aTexto(v).toLowerCase());
}

function aNumero(v: Celda): number | null {
  const t = aTexto(v).replace(",", ".");
  return t === "" || Number.isNaN(Number(t)) ? null : Number(t);
}

function aFecha(v: Celda): string | null {
  const t = aTexto(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

/** Acepta el valor o la etiqueta del catálogo ("Vía a la Costa" o "via-a-la-costa"). */
function resolver(items: ItemCatalogo[], v: Celda): string | null {
  const t = aTexto(v).toLowerCase();
  return items.find((i) => i.valor.toLowerCase() === t || i.etiqueta.toLowerCase() === t)?.valor ?? null;
}

export type ResultadoLectura = { equipos: EquipoIn[]; errores: string[] };

export async function leerEquipos(archivo: File, catalogos: Catalogos): Promise<ResultadoLectura> {
  const [encabezados, ...filas] = await leerFilas(archivo);
  if (!encabezados) return { equipos: [], errores: ["El archivo está vacío."] };
  const indice = new Map(encabezados.map((e, i) => [normalizar(aTexto(e)), i]));
  const faltantes = OBLIGATORIAS.filter((c) => !indice.has(c.toLowerCase()));
  if (faltantes.length) {
    return { equipos: [], errores: [`Faltan columnas obligatorias: ${faltantes.join(", ")}.`] };
  }
  const celda = (fila: Celda[], col: string) => fila[indice.get(col.toLowerCase()) ?? -1];

  const equipos: EquipoIn[] = [];
  const errores: string[] = [];
  filas.forEach((fila, i) => {
    const n = i + 2; // número de fila en la hoja (1 = encabezados)
    const codigo = aTexto(celda(fila, "identificacion"));
    if (!codigo) return;
    const tipo = resolver(catalogos.tipos_equipo, celda(fila, "tipo"));
    const marca = resolver(catalogos.marcas, celda(fila, "marca"));
    const zona = resolver(catalogos.zonas, celda(fila, "zona"));
    const estado = resolver(catalogos.estados_equipo, celda(fila, "estado"));
    const lat = aNumero(celda(fila, "latitud"));
    const lng = aNumero(celda(fila, "longitud"));
    const problemas = [
      !tipo && `tipo "${aTexto(celda(fila, "tipo"))}"`,
      !marca && `marca "${aTexto(celda(fila, "marca"))}"`,
      !zona && `zona "${aTexto(celda(fila, "zona"))}"`,
      !estado && `estado "${aTexto(celda(fila, "estado"))}"`,
      (lat === null || lng === null) && "coordenadas",
    ].filter(Boolean);
    if (problemas.length) {
      errores.push(`Fila ${n} (${codigo}): valor no válido en ${problemas.join(", ")}.`);
      return;
    }
    const comunicacion = aTexto(celda(fila, "tipoComunicacion")).toLowerCase().startsWith("fibra")
      ? "Fibra óptica"
      : "Celular";
    const fechaRevision = aFecha(celda(fila, "fechaUltimaRevision"));
    equipos.push({
      codigo,
      tipo: tipo!,
      marca: marca!,
      zona: zona!,
      estado: estado!,
      direccion: aTexto(celda(fila, "direccion")),
      lat: lat!,
      lng: lng!,
      ip: aTexto(celda(fila, "ip")) || null,
      tipo_comunicacion: comunicacion,
      piloto: aTexto(celda(fila, "piloto")),
      requiere_canasta: aBooleano(celda(fila, "requiereCanasta")),
      zona_peligrosa: aBooleano(celda(fila, "zonaPeligrosa")),
      fecha_ultima_revision: fechaRevision ? `${fechaRevision}T12:00:00Z` : null,
      revision_count: aNumero(celda(fila, "revisionCount")) ?? 0,
      proximo_mantenimiento_programado: aFecha(celda(fila, "proximoMantenimientoProgramado")),
      intervalo_mantenimiento_dias: aNumero(celda(fila, "intervaloMantenimientoDias")),
      intervalo_mantenimiento_revisiones: aNumero(celda(fila, "intervaloMantenimientoRevisiones")),
      campos_adicionales: {},
      motivo_estado: "Importación masiva",
    });
  });
  return { equipos, errores };
}

export async function descargarPlantilla() {
  await writeXlsxFile([COLUMNAS.map((c) => ({ value: c, fontWeight: "bold" as const }))]).toFile(
    "plantilla_equipos.xlsx",
  );
}

export async function exportarEquipos(equipos: Equipo[], catalogos: Catalogos) {
  const etq = (items: ItemCatalogo[], v: string) => items.find((i) => i.valor === v)?.etiqueta ?? v;
  const filas = equipos.map((e) => [
    e.codigo,
    etq(catalogos.tipos_equipo, e.tipo),
    e.direccion,
    etq(catalogos.marcas, e.marca),
    etq(catalogos.estados_equipo, e.estado),
    e.requiere_canasta ? "true" : "false",
    e.zona_peligrosa ? "true" : "false",
    e.ip ?? "",
    e.tipo_comunicacion,
    e.piloto,
    e.lat,
    e.lng,
    etq(catalogos.zonas, e.zona),
    e.fecha_ultima_revision?.slice(0, 10) ?? "",
    e.revision_count,
    e.proximo_mantenimiento_programado ?? "",
    e.intervalo_mantenimiento_dias ?? "",
    e.intervalo_mantenimiento_revisiones ?? "",
  ]);
  const datos = [
    COLUMNAS.map((c) => ({ value: c, fontWeight: "bold" as const })),
    ...filas.map((f) => f.map((value) => ({ value }))),
  ];
  await writeXlsxFile(datos).toFile(`equipos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
