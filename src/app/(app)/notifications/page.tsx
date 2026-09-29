
"use client";

import React from "react"; // Ensure this is a value import
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { Notificacion } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getNotificationsForUser, markNotificationAsRead, markAllNotificationsAsReadForUser } from "@/services/notificationService";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function NotificationsPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserNotifications = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      // Pass undefined or a large number to get all/more notifications
      // The service now defaults to 100 if count is undefined
      const userNotifications = await getNotificationsForUser(currentUser.uid);
      setNotifications(userNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      toast({
        title: "Error al Cargar Notificaciones",
        description: "No se pudieron obtener tus notificaciones.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, toast]);

  useEffect(() => {
    fetchUserNotifications();
  }, [fetchUserNotifications]);

  const handleNotificationClick = async (notification: Notificacion) => {
    if (!notification.leida) {
      try {
        await markNotificationAsRead(notification.id);
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, leida: true } : n));
        // Potentially update global unread count if a shared state/context for notifications exists
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
    }
    if (notification.entidadUrl) {
      router.push(notification.entidadUrl);
    }
  };

  const handleMarkAllRead = async () => {
    if (!currentUser || notifications.every(n => n.leida)) return;
    try {
      await markAllNotificationsAsReadForUser(currentUser.uid);
      setNotifications(prev => prev.map(n => ({ ...n, leida: true })));
      toast({ title: "Notificaciones", description: "Todas las notificaciones marcadas como leídas." });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      toast({ title: "Error", description: "No se pudieron marcar todas las notificaciones.", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Todas las Notificaciones">
        <Button
          onClick={handleMarkAllRead}
          disabled={isLoading || notifications.every(n => n.leida)}
        >
          <Icons.mail className="mr-2 h-4 w-4" /> Marcar Todas como Leídas
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Mis Notificaciones ({notifications.length})</CardTitle>
          <CardDescription>Listado de todas tus notificaciones, las más recientes primero.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-300px)]">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Icons.loader className="h-10 w-10 animate-spin text-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No tienes notificaciones.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mensaje</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((notif) => (
                    <TableRow key={notif.id} className={!notif.leida ? "bg-accent/30 hover:bg-accent/50" : ""}>
                      <TableCell className="max-w-sm">
                        <p className="font-medium truncate" title={notif.mensaje}>{notif.mensaje}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {notif.creadaPorNombre || (notif.creadaPor ? "Sistema" : "Sistema")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notif.fechaCreacion), { addSuffix: true, locale: es })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={notif.leida ? "secondary" : "default"} className={notif.leida ? "" : "bg-primary/80"}>
                          {notif.leida ? "Leída" : "No Leída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleNotificationClick(notif)}
                          disabled={!notif.entidadUrl && notif.leida}
                        >
                          {notif.entidadUrl ? <Icons.view className="mr-2 h-3 w-3" /> : <Icons.mail className="mr-2 h-3 w-3" />}
                          {notif.entidadUrl ? "Ver Detalle" : (notif.leida ? "Leída" : "Marcar Leída")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
