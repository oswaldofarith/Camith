
"use client";

import React, { useState, useEffect, useCallback } from "react"; // Changed to a value import
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarRail, // Import SidebarRail
  useSidebar,
} from "@/components/ui/sidebar";
import { Icons } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import type { Notificacion } from "@/types";
import { getNotificationsForUser, getUnreadNotificationCountForUser, markNotificationAsRead, markAllNotificationsAsReadForUser } from "@/services/notificationService";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";


const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Icons.dashboard, roles: ["administrador", "supervisor", "ingenieroDeOficina", "tecnicoDeCampo"] },
  { href: "/planning-board", label: "Tablero de Planificación", icon: Icons.ganttChart, roles: ["administrador", "supervisor"] },
  { href: "/users", label: "Usuarios", icon: Icons.users, roles: ["administrador"] },
  { href: "/vehicles", label: "Vehículos", icon: Icons.vehicles, roles: ["administrador", "supervisor"] },
  { href: "/equipment", label: "Equipos", icon: Icons.equipment, roles: ["administrador", "supervisor", "ingenieroDeOficina", "tecnicoDeCampo"] },
  { href: "/maintenance", label: "Mantenimientos", icon: Icons.wrench, roles: ["administrador", "supervisor"] },
  { href: "/requests", label: "Solicitudes", icon: Icons.requests, roles: ["administrador", "supervisor", "ingenieroDeOficina"] },
  { href: "/field-units", label: "Unidades de Campo", icon: Icons.fieldUnits, roles: ["administrador", "supervisor"] },
  { href: "/work-orders", label: "Órdenes de Trabajo", icon: Icons.workOrders, roles: ["administrador", "supervisor", "ingenieroDeOficina"] },
  { href: "/technician/my-jobs", label: "Mis Trabajos", icon: Icons.myJobs, roles: ["tecnicoDeCampo"] },
  { href: "/reports", label: "Reportes", icon: Icons.reports, roles: ["administrador", "supervisor"] },
  { href: "/settings", label: "Configuración", icon: Icons.settings, roles: ["administrador"] },
];

