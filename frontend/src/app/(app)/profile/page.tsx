"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import imageCompression from "browser-image-compression";
import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { FormularioNuevaPassword } from "@/app/(auth)/formulario-nueva-password";
import { iniciales } from "@/components/layout/navegacion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLAVE_ME, useSesion } from "@/hooks/use-sesion";
import { cambiarPassword } from "@/lib/api/auth";
import { api, unwrap } from "@/lib/api/client";
import { NOMBRE_ROL, type Rol } from "@/lib/api/types";

export default function PerfilPage() {
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const archivo = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [clave, setClave] = useState(0); // reinicia el formulario de contraseña

  const actualizar = (me: Awaited<ReturnType<typeof guardarNombre.mutateAsync>>) =>
    queryClient.setQueryData(CLAVE_ME, me);

  const guardarNombre = useMutation({
    mutationFn: () => unwrap(api.PATCH("/api/accounts/me", { body: { nombre } })),
    onSuccess: (me) => {
      actualizar(me);
      toast.success("Nombre actualizado.");
    },
  });

  const subirFoto = useMutation({
    mutationFn: async (original: File) => {
      // Se reduce en el navegador para ahorrar datos móviles y espacio en el VPS.
      const foto = await imageCompression(original, { maxSizeMB: 0.5, maxWidthOrHeight: 512 });
      const cuerpo = new FormData();
      cuerpo.append("foto", foto, original.name);
      return unwrap(
        api.POST("/api/accounts/me/foto", {
          body: {} as never,
          bodySerializer: () => cuerpo,
        }),
      );
    },
    onSuccess: (me) => {
      actualizar(me);
      toast.success("Foto actualizada.");
    },
  });

  if (!usuario) return null;

  return (
    <>
      <PageHeader title="Mi perfil" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
            <CardDescription>{usuario.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-20">
                {usuario.foto_url && <AvatarImage src={usuario.foto_url} alt={usuario.nombre} />}
                <AvatarFallback className="text-xl">{iniciales(usuario.nombre)}</AvatarFallback>
              </Avatar>
              <input
                ref={archivo}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && subirFoto.mutate(e.target.files[0])}
              />
              <Button variant="outline" onClick={() => archivo.current?.click()} disabled={subirFoto.isPending}>
                {subirFoto.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
                Cambiar foto
              </Button>
            </div>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                guardarNombre.mutate();
              }}
            >
              <Label htmlFor="nombre">Nombre completo</Label>
              <div className="flex gap-2">
                <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                <Button type="submit" disabled={guardarNombre.isPending || nombre.trim() === usuario.nombre}>
                  Guardar
                </Button>
              </div>
            </form>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Cédula</dt>
                <dd>{usuario.cedula ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Número de rol</dt>
                <dd>{usuario.numero_rol || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground mb-1">Roles</dt>
                <dd className="flex flex-wrap gap-1">
                  {usuario.perfiles.map((p) => (
                    <Badge key={p} variant="secondary">{NOMBRE_ROL[p as Rol] ?? p}</Badge>
                  ))}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Habilidades</dt>
                <dd>{usuario.habilidades.join(", ") || "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <FormularioNuevaPassword
              key={clave}
              titulo="Cambiar contraseña"
              descripcion="Necesitas tu contraseña actual."
              pedirActual
              onGuardar={async (nueva, actual) => {
                await cambiarPassword(actual, nueva);
                toast.success("Contraseña actualizada.");
                setClave((c) => c + 1);
              }}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
