"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import { Icons } from "@/components/icons";
import { NAVEGACION, iniciales, rolesDeRuta } from "@/components/layout/navegacion";
import { MenuNotificaciones } from "@/components/layout/notificaciones";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useSesion } from "@/hooks/use-sesion";
import { NOMBRE_ROL, type Rol } from "@/lib/api/types";

function Cabecera() {
  const router = useRouter();
  const { usuario, tieneRol, salir } = useSesion();
  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-sm md:px-6">
      <SidebarTrigger />
      <div className="hidden items-center gap-2 md:flex">
        {tieneRol("supervisor") && (
          <Button asChild size="sm">
            <Link href="/work-orders/create">
              <Icons.createWorkOrder /> Crear orden
            </Link>
          </Button>
        )}
        {tieneRol("ingenieroDeOficina") && (
          <Button asChild size="sm" variant="secondary">
            <Link href="/requests/create">
              <Icons.add /> Crear solicitud
            </Link>
          </Button>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggleButton />
        <MenuNotificaciones />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="overflow-hidden rounded-full" aria-label="Mi cuenta">
              <Avatar>
                {usuario?.foto_url && <AvatarImage src={usuario.foto_url} alt={usuario.nombre} />}
                <AvatarFallback>{iniciales(usuario?.nombre)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{usuario?.nombre}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>Perfil</DropdownMenuItem>
            {tieneRol("tecnicoDeCampo") && (
              <DropdownMenuItem onClick={() => router.push("/technician/my-jobs")}>Mis trabajos</DropdownMenuItem>
            )}
            {tieneRol("administrador") && (
              <DropdownMenuItem onClick={() => router.push("/settings")}>Configuración</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={salir}>Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function SinPermiso() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <ShieldAlert className="text-muted-foreground size-10" />
      <h1 className="text-lg font-semibold">No tienes acceso a esta sección</h1>
      <Button asChild variant="outline">
        <Link href="/dashboard">Ir al dashboard</Link>
      </Button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, cargando, tieneRol } = useSesion();

  useEffect(() => {
    if (cargando) return;
    if (!usuario) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (usuario.debe_cambiar_password) router.replace("/cambiar-password");
  }, [cargando, usuario, pathname, router]);

  if (cargando || !usuario || usuario.debe_cambiar_password) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader2 className="text-primary size-12 animate-spin" />
      </div>
    );
  }

  const navegacion = NAVEGACION.filter((i) => tieneRol(...i.roles));
  const rolesPermitidos = rolesDeRuta(pathname);
  const rolPrincipal = usuario.perfiles[0] as Rol | undefined;

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-sidebar-border border-r">
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="text-sidebar-foreground flex items-center justify-center">
            <Icons.logo className="hidden h-8 w-auto group-data-[state=expanded]:block" />
            <Icons.CamittLogoIcon className="hidden h-8 w-auto group-data-[state=collapsed]:block" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu className="px-2">
            {navegacion.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon className="size-5" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-2">
          <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
            <Avatar className="size-8">
              {usuario.foto_url && <AvatarImage src={usuario.foto_url} alt={usuario.nombre} />}
              <AvatarFallback>{iniciales(usuario.nombre)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sidebar-foreground text-sm font-medium">{usuario.nombre}</span>
              <span className="text-sidebar-foreground/70 text-xs">
                {rolPrincipal ? NOMBRE_ROL[rolPrincipal] : "Sin rol"}
              </span>
            </div>
          </div>
          <p className="text-sidebar-foreground/60 text-center text-xs group-data-[collapsible=icon]:hidden">
            Versión {process.env.NEXT_PUBLIC_APP_VERSION ?? "—"}
          </p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <Cabecera />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {rolesPermitidos && !tieneRol(...rolesPermitidos) ? <SinPermiso /> : children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
