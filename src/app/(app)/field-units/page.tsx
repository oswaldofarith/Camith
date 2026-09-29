
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import type { UnidadDeCampo, UserProfile, Vehiculo, UserSkill } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { getVehiculos } from "@/services/vehicleService";
import { getUsers } from "@/services/userService";
import { getSavedFieldUnitCompositions, saveFieldUnitCompositions } from "@/services/fieldUnitService";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; 

interface TechnicianItemProps {
  technician: UserProfile;
  isAssigned?: boolean;
  onDragStart: (e: React.DragEvent, techId: string, sourceUnitId?: string) => void;
}

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

function TechnicianItem({ technician, isAssigned = false, onDragStart, }: TechnicianItemProps) {
  const getDriverTypeLabel = (skills?: UserSkill[]): string => {
    if (!skills) return "";
    if (skills.includes("Conductor tipo D")) return "(D)";
    if (skills.includes("Conductor tipo C")) return "(C)";
    return "";
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, technician.id, isAssigned ? (e.currentTarget.closest('[data-unit-id]')?.getAttribute('data-unit-id') || undefined) : undefined)}
      className="p-2 mb-2 border rounded-md shadow-sm cursor-grab bg-card hover:shadow-lg active:cursor-grabbing flex items-center gap-2"
      data-tech-id={technician.id}
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={technician.fotoUrl} alt={technician.nombre} data-ai-hint="avatar" />
        <AvatarFallback>{getInitials(technician.nombre)}</AvatarFallback>
      </Avatar>
      <div className="flex-grow">
        <p className="text-sm font-medium">{technician.nombre} {getDriverTypeLabel(technician.habilidades)}</p>
        {!isAssigned && technician.habilidades && (
          <div className="flex flex-wrap gap-1 mt-1">
            {technician.habilidades.map(skill => <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>)}
          </div>
        )}
      </div>
    </div>
  );
}


