import { Icons } from "@/components/icons";
import type { Rol } from "@/lib/api/types";

export type ItemNavegacion = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Rol[];
};

const TODOS: Rol[] = ["administrador", "supervisor", "ingenieroDeOficina", "tecnicoDeCampo"];

export const NAVEGACION: ItemNavegacion[] = [
  { href: "/dashboard", label: "Dashboard", icon: Icons.dashboard, roles: TODOS },
  { href: "/planning-board", label: "Tablero de planificación", icon: Icons.ganttChart, roles: ["administrador", "supervisor"] },
  { href: "/users", label: "Usuarios", icon: Icons.users, roles: ["administrador"] },
  { href: "/vehicles", label: "Vehículos", icon: Icons.vehicles, roles: ["administrador", "supervisor"] },
  { href: "/equipment", label: "Equipos", icon: Icons.equipment, roles: TODOS },
  { href: "/maintenance", label: "Mantenimientos", icon: Icons.wrench, roles: ["administrador", "supervisor"] },
  { href: "/requests", label: "Solicitudes", icon: Icons.requests, roles: ["administrador", "supervisor", "ingenieroDeOficina"] },
  { href: "/field-units", label: "Unidades de campo", icon: Icons.fieldUnits, roles: ["administrador", "supervisor"] },
  { href: "/work-orders", label: "Órdenes de trabajo", icon: Icons.workOrders, roles: ["administrador", "supervisor", "ingenieroDeOficina"] },
  { href: "/technician/my-jobs", label: "Mis trabajos", icon: Icons.myJobs, roles: ["tecnicoDeCampo"] },
  { href: "/reports", label: "Reportes", icon: Icons.reports, roles: ["administrador", "supervisor"] },
  { href: "/settings", label: "Configuración", icon: Icons.settings, roles: ["administrador"] },
];

/** Roles que pueden entrar a una ruta (la más específica que coincida). */
export function rolesDeRuta(pathname: string): Rol[] | null {
  const item = NAVEGACION.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return item?.roles ?? null;
}

export function iniciales(nombre?: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length > 1) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  return (partes[0]?.slice(0, 2) ?? "U").toUpperCase();
}
