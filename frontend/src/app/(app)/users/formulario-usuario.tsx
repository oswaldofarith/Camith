"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, unwrap } from "@/lib/api/client";
import { useHabilidades } from "@/lib/api/hooks";
import { NOMBRE_ROL, type Rol, type Usuario } from "@/lib/api/types";

const ROLES = Object.keys(NOMBRE_ROL) as Rol[];

const esquema = z.object({
  email: z.email("Correo no válido"),
  nombre: z.string().trim().min(1, "Obligatorio"),
  cedula: z.string().trim(),
  numero_rol: z.string().trim(),
  perfiles: z.array(z.enum(ROLES as [Rol, ...Rol[]])).min(1, "Elige al menos un rol"),
  habilidades: z.array(z.string()),
  password: z.string(),
});
type Valores = z.infer<typeof esquema>;

function ListaCasillas({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: { valor: string; etiqueta: string }[];
  valor: string[];
  onCambiar: (v: string[]) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {opciones.map((o) => (
        <label key={o.valor} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={valor.includes(o.valor)}
            onCheckedChange={(marcado) =>
              onCambiar(marcado ? [...valor, o.valor] : valor.filter((v) => v !== o.valor))
            }
          />
          {o.etiqueta}
        </label>
      ))}
    </div>
  );
}

export function FormularioUsuario({
  usuario,
  abierto,
  onCambiar,
}: {
  usuario: Usuario | null; // null = nuevo
  abierto: boolean;
  onCambiar: (abierto: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const habilidades = useHabilidades();
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    values: {
      email: usuario?.email ?? "",
      nombre: usuario?.nombre ?? "",
      cedula: usuario?.cedula ?? "",
      numero_rol: usuario?.numero_rol ?? "",
      perfiles: (usuario?.perfiles as Rol[]) ?? ["tecnicoDeCampo"],
      habilidades: usuario?.habilidades ?? [],
      password: "",
    },
  });

  const guardar = useMutation({
    mutationFn: async (v: Valores) => {
      const datos = { ...v, cedula: v.cedula || null };
      if (usuario) {
        return unwrap(
          api.PATCH("/api/accounts/usuarios/{user_id}", {
            params: { path: { user_id: usuario.id } },
            body: {
              email: datos.email,
              nombre: datos.nombre,
              cedula: datos.cedula,
              numero_rol: datos.numero_rol,
              perfiles: datos.perfiles,
              habilidades: datos.habilidades,
            },
          }),
        );
      }
      return unwrap(
        api.POST("/api/accounts/usuarios", { body: { ...datos, password: v.password || null } }),
      );
    },
    onSuccess: (u) => {
      toast.success(usuario ? "Usuario actualizado." : `Usuario ${u.email} creado.`);
      void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      onCambiar(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{usuario ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
          <DialogDescription>
            {usuario
              ? usuario.email
              : "Si no asignas contraseña, el usuario la creará con “¿Olvidaste tu contraseña?”."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => guardar.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo electrónico</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre completo</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cedula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cédula</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numero_rol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de rol</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="perfiles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Roles</FormLabel>
                  <ListaCasillas
                    opciones={ROLES.map((r) => ({ valor: r, etiqueta: NOMBRE_ROL[r] }))}
                    valor={field.value}
                    onCambiar={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="habilidades"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Habilidades</FormLabel>
                  <ListaCasillas
                    opciones={(habilidades.data ?? []).map((h) => ({ valor: h, etiqueta: h }))}
                    valor={field.value}
                    onCambiar={field.onChange}
                  />
                </FormItem>
              )}
            />
            {!usuario && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña temporal (opcional)</FormLabel>
                    <FormControl>
                      <Input type="text" autoComplete="off" {...field} />
                    </FormControl>
                    <FormDescription>Deberá cambiarla en su primer inicio de sesión.</FormDescription>
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onCambiar(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {guardar.isPending && <Loader2 className="animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
