"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, unwrap } from "@/lib/api/client";
import type { Usuario } from "@/lib/api/types";

/** Asigna una contraseña que el usuario debe cambiar al entrar. */
export function DialogoPasswordTemporal({ usuario, onCerrar }: { usuario: Usuario | null; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const asignar = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/accounts/usuarios/{user_id}/password-temporal", {
          params: { path: { user_id: usuario!.id } },
          body: { password },
        }),
      ),
    onSuccess: () => {
      toast.success(`Contraseña temporal asignada a ${usuario?.nombre}. Compártela por un canal seguro.`);
      void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setPassword("");
      onCerrar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={!!usuario} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contraseña temporal</DialogTitle>
          <DialogDescription>
            {usuario?.nombre} deberá cambiarla en su próximo inicio de sesión.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="temporal">Contraseña</Label>
          <Input id="temporal" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => asignar.mutate()} disabled={password.length < 8 || asignar.isPending}>
            {asignar.isPending && <Loader2 className="animate-spin" />}
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
