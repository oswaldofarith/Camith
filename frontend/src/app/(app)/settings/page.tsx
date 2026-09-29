
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import type { AppSettingOption, AppSettingsState, Localidad } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as AlertDialogContentComponent,
  AlertDialogDescription as AlertDialogDescriptionComponent,
  AlertDialogFooter as AlertDialogFooterComponent,
  AlertDialogHeader as AlertDialogHeaderComponent,
  AlertDialogTitle as AlertDialogTitleComponent,
} from "@/components/ui/alert-dialog";
import { getAppSettings, saveAppSettings } from "@/services/settingsService";
import { useToast } from "@/hooks/use-toast";

interface SettingCategory {
  id: keyof Omit<AppSettingsState, 'empresaNombre' | 'empresaUnidadNegocio' | 'empresaDepartamento' | 'sedeCentralNombre' | 'sedeCentralLatitud' | 'sedeCentralLongitud' | 'tiposEquipos' | 'operatingHoursStart' | 'operatingHoursEnd' | 'timezone' | 'planningTimeMinutes' | 'reportingTimeMinutes' | 'lunchTimeMinutes' | 'lunchStartTime' | 'lunchEndTime' | 'localidades'>; 
  title: string;
  items: AppSettingOption[];
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettingsState>({ marcasEquipos: [], zonasEquipos: [], tiposEquipos: [], estadosEquipos: [], tiposVehiculos: [], estadosVehiculos: [], urgenciasSolicitudes: [], respuestasPredefinidasSolicitudes: [] });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSubmittingGeneral, setIsSubmittingGeneral] = useState(false);

  // General Inputs
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [sedeCentralNombre, setSedeCentralNombre] = useState("");
  const [sedeCentralLat, setSedeCentralLat] = useState("");
  const [sedeCentralLng, setSedeCentralLng] = useState("");

  // Modals
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [newItemValue, setNewItemValue] = useState("");
  const [newItemLabel, setNewItemLabel] = useState("");

  const [isLocalidadModalOpen, setIsLocalidadModalOpen] = useState(false);
  const [editingLocalidad, setEditingLocalidad] = useState<Localidad | null>(null);
  const [newLocNombre, setNewLocNombre] = useState("");
  const [newLocLat, setNewLocLat] = useState("");
  const [newLocLng, setNewLocLng] = useState("");

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{type: 'category' | 'localidad', key?: string, value: string} | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      setIsLoadingSettings(true);
      try {
        const fetched = await getAppSettings();
        if (fetched) {
          setSettings(fetched);
          setEmpresaNombre(fetched.empresaNombre || "");
          setSedeCentralNombre(fetched.sedeCentralNombre || "");
          setSedeCentralLat(fetched.sedeCentralLatitud?.toString() || "");
          setSedeCentralLng(fetched.sedeCentralLongitud?.toString() || "");
        }
      } catch (e) {
        toast({ title: "Error al cargar configuración", variant: "destructive" });
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetch();
  }, [toast]);

  const handleSaveGeneral = async () => {
    setIsSubmittingGeneral(true);
    const updated = {
      ...settings,
      empresaNombre: empresaNombre.trim(),
      sedeCentralNombre: sedeCentralNombre.trim(),
      sedeCentralLatitud: parseFloat(sedeCentralLat),
      sedeCentralLongitud: parseFloat(sedeCentralLng),
    };
    try {
      await saveAppSettings(updated);
      setSettings(updated);
      toast({ title: "Configuración general guardada" });
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setIsSubmittingGeneral(false);
    }
  };

  const handleSaveLocalidad = async () => {
    let updatedLocalidades = [...(settings.localidades || [])];
    if (editingLocalidad) {
      updatedLocalidades = updatedLocalidades.map(l => l.id === editingLocalidad.id ? { ...l, nombre: newLocNombre, coordenadas: { latitude: parseFloat(newLocLat), longitude: parseFloat(newLocLng) } } : l);
    } else {
      updatedLocalidades.push({ id: `loc_${Date.now()}`, nombre: newLocNombre, coordenadas: { latitude: parseFloat(newLocLat), longitude: parseFloat(newLocLng) } });
    }
    const updated = { ...settings, localidades: updatedLocalidades };
    await saveAppSettings(updated);
    setSettings(updated);
    setIsLocalidadModalOpen(false);
    toast({ title: "Localidad guardada" });
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    let updated = { ...settings };
    if (itemToDelete.type === 'localidad') {
      updated.localidades = (settings.localidades || []).filter(l => l.id !== itemToDelete.value);
    } else if (itemToDelete.type === 'category' && itemToDelete.key) {
      const key = itemToDelete.key as any;
      updated[key] = (settings[key] as AppSettingOption[]).filter(i => i.value !== itemToDelete.value);
    }
    await saveAppSettings(updated);
    setSettings(updated);
    setIsConfirmDeleteOpen(false);
    toast({ title: "Ítem eliminado" });
  };

  const categoryConfigs: SettingCategory[] = [
    { id: "marcasEquipos", title: "Marcas de Equipos", items: settings.marcasEquipos },
    { id: "zonasEquipos", title: "Zonas de Equipos", items: settings.zonasEquipos },
    { id: "estadosEquipos", title: "Estados de Equipos", items: settings.estadosEquipos },
    { id: "tiposVehiculos", title: "Tipos de Vehículos", items: settings.tiposVehiculos },
    { id: "estadosVehiculos", title: "Estados de Vehículos", items: settings.estadosVehiculos },
  ];

  if (isLoadingSettings) return <div className="p-10 text-center"><Icons.loader className="animate-spin inline mr-2"/> Cargando...</div>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configuración" />

      <Card>
        <CardHeader><CardTitle>Identificación de la Empresa y Sede</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nombre de la Empresa</Label><Input value={empresaNombre} onChange={e => setEmpresaNombre(e.target.value)}/></div>
          <div><Label>Nombre de la Sede Central</Label><Input value={sedeCentralNombre} onChange={e => setSedeCentralNombre(e.target.value)} placeholder="Ej: Sede Principal Garzota"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Latitud</Label><Input type="number" value={sedeCentralLat} onChange={e => setSedeCentralLat(e.target.value)}/></div>
            <div><Label>Longitud</Label><Input type="number" value={sedeCentralLng} onChange={e => setSedeCentralLng(e.target.value)}/></div>
          </div>
        </CardContent>
        <CardFooter><Button onClick={handleSaveGeneral} disabled={isSubmittingGeneral}>{isSubmittingGeneral && <Icons.loader className="mr-2 animate-spin"/>} Guardar</Button></CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Localidades Adicionales</CardTitle><CardDescription>Ubicaciones extras de la empresa.</CardDescription></div>
          <Button size="sm" onClick={() => { setEditingLocalidad(null); setNewLocNombre(""); setNewLocLat(""); setNewLocLng(""); setIsLocalidadModalOpen(true); }}><Icons.add className="mr-2 h-4 w-4"/> Agregar</Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40 border rounded-md p-2">
            {(settings.localidades || []).map(loc => (
              <div key={loc.id} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                <div><p className="text-sm font-bold">{loc.nombre}</p><p className="text-xs text-muted-foreground">{loc.coordenadas.latitude}, {loc.coordenadas.longitude}</p></div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingLocalidad(loc); setNewLocNombre(loc.nombre); setNewLocLat(String(loc.coordenadas.latitude)); setNewLocLng(String(loc.coordenadas.longitude)); setIsLocalidadModalOpen(true); }}><Icons.edit className="h-4 w-4"/></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setItemToDelete({type: 'localidad', value: loc.id}); setIsConfirmDeleteOpen(true); }}><Icons.delete className="h-4 w-4"/></Button>
                </div>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {categoryConfigs.map(cat => (
          <Card key={cat.id}>
            <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-base">{cat.title}</CardTitle><Button size="sm" variant="outline" onClick={() => { setEditingCategoryKey(cat.id); setNewItemValue(""); setNewItemLabel(""); setIsCategoryModalOpen(true); }}><Icons.add className="h-4 w-4"/></Button></CardHeader>
            <CardContent><ScrollArea className="h-32 border rounded-md p-2">
              {cat.items.map(item => (
                <div key={item.value} className="flex items-center justify-between p-1.5 hover:bg-muted rounded">
                  <Badge variant="secondary">{item.label}</Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { setItemToDelete({type: 'category', key: cat.id, value: item.value}); setIsConfirmDeleteOpen(true); }}><Icons.delete className="h-3.5 w-3.5"/></Button>
                </div>
              ))}
            </ScrollArea></CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isLocalidadModalOpen} onOpenChange={setIsLocalidadModalOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editingLocalidad ? "Editar Localidad" : "Agregar Localidad"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Nombre</Label><Input value={newLocNombre} onChange={e => setNewLocNombre(e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Latitud</Label><Input type="number" value={newLocLat} onChange={e => setLocLat(e.target.value)}/></div>
              <div><Label>Longitud</Label><Input type="number" value={newLocLng} onChange={e => setLocLng(e.target.value)}/></div>
            </div>
          </div>
          <DialogFooter><Button onClick={handleSaveLocalidad}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent><DialogHeader><DialogTitle>Añadir Ítem</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>ID (Valor)</Label><Input value={newItemValue} onChange={e => setNewItemValue(e.target.value)}/></div>
            <div><Label>Nombre (Etiqueta)</Label><Input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)}/></div>
          </div>
          <DialogFooter><Button onClick={async () => {
            const list = settings[editingCategoryKey as any] as AppSettingOption[];
            const updated = { ...settings, [editingCategoryKey as any]: [...list, { value: newItemValue.trim(), label: newItemLabel.trim() }] };
            await saveAppSettings(updated); setSettings(updated); setIsCategoryModalOpen(false);
          }}>Añadir</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <AlertDialogContentComponent><AlertDialogHeaderComponent><AlertDialogTitleComponent>Confirmar eliminación</AlertDialogTitleComponent><AlertDialogDescriptionComponent>Esta acción no se puede deshacer.</AlertDialogDescriptionComponent></AlertDialogHeaderComponent>
          <AlertDialogFooterComponent><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive">Eliminar</AlertDialogAction></AlertDialogFooterComponent>
        </AlertDialogContentComponent>
      </AlertDialog>
    </div>
  );
}