function AppHeader() {
  const { isMobile } = useSidebar();
  const { currentUser, userProfile, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isNotificationDropdownOpen, setIsNotificationDropdownOpen] = useState(false);

  const fetchNotificationData = useCallback(async () => {
    if (!currentUser) {
      console.log("[AppHeader:fetchNotificationData] No currentUser, skipping fetch.");
      return;
    }
    console.log(`[AppHeader:fetchNotificationData] Fetching for user: ${currentUser.uid}`);
    setIsLoadingNotifications(true);
    try {
      const [count, fetchedNotifications] = await Promise.all([
        getUnreadNotificationCountForUser(currentUser.uid),
        getNotificationsForUser(currentUser.uid, 10) // Get latest 10 for dropdown
      ]);
      console.log(`[AppHeader:fetchNotificationData] User ${currentUser.uid} - Unread count: ${count}, Fetched notifications (${fetchedNotifications.length}):`, fetchedNotifications);
      setUnreadCount(count);
      setNotifications(fetchedNotifications);
    } catch (error) {
      console.error(`[AppHeader:fetchNotificationData] Error fetching notification data for user ${currentUser?.uid}:`, error);
      toast({ 
        title: "Error al Cargar Notificaciones", 
        description: `No se pudieron cargar las notificaciones para el usuario ${currentUser?.uid}. Es probable que sea un problema de permisos de Firestore. Verifique sus reglas de seguridad. Detalles: ${(error as Error).message}`, 
        variant: "destructive",
        duration: 10000 
      });
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [currentUser, toast]);

  useEffect(() => {
    if (currentUser) {
      console.log("[AppHeader:useEffect] currentUser available, calling fetchNotificationData and setting interval.");
      fetchNotificationData();
      const intervalId = setInterval(fetchNotificationData, 60000); 
      return () => {
        console.log("[AppHeader:useEffect] Clearing notification interval.");
        clearInterval(intervalId);
      };
    } else {
      console.log("[AppHeader:useEffect] No currentUser, interval not set.");
    }
  }, [currentUser, fetchNotificationData]);

  const handleNotificationClick = async (notification: Notificacion) => {
    console.log("[AppHeader:handleNotificationClick] Clicked notification:", notification);
    if (!notification.leida) {
      try {
        await markNotificationAsRead(notification.id);
        fetchNotificationData(); 
      } catch (error) {
        console.error("[AppHeader:handleNotificationClick] Error marking notification as read:", error);
      }
    }
    if (notification.entidadUrl) {
      router.push(notification.entidadUrl);
    }
    setIsNotificationDropdownOpen(false);
  };

  const handleMarkAllRead = async () => {
    if (!currentUser || unreadCount === 0) return;
    console.log("[AppHeader:handleMarkAllRead] Marking all as read for user:", currentUser.uid);
    try {
      await markAllNotificationsAsReadForUser(currentUser.uid);
      fetchNotificationData(); 
      toast({ title: "Notificaciones", description: "Todas las notificaciones marcadas como leídas." });
    } catch (error) {
      console.error("[AppHeader:handleMarkAllRead] Error marking all notifications as read:", error);
      toast({ title: "Error", description: "No se pudieron marcar todas las notificaciones.", variant: "destructive" });
    }
  };

  const getInitials = (name?: string): string => {
    if (!name || name.trim() === "") return "U";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts[0].length > 0 && parts[parts.length - 1].length > 0) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].substring(0, Math.min(2, parts[0].length)).toUpperCase();
    }
    return "U";
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-4">
      {isMobile && <SidebarTrigger />}

      <div className="hidden md:flex items-center gap-2">
        {userProfile?.perfiles.includes("supervisor") && (
          <Button asChild size="sm">
            <Link href="/work-orders/create">
              <Icons.createWorkOrder className="mr-2 h-4 w-4" />
              Crear Orden
            </Link>
          </Button>
        )}
        {userProfile?.perfiles.includes("ingenieroDeOficina") && (
          <Button asChild size="sm" variant="secondary">
            <Link href="/requests/create">
              <Icons.add className="mr-2 h-4 w-4" />
              Crear Solicitud
            </Link>
          </Button>
        )}
      </div>
      
      <div className="relative ml-auto flex items-center gap-2 md:grow-0">
        <ThemeToggleButton />
        <DropdownMenu open={isNotificationDropdownOpen} onOpenChange={setIsNotificationDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="relative rounded-full">
              <Icons.notification className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 w-4 min-w-4 p-0 flex items-center justify-center text-xs rounded-full bg-destructive text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
              <span className="sr-only">Notificaciones</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 md:w-96">
            <DropdownMenuLabel className="flex justify-between items-center">
              <span>Notificaciones</span>
              {unreadCount > 0 && (
                <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={handleMarkAllRead} disabled={isLoadingNotifications}>
                   <Icons.mail className="mr-1 h-3 w-3" /> Marcar todas como leídas
                </Button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-80">
              {isLoadingNotifications ? (
                <DropdownMenuItem disabled className="justify-center py-4">
                  <Icons.loader className="h-5 w-5 animate-spin" />
                </DropdownMenuItem>
              ) : notifications.length === 0 ? (
                <DropdownMenuItem disabled className="text-center text-muted-foreground py-4">
                  No tienes notificaciones.
                </DropdownMenuItem>
              ) : (
                <DropdownMenuGroup>
                {notifications.map((notif) => (
                  <DropdownMenuItem
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`cursor-pointer ${!notif.leida ? 'font-semibold bg-accent/50 hover:bg-accent/70' : 'hover:bg-accent/30'}`}
                    title={notif.mensaje}
                  >
                    <div className="flex flex-col w-full overflow-hidden">
                      <p className="text-xs text-foreground truncate whitespace-normal leading-tight">
                        {notif.mensaje}
                      </p>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {notif.creadaPorNombre ? `${notif.creadaPorNombre} - ` : ""}
                        {formatDistanceToNow(new Date(notif.fechaCreacion), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
                </DropdownMenuGroup>
              )}
            </ScrollArea>
             {notifications.length >= 0 && ( // Show "Ver todas" even if current dropdown list is empty, but there might be more
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/notifications')} className="justify-center text-primary">
                   Ver todas
                </DropdownMenuItem>
              </>
             )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="overflow-hidden rounded-full ml-2"
            >
              <Avatar>
                <AvatarImage src={userProfile?.fotoUrl || "https://placehold.co/40x40.png"} alt={userProfile?.nombre || "User"} data-ai-hint="user avatar" />
                <AvatarFallback>{getInitials(userProfile?.nombre)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{userProfile?.nombre || "Mi Cuenta"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/profile')}>
              Perfil
            </DropdownMenuItem>
            {userProfile?.perfiles.includes('tecnicoDeCampo') && (
              <DropdownMenuItem onClick={() => router.push('/technician/my-jobs')}>
                Mis Trabajos
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => router.push('/settings')}
              disabled={!(userProfile?.perfiles.includes('administrador'))}
            >
              Ajustes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>Cerrar Sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}


export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, userProfile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Icons.loader className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center">
         <p>Redirigiendo a inicio de sesión...</p>
      </div>
    );
  }

  const userRoles = userProfile?.perfiles || [];
  const accessibleNavItems = navItems.filter(item =>
    item.roles.some(role => userRoles.includes(role as any))
  );

  const getSidebarFooterInitials = (name?: string): string => {
    if (!name || name.trim() === "") return "U";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts[0].length > 0 && parts[parts.length - 1].length > 0) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].substring(0, Math.min(2, parts[0].length)).toUpperCase();
    }
    return "U";
  };

  const formatProfileName = (profileKey?: string): string => {
    if (!profileKey) return "Rol";
    const map: Record<string, string> = {
      administrador: "Administrador",
      supervisor: "Supervisor",
      ingenieroDeOficina: "Ingeniero de Oficina",
      tecnicoDeCampo: "Técnico de Campo",
    };
    return map[profileKey] || profileKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };


  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="flex items-center justify-center gap-2 text-sidebar-foreground hover:text-sidebar-primary transition-colors">
             <Icons.logo className="h-8 w-auto hidden group-data-[state=expanded]:block" />
             <Icons.CamittLogoIcon className="h-8 w-auto hidden group-data-[state=collapsed]:block" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {accessibleNavItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={
                      (pathname === item.href) || 
                      (item.href !== '/' && pathname.startsWith(item.href + '/') && !accessibleNavItems.some(nav => nav.href === pathname))
                    }
                    tooltip={{ children: item.label, className: "text-xs" }}
                    className="justify-start"
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-2">
           <Separator className="my-2 bg-sidebar-border group-data-[collapsible=icon]:hidden" />
           <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-8 w-8 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7">
                <AvatarImage src={userProfile?.fotoUrl || "https://placehold.co/40x40.png"} alt={userProfile?.nombre || "User"} data-ai-hint="user avatar" />
                <AvatarFallback>{getSidebarFooterInitials(userProfile?.nombre)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium text-sidebar-foreground">{userProfile?.nombre || "Usuario"}</span>
                <span className="text-xs text-sidebar-foreground/70">{formatProfileName(userProfile?.perfiles?.[0])}</span>
              </div>
           </div>
           <div className="mt-1 text-center text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
             Versión: {process.env.NEXT_PUBLIC_APP_VERSION || 'N/A'}
           </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarRail /> {/* <-- Componente añadido aquí */}
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
