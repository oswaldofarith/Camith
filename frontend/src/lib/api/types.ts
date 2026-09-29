/** Alias legibles de los esquemas generados desde el OpenAPI de Django. */
import type { components } from "./schema";

type S = components["schemas"];

export type Me = S["MeOut"];
export type Usuario = S["UsuarioOut"];
export type UsuarioDetalle = S["UsuarioDetalleOut"];
export type Catalogos = S["CatalogosOut"];
export type ItemCatalogo = S["ItemOut"];
export type TipoTrabajo = S["TipoTrabajoOut"];
export type Configuracion = S["ConfiguracionSchema"];
export type Vehiculo = S["VehiculoOut"];
export type Equipo = S["EquipoOut"];
export type EquipoDetalle = S["EquipoDetalleOut"];
export type Solicitud = S["SolicitudOut"];
export type Orden = S["OrdenOut"];
export type OrdenDetalle = S["OrdenDetalleOut"];
export type Trabajo = S["TrabajoOut"];
export type Notificacion = S["NotificacionOut"];
export type Plan = S["PlanOut"];
export type PlanDetalle = S["PlanDetalleOut"];
export type Kpis = S["KpisOut"];

export type Rol = "administrador" | "supervisor" | "ingenieroDeOficina" | "tecnicoDeCampo";

export const NOMBRE_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  supervisor: "Supervisor",
  ingenieroDeOficina: "Ingeniero de oficina",
  tecnicoDeCampo: "Técnico de campo",
};
