
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icons } from "@/components/icons";
import type { UserProfile, UserSkill } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { getUsers, setUserProfile as setUserProfileData } from "@/services/userService";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as AlertDialogContentComponent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitleComponent,
} from "@/components/ui/alert-dialog";
import { manageUserStatus, createUser } from "./actions";
import { Textarea } from "@/components/ui/textarea";


const allSkillOptions: UserSkill[] = ["Eléctrico", "Telecomunicaciones", "Escalador", "Conductor tipo C", "Conductor tipo D"];
const allProfileOptions: UserProfile["perfiles"][number][] = ["administrador", "supervisor", "ingenieroDeOficina", "tecnicoDeCampo"];
const defaultNewUserRole: UserProfile["perfiles"][number] = "tecnicoDeCampo";

const USER_STATUS_OPTIONS = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
  { value: "__ALL__", label: "Todos los Estados" },
];

const ALL_ITEMS_FILTER_VALUE = "__ALL__";

const getLastName = (fullName: string): string => {
  if (!fullName || fullName.trim() === "") return "";
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1].toLowerCase() : "";
};

export default function UsersPage() {
  const { userProfile: adminUserProfile, updateUserProfileData } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // New state for status change dialog
  const [isStatusChangeDialogOpen, setIsStatusChangeDialogOpen] = useState(false);
  const [userToChangeStatus, setUserToChangeStatus] = useState<UserProfile | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [isSubmittingStatusChange, setIsSubmittingStatusChange] = useState(false);


  // Filter states
  const [filterSearchText, setFilterSearchText] = useState("");
  const [filterSelectedProfile, setFilterSelectedProfile] = useState<string>(""); // Empty string for "All"
  const [filterSelectedSkills, setFilterSelectedSkills] = useState<UserSkill[]>([]);
  const [filterSelectedStatus, setFilterSelectedStatus] = useState<"activo" | "inactivo" | "">("activo"); // Default to "activo"

  const fetchUsersList = async () => {
    setIsLoading(true);
    try {
      const userList = await getUsers();
      userList.sort((a, b) => {
        const lastNameA = getLastName(a.nombre);
        const lastNameB = getLastName(b.nombre);
        return lastNameA.localeCompare(lastNameB);
      });
      setUsers(userList);
    } catch (error) {
      toast({
        title: "Error al Cargar Usuarios",
        description: "No se pudieron obtener los datos de Firestore. Verifique su conexión o las reglas de seguridad.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersList();
  }, [toast]);

  useEffect(() => {
    let tempFiltered = [...users];

    if (filterSearchText.trim()) {
      const lowerSearchText = filterSearchText.toLowerCase();
      tempFiltered = tempFiltered.filter(
        (u) =>
          u.nombre.toLowerCase().includes(lowerSearchText) ||
          u.email.toLowerCase().includes(lowerSearchText)
      );
    }

    if (filterSelectedProfile) {
      tempFiltered = tempFiltered.filter((u) => u.perfiles.includes(filterSelectedProfile as UserProfile["perfiles"][number]));
    }

    if (filterSelectedSkills.length > 0) {
      tempFiltered = tempFiltered.filter((u) =>
        filterSelectedSkills.every(skill => u.habilidades?.includes(skill))
      );
    }

    if (filterSelectedStatus) { // Only filter by status if a specific status is selected
      tempFiltered = tempFiltered.filter((u) => u.estado === filterSelectedStatus);
    }

    setFilteredUsers(tempFiltered);
  }, [users, filterSearchText, filterSelectedProfile, filterSelectedSkills, filterSelectedStatus]);

  const formatProfileDisplay = (profileKey: string): string => {
    const map: Record<string, string> = {
      administrador: "Administrador",
      supervisor: "Supervisor",
      ingenieroDeOficina: "Ingeniero de Oficina",
      tecnicoDeCampo: "Técnico de Campo",
    };
    return map[profileKey] || profileKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const handleClearFilters = () => {
    setFilterSearchText("");
    setFilterSelectedProfile("");
    setFilterSelectedSkills([]);
    setFilterSelectedStatus("activo"); // Reset to default "activo"
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleChangeStatus = (user: UserProfile) => {
    setUserToChangeStatus(user);
    setChangeReason("");
    setIsStatusChangeDialogOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!userToChangeStatus || !adminUserProfile || !changeReason.trim()) {
      toast({ title: "Error", description: "Faltan datos o el motivo es obligatorio.", variant: "destructive" });
      return;
    }
    setIsSubmittingStatusChange(true);
    const newStatus = userToChangeStatus.estado === 'activo' ? 'inactivo' : 'activo';
    try {
      await manageUserStatus({
        targetUid: userToChangeStatus.id,
        newStatus,
        reason: changeReason,
        adminUid: adminUserProfile.id,
      });
      toast({
        title: "Estado Actualizado",
        description: `El usuario ${userToChangeStatus.nombre} fue ${newStatus === 'activo' ? 'reactivado' : 'desactivado'}.`,
      });
      fetchUsersList(); // Refresh the user list
    } catch (error) {
      toast({
        title: "Error al Cambiar Estado",
        description: (error as Error).message || "Ocurrió un error inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingStatusChange(false);
      setIsStatusChangeDialogOpen(false);
    }
  };


  const handleSaveUser = async (data: Partial<UserProfile>, newPassword?: string) => {
    setIsModalOpen(false);
    setIsLoading(true);
    try {
      if (editingUser) { // --- UPDATE USER ---
        if (!editingUser.id) {
            toast({ title: "Error", description: "ID de usuario no encontrado para la actualización.", variant: "destructive"});
            setIsLoading(false);
            return;
        }
        const updatePayload: Partial<Omit<UserProfile, 'id'>> = {
            nombre: data.nombre,
            cedula: data.cedula,
            habilidades: data.habilidades,
            perfiles: data.perfiles,
            numeroRol: data.numeroRol || undefined,
        };
        if (data.fotoUrl !== undefined) {
            updatePayload.fotoUrl = data.fotoUrl;
        }
        await updateUserProfileData(editingUser.id, updatePayload);
        toast({ title: "Usuario Actualizado", description: `El perfil de ${data.nombre || editingUser.email} ha sido actualizado.` });
      
      } else { // --- CREATE USER ---
        if (!data.email || !newPassword || !data.cedula) {
          toast({ title: "Error de Validación", description: "Email, contraseña y cédula son requeridos para un nuevo usuario.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        
        // 1. Create Auth user via server action
        const newUserAuth = await createUser({email: data.email, password: newPassword});
        
        // 2. If Auth user is created, create Firestore profile
        if (newUserAuth && newUserAuth.success && newUserAuth.uid) {
          const profileToSave: Omit<UserProfile, 'id'> = {
            nombre: data.nombre || "Nuevo Usuario",
            email: data.email,
            cedula: data.cedula,
            estado: 'activo',
            habilidades: data.habilidades || [],
            perfiles: data.perfiles && data.perfiles.length > 0 ? data.perfiles : [defaultNewUserRole],
            numeroRol: data.numeroRol || undefined,
            fotoUrl: data.fotoUrl || undefined,
            estadoHistorial: [], // The service will initialize this
          };

          await setUserProfileData(newUserAuth.uid, profileToSave);
          
          toast({
            title: "Usuario Creado",
            description: (
              <div className="flex flex-col gap-1">
                <p>El usuario {data.nombre || data.email} ha sido creado.</p>
                <p className="font-semibold mt-2">Importante: Si el rol 'administrador' fue asignado, el nuevo administrador deberá <span className="text-destructive">volver a iniciar sesión</span> para que sus privilegios completos tomen efecto.</p>
              </div>
            ),
            duration: 15000
          });
        }
      }
      await fetchUsersList();
    } catch (error: any) {
      console.error("Error saving user:", error);
      toast({ title: "Error al Guardar Usuario", description: error.message || "Ocurrió un error inesperado.", variant: "destructive", duration: 10000 });
    } finally {
      setIsLoading(false);
      setEditingUser(null);
    }
  };

  const canManageUsers = adminUserProfile?.perfiles.includes("administrador");

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

  if (isLoading && users.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Gestión de Usuarios" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Gestión de Usuarios">
        {canManageUsers && (
          <Button onClick={handleCreateUser}>
            <Icons.add className="mr-2 h-4 w-4" /> Crear Usuario
          </Button>
        )}
      </PageHeader>

      <Card>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="filters-accordion" className="border-b-0">
            <CardHeader className="p-4">
              <AccordionTrigger className="flex w-full items-center justify-between p-0 hover:no-underline">
                <CardTitle className="text-lg">Filtros de Búsqueda</CardTitle>
              </AccordionTrigger>
            </CardHeader>
            <AccordionContent>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end pt-0 pb-4 px-4 md:px-6">
                <div>
                  <Label htmlFor="filterSearchText">Buscar por Nombre/Email</Label>
                  <Input
                    id="filterSearchText"
                    placeholder="Escriba para buscar..."
                    value={filterSearchText}
                    onChange={(e) => setFilterSearchText(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="filterSelectedProfile">Perfil</Label>
                  <Select value={filterSelectedProfile} onValueChange={(value) => setFilterSelectedProfile(value === ALL_ITEMS_FILTER_VALUE ? "" : value)}>
                    <SelectTrigger id="filterSelectedProfile"><SelectValue placeholder="Todos los perfiles" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ITEMS_FILTER_VALUE}>Todos los perfiles</SelectItem>
                      {allProfileOptions.map(profile => (
                        <SelectItem key={profile} value={profile}>{formatProfileDisplay(profile)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Habilidades</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {filterSelectedSkills.length === 0
                          ? "Todas las habilidades"
                          : filterSelectedSkills.length === 1
                          ? filterSelectedSkills[0]
                          : `${filterSelectedSkills.length} habilidades`}
                        <Icons.chevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      <DropdownMenuLabel>Seleccionar Habilidades</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {allSkillOptions.map((skill) => (
                        <DropdownMenuCheckboxItem
                          key={skill}
                          checked={filterSelectedSkills.includes(skill)}
                          onCheckedChange={() => {
                            setFilterSelectedSkills(prev =>
                              prev.includes(skill)
                                ? prev.filter(s => s !== skill)
                                : [...prev, skill]
                            );
                          }}
                        >
                          {skill}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div>
                  <Label htmlFor="filterSelectedStatus">Estado</Label>
                  <Select
                    value={filterSelectedStatus === "" ? ALL_ITEMS_FILTER_VALUE : filterSelectedStatus}
                    onValueChange={(value) => setFilterSelectedStatus(value === ALL_ITEMS_FILTER_VALUE ? "" : value as "activo" | "inactivo" | "")}
                  >
                    <SelectTrigger id="filterSelectedStatus"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {USER_STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-full lg:col-span-1 xl:col-start-4">
                  <Button onClick={handleClearFilters} variant="outline" className="w-full">
                    <Icons.filter className="mr-2 h-4 w-4" /> Limpiar Filtros
                  </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Foto</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Nº Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Habilidades</TableHead>
                <TableHead>Perfiles</TableHead>
                {canManageUsers && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && filteredUsers.length === 0 && users.length > 0 ? (
                <TableRow>
                  <TableCell colSpan={canManageUsers ? 9 : 8} className="h-24 text-center">
                    <Icons.loader className="mx-auto h-8 w-8 animate-spin text-primary" />
                    Aplicando filtros...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Avatar>
                      <AvatarImage src={user.fotoUrl || `https://placehold.co/40x40.png?text=${getInitials(user.nombre)}`} alt={user.nombre} data-ai-hint="avatar placeholder" />
                      <AvatarFallback>{getInitials(user.nombre)}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{user.nombre}</TableCell>
                  <TableCell>{user.cedula}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.numeroRol || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={user.estado === "activo" ? "default" : "destructive"} className={user.estado === "activo" ? "bg-green-500" : "bg-red-500"}>
                      {user.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {user.habilidades?.map(skill => (
                        <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                      ))}
                      {(!user.habilidades || user.habilidades.length === 0) && <span className="text-xs text-muted-foreground">-</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {user.perfiles?.map(perfil => (
                        <Badge key={perfil} variant="outline" className="mr-1 mb-1 text-xs">{formatProfileDisplay(perfil)}</Badge>
                      ))}
                      {(!user.perfiles || user.perfiles.length === 0) && <span className="text-xs text-muted-foreground">-</span>}
                    </div>
                  </TableCell>
                  {canManageUsers && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={!canManageUsers || user.id === adminUserProfile?.id}>
                            <Icons.ellipsis className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Icons.edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleChangeStatus(user)} className="text-destructive focus:text-destructive">
                            <Icons.userCog className="mr-2 h-4 w-4" /> {user.estado === 'activo' ? 'Desactivar' : 'Reactivar'} Usuario
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && filteredUsers.length === 0 && (
                <TableRow>
                    <TableCell colSpan={canManageUsers ? 9 : 8} className="text-center h-24">
                        {users.length === 0 ? "No hay usuarios registrados." : "No hay usuarios que coincidan con los filtros."}
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[525px]">
          {isModalOpen && <UserForm user={editingUser} onSave={handleSaveUser} onCancel={() => setIsModalOpen(false)} />}
        </DialogContent>
      </Dialog>
      <AlertDialog open={isStatusChangeDialogOpen} onOpenChange={setIsStatusChangeDialogOpen}>
        <AlertDialogContentComponent>
          <AlertDialogHeader>
            <AlertDialogTitleComponent>
              Confirmar para {userToChangeStatus?.estado === 'activo' ? 'Desactivar' : 'Reactivar'} Usuario
            </AlertDialogTitleComponent>
            <AlertDialogDescription>
              Está a punto de {userToChangeStatus?.estado === 'activo' ? 'desactivar' : 'reactivar'} al usuario <strong>{userToChangeStatus?.nombre}</strong>.
              {userToChangeStatus?.estado === 'activo' ? ' El usuario no podrá iniciar sesión.' : ' El usuario podrá volver a iniciar sesión.'}
              <br />
              Por favor, ingrese el motivo para este cambio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="changeReason">Motivo (Requerido)</Label>
            <Textarea
              id="changeReason"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Ej: Fin de contrato, reincorporación, etc."
              className="mt-1"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingStatusChange} onClick={() => setIsStatusChangeDialogOpen(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusChange}
              disabled={!changeReason.trim() || isSubmittingStatusChange}
              className={userToChangeStatus?.estado === 'activo' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isSubmittingStatusChange && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContentComponent>
      </AlertDialog>
    </div>
  );
}


const UserForm = ({ user, onSave, onCancel }: { user: UserProfile | null, onSave: (data: Partial<UserProfile>, newPassword?: string) => void, onCancel: () => void }) => {
  const [nombre, setNombre] = useState(user?.nombre || "");
  const [email, setEmail] = useState(user?.email || "");
  const [cedula, setCedula] = useState(user?.cedula || "");
  const [newPassword, setNewPassword] = useState("");
  const [numeroRol, setNumeroRol] = useState(user?.numeroRol || "");
  const [selectedSkills, setSelectedSkills] = useState<UserSkill[]>(user?.habilidades || []);
  const [selectedPerfiles, setSelectedPerfiles] = useState<UserProfile["perfiles"]>(user?.perfiles && user.perfiles.length > 0 ? user.perfiles : [defaultNewUserRole]);
  const { toast } = useToast();

  const formatProfileDisplayForm = (profileKey: string): string => {
    const map: Record<string, string> = {
      administrador: "Administrador",
      supervisor: "Supervisor",
      ingenieroDeOficina: "Ingeniero de Oficina",
      tecnicoDeCampo: "Técnico de Campo",
    };
    return map[profileKey] || profileKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const handleSkillChange = (skill: UserSkill) => {
    setSelectedSkills(prev =>
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const handlePerfilChange = (perfil: UserProfile["perfiles"][number]) => {
    setSelectedPerfiles(prev => {
      let newPerfiles = prev.includes(perfil)
        ? prev.filter(p => p !== perfil)
        : [...prev, perfil];

      if (newPerfiles.length === 0) {
        newPerfiles = [defaultNewUserRole];
      }
      return newPerfiles;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cedula.trim().length !== 10) {
      toast({
        title: "Error de Validación",
        description: "La cédula debe tener exactamente 10 dígitos numéricos.",
        variant: "destructive",
      });
      return;
    }
    const dataToSave: Partial<UserProfile> = {
      nombre,
      email,
      cedula,
      estado: user?.estado || 'activo', // We don't change status here
      habilidades: selectedSkills,
      perfiles: selectedPerfiles.length > 0 ? selectedPerfiles : [defaultNewUserRole],
      fotoUrl: user?.fotoUrl,
      numeroRol: numeroRol.trim() === "" ? undefined : numeroRol.trim(),
    };

    onSave(dataToSave, user ? undefined : newPassword);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{user ? "Editar Usuario" : "Crear Usuario"}</DialogTitle>
        <DialogDescription>
          {user
            ? "Modifica los detalles del usuario. El estado se gestiona por separado."
            : (
                <div className="flex flex-col gap-1 text-xs">
                    <p>Ingresa los detalles del nuevo usuario. Se asignará el rol por defecto <Badge variant="secondary" className="text-xs mx-1">{formatProfileDisplayForm(defaultNewUserRole)}</Badge> si no se selecciona otro.</p>
                    <p className="font-semibold">Si se asigna el rol de <Badge variant="outline" className="text-xs mx-1">{formatProfileDisplayForm("administrador")}</Badge>, el nuevo administrador deberá <span className="text-destructive">volver a iniciar sesión</span> para que sus privilegios completos tomen efecto.</p>
                </div>
            )
          }
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-3">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="name" className="text-right">Nombre</Label>
          <Input id="name" value={nombre} onChange={e => setNombre(e.target.value)} className="col-span-3" required/>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="cedula" className="text-right">Cédula</Label>
          <Input id="cedula" value={cedula} onChange={e => setCedula(e.target.value.replace(/\D/g, ''))} maxLength={10} className="col-span-3" required placeholder="10 dígitos numéricos"/>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="email" className="text-right">Email</Label>
          <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="col-span-3" required disabled={!!user}/>
        </div>
        {!user && (
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="newPassword" className="text-right">Contraseña</Label>
             <Input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="col-span-3" required={!user} placeholder="Mínimo 6 caracteres"/>
           </div>
        )}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="numeroRol" className="text-right">Nº Rol (RRHH)</Label>
          <Input id="numeroRol" value={numeroRol} onChange={e => setNumeroRol(e.target.value)} className="col-span-3" placeholder="ID de empleado (opcional)"/>
        </div>
         {user && (
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Estado</Label>
            <Input id="status" value={user.estado} className="col-span-3" disabled />
          </div>
         )}
        <div className="grid grid-cols-4 items-start gap-4">
          <Label className="text-right pt-2">Habilidades</Label>
          <ScrollArea className="col-span-3 h-32 rounded-md border p-2">
            <div className="space-y-2">
              {allSkillOptions.map(skill => (
                <div key={skill} className="flex items-center space-x-2">
                  <Checkbox
                    id={`skill-${skill}`}
                    checked={selectedSkills.includes(skill)}
                    onCheckedChange={() => handleSkillChange(skill)}
                  />
                  <Label htmlFor={`skill-${skill}`} className="font-normal cursor-pointer">{skill}</Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
         <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Perfiles</Label>
            <ScrollArea className="col-span-3 h-32 rounded-md border p-2">
                <div className="space-y-2">
                {allProfileOptions.map(perfil => (
                    <div key={perfil} className="flex items-center space-x-2">
                    <Checkbox
                        id={`perfil-${perfil}`}
                        checked={selectedPerfiles.includes(perfil)}
                        onCheckedChange={() => handlePerfilChange(perfil)}
                    />
                    <Label htmlFor={`perfil-${perfil}`} className="font-normal cursor-pointer">{formatProfileDisplayForm(perfil)}</Label>
                    </div>
                ))}
                </div>
            </ScrollArea>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Guardar</Button>
      </DialogFooter>
    </form>
  );
};

if (Icons && !(Icons as any).login) {
  (Icons as any).login = Icons.logOut;
}
