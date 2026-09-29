"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DialogoMotivo } from "@/components/common/DialogoMotivo";
import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";
import { useHabilidades, useUsuarios } from "@/lib/api/hooks";
import { NOMBRE_ROL, type Rol, type Usuario } from "@/lib/api/types";

import { DialogoPasswordTemporal } from "./dialogo-password";
import { FormularioUsuario } from "./formulario-usuario";

const TODOS = "__todos__";

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const { usuario: yo } = useSesion();
  const [texto, setTexto] = useState("");
  const [rol, setRol] = useState(TODOS);
  const [habilidad, setHabilidad] = useState(TODOS);
  const [estado, setEstado] = useState("activo");
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [aperturas, setAperturas] = useState(0); // reinicia el formulario en cada apertura
  const [cambioEstado, setCambioEstado] = useState<Usuario | null>(null);
  const [passwordPara, setPasswordPara] = useState<Usuario | null>(null);

  const usuarios = useUsuarios();
  const habilidades = useHabilidades();

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (usuarios.data ?? []).filter(
      (u) =>
        (!q || [u.nombre, u.email, u.cedula ?? ""].some((c) => c.toLowerCase().includes(q))) &&
        (rol === TODOS || u.perfiles.includes(rol)) &&
        (habilidad === TODOS || u.habilidades.includes(habilidad)) &&
        (estado === TODOS || u.estado === estado),
    );
  }, [usuarios.data, texto, rol, habilidad, estado]);

  const cambiarEstado = useMutation({
    mutationFn: ({ u, motivo }: { u: Usuario; motivo: string }) =>
      unwrap(
        api.POST("/api/accounts/usuarios/{user_id}/estado", {
          params: { path: { user_id: u.id } },
          body: { estado: u.estado === "activo" ? "inactivo" : "activo", motivo },
        }),
      ),
    onSuccess: (u) => {
      toast.success(`${u.nombre} ahora está ${u.estado}.`);
      void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
  });

  function abrirFormulario(u: Usuario | null) {
    setEditando(u);
    setAperturas((n) => n + 1);
    setFormAbierto(true);
  }

  return (
    <>
      <PageHeader title="Usuarios" description="Cuentas, roles y habilidades del personal.">
        <Button onClick={() => abrirFormulario(null)}>
          <Plus /> Nuevo usuario
        </Button>
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Buscar por nombre, correo o cédula" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Select value={rol} onValueChange={setRol}>
            <SelectTrigger aria-label="Rol"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los roles</SelectItem>
              {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
                <SelectItem key={r} value={r}>{NOMBRE_ROL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={habilidad} onValueChange={setHabilidad}>
            <SelectTrigger aria-label="Habilidad"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas las habilidades</SelectItem>
              {(habilidades.data ?? []).map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger aria-label="Estado"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los estados</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="inactivo">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {usuarios.isPending ? (
            <Cargando />
          ) : usuarios.isError ? (
            <ErrorCarga error={usuarios.error} />
          ) : !filtrados.length ? (
            <Vacio texto="No hay usuarios que coincidan con los filtros." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Cédula</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden lg:table-cell">Habilidades</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.nombre}</div>
                      <div className="text-muted-foreground text-xs">{u.email}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.cedula ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.perfiles.map((p) => (
                          <Badge key={p} variant="secondary">{NOMBRE_ROL[p as Rol] ?? p}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                      {u.habilidades.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.estado === "activo" ? "default" : "outline"}>{u.estado}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Acciones de ${u.nombre}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => abrirFormulario(u)}>
                            <Pencil /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPasswordPara(u)}>
                            <KeyRound /> Contraseña temporal
                          </DropdownMenuItem>
                          {u.id !== yo?.id && (
                            <DropdownMenuItem onClick={() => setCambioEstado(u)}>
                              {u.estado === "activo" ? <UserX /> : <UserCheck />}
                              {u.estado === "activo" ? "Desactivar" : "Reactivar"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <FormularioUsuario key={aperturas} usuario={editando} abierto={formAbierto} onCambiar={setFormAbierto} />
      <DialogoPasswordTemporal usuario={passwordPara} onCerrar={() => setPasswordPara(null)} />
      <DialogoMotivo
        abierto={!!cambioEstado}
        onCambiar={(a) => !a && setCambioEstado(null)}
        titulo={cambioEstado?.estado === "activo" ? "Desactivar usuario" : "Reactivar usuario"}
        descripcion={
          cambioEstado?.estado === "activo"
            ? `${cambioEstado?.nombre} no podrá iniciar sesión. Queda registrado en su historial.`
            : `${cambioEstado?.nombre} podrá volver a iniciar sesión.`
        }
        textoConfirmar={cambioEstado?.estado === "activo" ? "Desactivar" : "Reactivar"}
        destructivo={cambioEstado?.estado === "activo"}
        onConfirmar={(motivo) => cambiarEstado.mutateAsync({ u: cambioEstado!, motivo })}
      />
    </>
  );
}