export default function FieldUnitsPage() {
  const [unitsForToday, setUnitsForToday] = useState<UnidadDeCampo[]>([]);
  const [availableTechnicians, setAvailableTechnicians] = useState<UserProfile[]>([]);
  
  const [availableVehicles, setAvailableVehicles] = useState<Vehiculo[]>([]); 
  const [allFieldTechnicians, setAllFieldTechnicians] = useState<UserProfile[]>([]); 

  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedVehicles, fetchedUsers, savedCompositions] = await Promise.all([
        getVehiculos(),
        getUsers(),
        getSavedFieldUnitCompositions(),
      ]);

      const activeFieldTechs = fetchedUsers.filter(u => u.perfiles.includes("tecnicoDeCampo") && u.estado === "activo");
      setAllFieldTechnicians(activeFieldTechs);

      const currentAvailableVehicles = fetchedVehicles.filter(v => v.estado === 'disponible');
      setAvailableVehicles(currentAvailableVehicles); 

      const activeFieldTechIds = new Set(activeFieldTechs.map(t => t.id));
      let initialUnits: UnidadDeCampo[] = [];
      const processedVehicleIds = new Set<string>();

      savedCompositions.forEach(comp => {
        const vehicle = currentAvailableVehicles.find(v => v.id === comp.vehiculoId);
        if (vehicle) { 
          const validTechnicians = comp.tecnicos.filter(techId => activeFieldTechIds.has(techId));
          initialUnits.push({ ...comp, id: vehicle.id, vehiculoId: vehicle.id, tecnicos: validTechnicians });
          processedVehicleIds.add(vehicle.id);
        }
      });

      currentAvailableVehicles.forEach(vehicle => {
        if (!processedVehicleIds.has(vehicle.id)) {
          let initialTechs: string[] = [];
          if (vehicle.custodioId && activeFieldTechIds.has(vehicle.custodioId)) {
            initialTechs.push(vehicle.custodioId);
          }
          initialUnits.push({
            id: vehicle.id,
            vehiculoId: vehicle.id,
            tecnicos: initialTechs,
          });
        }
      });
      
      setUnitsForToday(initialUnits);

      const assignedTechIdsInUnitsForToday = new Set(initialUnits.flatMap(u => u.tecnicos));
      setAvailableTechnicians(activeFieldTechs.filter(t => !assignedTechIdsInUnitsForToday.has(t.id)).sort((a,b) => a.nombre.localeCompare(b.nombre)));

    } catch (error) {
      console.error("Error fetching initial data for Field Units:", error);
      toast({ title: "Error de Carga", description: "No se pudieron cargar los datos iniciales para las unidades de campo.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDragStart = (e: React.DragEvent, techId: string, sourceUnitId?: string) => {
    e.dataTransfer.setData("techId", techId);
    if (sourceUnitId) {
      e.dataTransfer.setData("sourceUnitId", sourceUnitId);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnUnit = (e: React.DragEvent, targetUnitId: string) => {
    e.preventDefault();
    const techId = e.dataTransfer.getData("techId");
    const sourceUnitId = e.dataTransfer.getData("sourceUnitId");

    setUnitsForToday(prevUnits =>
      prevUnits.map(unit => {
        if (unit.id === sourceUnitId && unit.id !== targetUnitId) {
          return { ...unit, tecnicos: unit.tecnicos.filter(id => id !== techId) };
        }
        if (unit.id === targetUnitId && !unit.tecnicos.includes(techId)) {
          return { ...unit, tecnicos: [...unit.tecnicos, techId] };
        }
        return unit;
      })
    );

    if (sourceUnitId && sourceUnitId !== targetUnitId) { 
    } else if (!sourceUnitId) { 
        setAvailableTechnicians(prevAvailable => prevAvailable.filter(t => t.id !== techId));
    }
  };
  
  const handleDropOnAvailablePool = (e: React.DragEvent) => {
    e.preventDefault();
    const techId = e.dataTransfer.getData("techId");
    const sourceUnitId = e.dataTransfer.getData("sourceUnitId");

    if (sourceUnitId) { 
      const tech = allFieldTechnicians.find(t => t.id === techId);
      if (tech && !availableTechnicians.some(t => t.id === techId)) {
        setAvailableTechnicians(prev => [...prev, tech].sort((a,b) => a.nombre.localeCompare(b.nombre)));
      }
      setUnitsForToday(prevUnits =>
        prevUnits.map(unit =>
          unit.id === sourceUnitId
            ? { ...unit, tecnicos: unit.tecnicos.filter(id => id !== techId) }
            : unit
        )
      );
    }
  };

  const validateAndSaveChanges = async () => {
    const validationErrors: string[] = [];
    unitsForToday.forEach(unit => {
      const vehicle = availableVehicles.find(v => v.id === unit.vehiculoId); 
      if (!vehicle) { 
        validationErrors.push(`Vehículo ${unit.vehiculoId} no encontrado o no disponible para la unidad ${unit.id}.`);
        return;
      }
      
      if (unit.tecnicos.length < 1 || unit.tecnicos.length > 4) {
        validationErrors.push(`Unidad ${vehicle.id} (Placa: ${vehicle.placa}): Debe tener entre 1 y 4 técnicos.`);
      }

      const assignedTechDetails = unit.tecnicos.map(tid => allFieldTechnicians.find(t => t.id === tid)).filter(Boolean) as UserProfile[];
      
      let hasRequiredDriver = false;
      if (vehicle.tipo === "camionetaCabinaSimple" || vehicle.tipo === "camionetaCabinaDoble") {
        hasRequiredDriver = assignedTechDetails.some(tech => tech.habilidades?.includes("Conductor tipo C") || tech.habilidades?.includes("Conductor tipo D"));
        if (!hasRequiredDriver) {
          validationErrors.push(`Unidad ${vehicle.id} (Placa: ${vehicle.placa}): Requiere un conductor con licencia tipo C o D.`);
        }
      } else if (vehicle.tipo === "camionCanasta") {
        hasRequiredDriver = assignedTechDetails.some(tech => tech.habilidades?.includes("Conductor tipo D"));
        if (!hasRequiredDriver) {
          validationErrors.push(`Unidad ${vehicle.id} (Placa: ${vehicle.placa}, Canasta): Requiere un conductor con licencia tipo D.`);
        }
      }
    });

    if (validationErrors.length > 0) {
      toast({
        title: "Errores de Validación",
        description: (
          <ul className="list-disc list-inside">
            {validationErrors.map((err, i) => <li key={i} className="text-xs">{err}</li>)}
          </ul>
        ),
        variant: "destructive",
        duration: 7000,
      });
      return;
    }

    try {
      setIsLoading(true);
      const compositionsToSave = unitsForToday.filter(unit => {
          const vehicle = availableVehicles.find(v => v.id === unit.vehiculoId);
          return vehicle; 
      });

      await saveFieldUnitCompositions(compositionsToSave);
      toast({ title: "Composiciones Guardadas", description: "Las unidades de campo predeterminadas han sido actualizadas." });
    } catch (error) {
      console.error("Error saving field unit compositions:", error);
      toast({ title: "Error al Guardar", description: "No se pudieron guardar las composiciones predeterminadas.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const getVehicleTypeDisplay = (type: Vehiculo["tipo"]) => {
    switch(type) {
        case "camionetaCabinaSimple": return "Cam. Cab. Simple";
        case "camionetaCabinaDoble": return "Cam. Cab. Doble";
        case "camionCanasta": return "Camión Canasta";
        default: return type;
    }
  };
  
  const getVehicleIcon = (type: Vehiculo["tipo"]) => {
    if (type === "camionCanasta") {
      return (
        <svg 
          width="24" 
          height="24" 
          viewBox="0 0 800 600" 
          xmlns="http://www.w3.org/2000/svg" 
          className="ml-1 text-red-500"
        >
          <path 
            fill="currentColor" 
            d="m222.66628,488.00541c48.03605,-14.50304 67.32733,57.48186 21.38949,71.05492c-46.91393,13.86513 -69.11811,-56.64411 -21.38949,-71.05492zm375.16539,-0.34586c48.33579,-13.65761 66.28206,59.34181 19.76779,71.72359c-47.23673,12.5816 -67.11981,-58.35035 -19.76779,-71.72359zm-437.89662,-223.23313c5.11104,-1.38344 126.48468,-1.59095 135.44629,-0.27669l0.0538,90.84578c-10.99833,5.21095 -58.58861,14.15718 -74.83632,17.9309l-75.48961,17.03166l14.82585,-125.53165zm333.83133,129.25924l-155.45234,0c-2.25193,-8.01626 -1.39112,-136.91427 -1.16824,-161.27815l-171.40031,0.30743c-20.28274,2.3211 -32.65683,17.33909 -36.49203,37.22986c-3.95817,20.52869 -7.92403,41.2572 -11.85145,61.91655c-3.12042,16.43217 -10.67553,46.6065 -10.75239,62.07026c-0.1076,24.11025 0.03074,48.26662 0.03074,72.37688c-1.85227,3.05125 -0.00769,0.76089 -3.25877,2.36722c-0.77626,0.38429 -2.31342,0.65329 -3.89668,1.41418c-2.69002,1.29889 -3.28182,2.4287 -5.06492,4.38857l0,22.32716c8.05468,8.23146 14.61833,5.77201 30.9967,5.7797c11.97443,0 25.29386,-0.55338 37.10689,0.20752c-4.158,27.87628 -3.4586,42.06421 10.76776,62.84652c18.00775,26.30838 39.93525,26.48516 49.24271,31.11199l20.42877,0c14.93345,-6.92488 32.41857,-5.54144 49.627,-30.46638c14.6875,-21.26652 15.66359,-35.06247 11.28271,-63.55361l233.1862,-0.14603c-4.08883,27.75331 -3.53545,42.35627 10.80619,63.00024c5.40309,7.77031 11.96674,14.46462 20.32117,19.72937c14.34933,9.03846 22.4117,8.11617 28.86774,11.43642l20.45183,0c4.12726,-1.9445 10.23744,-2.51325 15.07179,-4.25023c13.01969,-4.66526 21.39718,-10.97528 30.11284,-20.23663c19.51416,-20.75157 19.46805,-42.24098 15.80962,-69.54083l27.0001,-0.14603l0,-108.89196l-125.91594,0l81.69203,-65.85166l0,-7.64734c-72.79959,-91.42989 -121.3429,-168.77178 -194.4653,-259.98647l-106.95515,0.09991l5.89498,-57.05145l-129.19007,0l17.36215,166.46605l94.51189,-0.23057l7.73957,-70.66295l61.00963,0l161.27815,218.6063l-84.73559,76.25819z"
          />
        </svg>
      );
    } else if (type === "camionetaCabinaSimple") {
      return (
        <svg
          width="24"
          height="24"
          viewBox="0 0 1897.44 977.19"
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 ml-1 text-blue-500" 
          style={{ shapeRendering: 'geometricPrecision', textRendering: 'geometricPrecision', imageRendering: 'optimizeQuality', fillRule: 'evenodd', clipRule: 'evenodd' }}
        >
          <path
            fill="currentColor"
            d="M1376.23 815.45c0.61,89.43 73.28,161.74 162.85,161.74 89.83,0 162.67,-72.72 162.86,-162.51 39.93,0.48 91.75,1.28 114.01,1.28 45.61,0 81.44,-35.83 81.44,-81.44l0 -55.37c1.63,-45.6 -34.2,-81.43 -79.81,-81.43l0 -135.18c0,-45.6 -35.83,-81.43 -81.43,-81.43l-350.16 0 -120.52 -273.62c-24.43,-58.63 -94.46,-105.86 -154.72,-105.86l-255.39 -1.63c-45.6,0 -81.44,35.83 -81.44,81.43l0 298.05 -692.49 0 0 218.24c-45.6,0 -81.43,35.83 -81.43,81.43l0 55.37c0,45.61 35.83,81.44 81.43,81.44 76.42,0 151.58,-1.63 226.39,-1.63 0,89.95 72.92,162.86 162.86,162.86 89.95,0 162.87,-72.91 162.87,-162.86 246.77,0 495.21,0.65 742.68,1.12zm-511.82 -706.28l255 0c25.21,6.01 43.22,20.08 55.38,40.71l100.97 229.64 -411.35 0 0 -270.35zm-393.73 608.3c49.68,0 89.96,40.27 89.96,89.95 0,49.69 -40.28,89.96 -89.96,89.96 -49.68,0 -89.96,-40.27 -89.96,-89.96 0,-49.68 40.28,-89.95 89.96,-89.95zm1068.4 6.9c49.68,0 89.96,40.28 89.96,89.96 0,49.68 -40.28,89.96 -89.96,89.96 -49.68,0 -89.96,-40.28 -89.96,-89.96 0,-49.68 40.28,-89.96 89.96,-89.96z"
          />
        </svg>
      );
    } else if (type === "camionetaCabinaDoble") {
      return (
         <svg 
            width="24" 
            height="24" 
            viewBox="0 0 1956.19 1007.45"
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6 ml-1 text-muted-foreground"
            style={{ shapeRendering: 'geometricPrecision', textRendering: 'geometricPrecision', imageRendering: 'optimizeQuality', fillRule: 'evenodd', clipRule: 'evenodd' }}
          >
            <path 
              fill="currentColor" 
              d="M1418.85 840.7c0.62,92.2 75.54,166.75 167.89,166.75 92.61,0 167.7,-74.98 167.9,-167.54 41.16,0.49 94.59,1.31 117.54,1.31 47.02,0 83.96,-36.93 83.96,-83.95l0 -57.09c1.68,-47.01 -35.26,-83.95 -82.28,-83.95l0 -139.37c0,-47.01 -36.94,-83.95 -83.95,-83.95l-361 0 -124.26 -282.09c-25.19,-60.45 -97.39,-109.14 -159.51,-109.14l-53.73 0 -427.88 -1.68c-47.01,0 -83.95,36.94 -83.95,83.95l0 307.28 -495.63 0 0 225c-47.01,0 -83.95,36.94 -83.95,83.95l0 57.09c0,47.02 36.94,83.95 83.95,83.95 78.78,0 156.28,-1.67 233.4,-1.67 0,92.73 75.18,167.9 167.9,167.9 92.74,0 167.92,-75.17 167.92,-167.9 254.41,0 510.54,0.66 765.68,1.15zm-461.51 -728.15l196.73 0c26,6.2 44.56,20.7 57.09,41.97l104.1 236.76 -357.92 0 0 -278.73zm-265.26 -1.73l205.02 0 0 278.73 -205.02 0 0 -278.73zm-206.83 628.86c51.22,0 92.75,41.52 92.75,92.74 0,51.23 -41.53,92.75 -92.75,92.75 -51.22,0 -92.74,-41.52 -92.74,-92.75 0,-51.22 41.52,-92.74 92.74,-92.74zm1101.49 7.12c51.22,0 92.74,41.52 92.74,92.74 0,51.22 -41.52,92.75 -92.74,92.75 -51.22,0 -92.75,-41.53 -92.75,-92.75 0,-51.22 41.53,-92.74 92.75,-92.74z"
            />
        </svg>
      );
    }
    return <Icons.vehicles className="h-6 w-6 ml-1 text-muted-foreground" />;
  };


  if (isLoading && unitsForToday.length === 0 && availableTechnicians.length === 0) {
    return (
      <div className="flex flex-col gap-6 h-full">
        <PageHeader title="Unidades de Campo" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col gap-6 h-full">
      <PageHeader title="Configurar Unidades de Campo (Predeterminadas)">
        <Button onClick={validateAndSaveChanges} disabled={isLoading}>
          {isLoading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin"/> : <Icons.save className="mr-2 h-4 w-4" />}
          Guardar Composiciones Predeterminadas
        </Button>
      </PageHeader>

      <div className="grid md:grid-cols-[300px_1fr] gap-6 flex-grow overflow-hidden">
        <Card 
            className="flex flex-col"
            onDragOver={handleDragOver}
            onDrop={handleDropOnAvailablePool}
        >
          <CardHeader>
            <CardTitle>Técnicos de Campo Disponibles ({availableTechnicians.length})</CardTitle>
            <CardDescription>Arrastre técnicos a las unidades para la configuración predeterminada.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow overflow-y-auto p-2">
            <ScrollArea className="h-[calc(100vh-280px)] pr-2"> 
              {availableTechnicians.length > 0 ? (
                availableTechnicians.map(tech => (
                  <TechnicianItem key={tech.id} technician={tech} onDragStart={handleDragStart} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay técnicos de campo activos y disponibles.</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Unidades de Campo Predeterminadas ({unitsForToday.length})</CardTitle>
            <CardDescription>Define la composición estándar de las unidades.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow overflow-y-auto p-2">
            <ScrollArea className="h-[calc(100vh-280px)]"> 
              <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {unitsForToday.map(unit => {
                const vehicle = availableVehicles.find(v => v.id === unit.vehiculoId); 
                if (!vehicle) return null; 

                return (
                  <Card 
                    key={unit.id} 
                    data-unit-id={unit.id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnUnit(e, unit.id)}
                    className="flex flex-col min-h-[150px]" 
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>Unidad: {vehicle.id}</span>
                        {getVehicleIcon(vehicle.tipo)}
                      </CardTitle>
                      <CardDescription>{getVehicleTypeDisplay(vehicle.tipo)} - Placa: {vehicle.placa}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow p-2 border-t border-dashed">
                      {unit.tecnicos.length > 0 ? (
                        unit.tecnicos.map(techId => {
                          const tech = allFieldTechnicians.find(t => t.id === techId); 
                          return tech ? <TechnicianItem key={tech.id} technician={tech} isAssigned={true} onDragStart={handleDragStart} /> : <p key={techId} className="text-xs text-red-500">Técnico ID: {techId} no encontrado o inactivo</p>;
                        })
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">Arrastre técnicos aquí</p>
                      )}
                    </CardContent>
                     <CardFooter className="p-2 mt-auto">
                        <Badge variant={ (unit.tecnicos.length < 1 || unit.tecnicos.length > 4) ? "destructive" : "outline" } className="text-xs">
                            {unit.tecnicos.length} / 4 Técnicos
                        </Badge>
                    </CardFooter>
                  </Card>
                );
              })}
              {unitsForToday.length === 0 && !isLoading && (
                 <p className="text-sm text-muted-foreground text-center py-4 col-span-full">No hay vehículos disponibles para conformar unidades. Verifique la página de Vehículos.</p>
              )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
