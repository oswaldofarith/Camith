

"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icons } from "@/components/icons";
import type { Equipo, GeoPoint, AppSettingsState, AppSettingOption, OrdenDeTrabajo, Trabajo } from "@/types"; // Import AppSettingsState
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parse, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getEquipos, addEquipo, updateEquipo } from "@/services/equipmentService"; 
import { getAppSettings } from "@/services/settingsService"; // Import settings service
import { getWorkOrders } from "@/services/workOrderService"; // Import work order service
import { Timestamp } from "firebase/firestore";
import * as XLSX from 'xlsx';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area"; 
import { cn } from "@/lib/utils"; 


const BOOLEAN_FILTER_OPTIONS: { value: "any" | "yes" | "no"; label: string }[] = [
  { value: "any", label: "Todos" },
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
];

const ALL_ITEMS_FILTER_VALUE = "__ALL_ITEMS__";


export default function EquipmentPage() {
  const [equipmentList, setEquipmentList] = useState<Equipo[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<OrdenDeTrabajo[]>([]);
  const [filteredEquipmentList, setFilteredEquipmentList] = useState<Equipo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipo | null>(null);
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { userProfile } = useAuth(); 

  // Filter states
  const [searchText, setSearchText] = useState("");
  const [selectedTipo, setSelectedTipo] = useState<string>(""); 
  const [selectedMarca, setSelectedMarca] = useState<string>(""); 
  const [selectedEstadoEquipo, setSelectedEstadoEquipo] = useState<string>("");
  const [filterRequiereCanasta, setFilterRequiereCanasta] = useState<"any" | "yes" | "no">("any");
  const [filterZonaPeligrosa, setFilterZonaPeligrosa] = useState<"any" | "yes" | "no">("any");

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      setIsLoadingSettings(true);
      try {
        const [equipos, settings, workOrders] = await Promise.all([
          getEquipos(),
          getAppSettings(),
          getWorkOrders(),
        ]);
        setEquipmentList(equipos);
        setAppSettings(settings);
        setAllWorkOrders(workOrders);
      } catch (error) {
        toast({
          title: "Error al cargar datos iniciales",
          description: "No se pudieron obtener equipos, configuraciones u órdenes de trabajo. Verifique la consola.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
        setIsLoadingSettings(false);
      }
    };
    fetchInitialData();
  }, [toast]);

  const lastRevisionDates = useMemo(() => {
    const datesMap = new Map<string, Date>();
    allWorkOrders.forEach(order => {
      order.trabajos.forEach(job => {
        if (job.estado === "Completado" && job.fechaFinalizacion) {
          const currentDate = datesMap.get(job.equipoId);
          const jobDate = job.fechaFinalizacion instanceof Timestamp ? job.fechaFinalizacion.toDate() : (typeof job.fechaFinalizacion === 'string' ? parseISO(job.fechaFinalizacion) : job.fechaFinalizacion);
          if (isValid(jobDate)) {
            if (!currentDate || jobDate > currentDate) {
              datesMap.set(job.equipoId, jobDate);
            }
          }
        }
      });
    });
    return datesMap;
  }, [allWorkOrders]);

  useEffect(() => {
    let tempFiltered = [...equipmentList];

    if (searchText.trim()) {
      const lowerSearchText = searchText.toLowerCase();
      tempFiltered = tempFiltered.filter(
        (eq) =>
          eq.id.toLowerCase().includes(lowerSearchText) ||
          eq.direccion.toLowerCase().includes(lowerSearchText) ||
          (eq.marca && eq.marca.toLowerCase().includes(lowerSearchText)) ||
          (eq.tipo && eq.tipo.toLowerCase().includes(lowerSearchText)) ||
          (eq.ip && eq.ip.toLowerCase().includes(lowerSearchText)) ||
          (eq.zona && eq.zona.toLowerCase().includes(lowerSearchText))
      );
    }

    if (selectedTipo) {
      tempFiltered = tempFiltered.filter((eq) => eq.tipo === selectedTipo);
    }

    if (selectedMarca) {
      tempFiltered = tempFiltered.filter((eq) => eq.marca === selectedMarca);
    }

    if (selectedEstadoEquipo) {
      tempFiltered = tempFiltered.filter((eq) => eq.estado === selectedEstadoEquipo);
    }

    if (filterRequiereCanasta !== "any") {
      const requires = filterRequiereCanasta === "yes";
      tempFiltered = tempFiltered.filter((eq) => eq.requiereCanasta === requires);
    }

    if (filterZonaPeligrosa !== "any") {
      const dangerous = filterZonaPeligrosa === "yes";
      tempFiltered = tempFiltered.filter((eq) => eq.zonaPeligrosa === dangerous);
    }

    setFilteredEquipmentList(tempFiltered);
  }, [searchText, selectedTipo, selectedMarca, selectedEstadoEquipo, filterRequiereCanasta, filterZonaPeligrosa, equipmentList]);


  const handleClearFilters = () => {
    setSearchText("");
    setSelectedTipo("");
    setSelectedMarca("");
    setSelectedEstadoEquipo("");
    setFilterRequiereCanasta("any");
    setFilterZonaPeligrosa("any");
  };

  const handleAddEquipment = () => {
    setEditingEquipment(null);
    setIsAddModalOpen(true);
  };

  const handleEditEquipment = (equipment: Equipo) => {
    setEditingEquipment(equipment);
    setIsAddModalOpen(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleDownloadTemplate = () => {
    const columnHeaders = "identificacion,tipo,direccion,marca,estado,requiereCanasta,zonaPeligrosa,ip,tipoComunicacion,piloto,latitud,longitud,zona,fechaUltimaRevision (YYYY-MM-DD),revisionCount,proximoMantenimientoProgramado (YYYY-MM-DD),intervaloMantenimientoDias,intervaloMantenimientoRevisiones";
    toast({
      title: "Plantilla de Importación",
      description: (
        <div className="flex flex-col gap-2">
          <p>Asegúrate de que tu archivo Excel tenga las siguientes columnas (el orden no importa, pero los nombres sí):</p>
          <pre className="text-xs bg-muted p-2 rounded-md whitespace-pre-wrap">{columnHeaders}</pre>
          <p className="text-xs">Notas:
            <br />- `tipo`: Debe ser uno de los tipos configurados (Ej: "Colector", "Repetidor", "Medidor").
            <br />- `marca`: Debe ser una de las marcas configuradas (Ej: "Honeywell", "Itron").
            <br />- `zona`: Debe ser una de las zonas configuradas (Ej: "Norte", "Sur").
            <br />- `estado`: Debe ser uno de los estados configurados (Ej: "Activo", "Dado de baja"). (Si se omite, se asume "Activo").
            <br />- `requiereCanasta` y `zonaPeligrosa`: Usar TRUE/FALSE.
            <br />- `fechaUltimaRevision` y `proximoMantenimientoProgramado`: Formato YYYY-MM-DD o dejar en blanco.
            <br />- `revisionCount`, `intervaloMantenimientoDias`, `intervaloMantenimientoRevisiones`: Número o dejar en blanco.
            <br />- `latitud` y `longitud`: Deben ser números.
          </p>
        </div>
      ),
      duration: 15000,
    });
  };

  const handleImportExcel = async () => {
    if (!selectedFile) {
      toast({ title: "Error", description: "Por favor, seleccione un archivo Excel.", variant: "destructive" });
      return;
    }
    if (!appSettings) {
      toast({ title: "Error", description: "Configuraciones no cargadas. Intente de nuevo.", variant: "destructive" });
      return;
    }
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        if (!data) {
          throw new Error("No se pudo leer el archivo.");
        }
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

        if (jsonData.length < 2) {
          throw new Error("El archivo Excel está vacío o no tiene datos después de las cabeceras.");
        }

        const headers = jsonData[0].map(h => String(h).trim().toLowerCase());
        const requiredHeaders = ['identificacion', 'tipo', 'direccion', 'marca', 'tipocomunicacion', 'latitud', 'longitud', 'zona']; 
        
        for (const reqHeader of requiredHeaders) {
            if (!headers.includes(reqHeader)) {
                throw new Error(`Falta la columna requerida: ${reqHeader}. Las cabeceras deben coincidir (insensible a mayúsculas): identificacion, tipo, direccion, ip, tipoComunicacion, piloto, latitud, longitud, marca, zona, estado, fechaUltimaRevision, revisionCount, requiereCanasta, zonaPeligrosa, proximoMantenimientoProgramado, intervaloMantenimientoDias, intervaloMantenimientoRevisiones.`);
            }
        }

        const equiposParaImportar: { id: string; data: Omit<Equipo, 'id' | 'fechaUltimaRevision' | 'revisionCount' | 'estadoHistorial'> & { fechaUltimaRevision?: Date | null, revisionCount?: number, estadoHistorial?: any[], proximoMantenimientoProgramado?: Date | null, intervaloMantenimientoDias?: number | null, intervaloMantenimientoRevisiones?: number | null } }[] = [];
        const errors: string[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const rowData: any = {};
          headers.forEach((header, index) => {
            rowData[header] = row[index];
          });

          const identificacion = String(rowData.identificacion || "").trim();
          if (!identificacion) {
            errors.push(`Fila ${i + 1}: 'identificacion' es requerida.`);
            continue;
          }

          const tipoInput = String(rowData.tipo || "");
          const tipo = appSettings.tiposEquipos.find(t => t.label.toLowerCase() === tipoInput.toLowerCase() || t.value.toLowerCase() === tipoInput.toLowerCase())?.value as Equipo["tipo"] | undefined;
          if (!tipo) {
            errors.push(`Fila ${i + 1} (${identificacion}): 'tipo' ("${tipoInput}") inválido. Valores válidos: ${appSettings.tiposEquipos.map(t => t.label).join(', ')}.`);
            continue;
          }
          
          const lat = parseFloat(String(rowData.latitud || ""));
          const lon = parseFloat(String(rowData.longitud || ""));
          if (isNaN(lat) || isNaN(lon)) {
             errors.push(`Fila ${i + 1} (${identificacion}): 'latitud' y 'longitud' deben ser números válidos.`);
             continue;
          }

          let fechaUltimaRevision: Date | null = null;
          if (rowData.fechaultimarevision && String(rowData.fechaultimarevision).trim() !== "") {
            const parsedDate = parse(String(rowData.fechaultimarevision), 'yyyy-MM-dd', new Date());
            if (isValid(parsedDate)) {
              fechaUltimaRevision = parsedDate;
            } else {
              errors.push(`Fila ${i + 1} (${identificacion}): 'fechaUltimaRevision' ("${rowData.fechaultimarevision}") no es una fecha válida (formato YYYY-MM-DD). Se omitirá.`);
            }
          }
          
          let proximoMantenimientoProgramado: Date | null = null;
          if (rowData.proximomantenimientoprogramado && String(rowData.proximomantenimientoprogramado).trim() !== "") {
            const parsedDate = parse(String(rowData.proximomantenimientoprogramado), 'yyyy-MM-dd', new Date());
            if (isValid(parsedDate)) {
              proximoMantenimientoProgramado = parsedDate;
            } else {
              errors.push(`Fila ${i + 1} (${identificacion}): 'proximoMantenimientoProgramado' ("${rowData.proximomantenimientoprogramado}") no es una fecha válida (formato YYYY-MM-DD). Se omitirá.`);
            }
          }

          const revisionCountInput = String(rowData.revisioncount || "").trim();
          const revisionCount = revisionCountInput === "" ? 0 : parseInt(revisionCountInput, 10);
          const intervaloMantenimientoDiasInput = String(rowData.intervalomantenimientodias || "").trim();
          const intervaloMantenimientoDias = intervaloMantenimientoDiasInput === "" ? null : parseInt(intervaloMantenimientoDiasInput, 10);
          const intervaloMantenimientoRevisionesInput = String(rowData.intervalomantenimientorevisiones || "").trim();
          const intervaloMantenimientoRevisiones = intervaloMantenimientoRevisionesInput === "" ? null : parseInt(intervaloMantenimientoRevisionesInput, 10);


          const estadoInput = String(rowData.estado || appSettings.estadosEquipos.find(e => e.value.toLowerCase() === "activo")?.value || "Activo").trim();
          const estado = appSettings.estadosEquipos.find(e => e.label.toLowerCase() === estadoInput.toLowerCase() || e.value.toLowerCase() === estadoInput.toLowerCase())?.value as Equipo["estado"] | undefined;
           if (!estado) {
             errors.push(`Fila ${i + 1} (${identificacion}): 'estado' ("${estadoInput}") inválido. Valores válidos: ${appSettings.estadosEquipos.map(e => e.label).join(', ')}. Se asumirá "Activo".`);
           }

          const marcaInput = String(rowData.marca || "");
          const marca = appSettings.marcasEquipos.find(m => m.label.toLowerCase() === marcaInput.toLowerCase() || m.value.toLowerCase() === marcaInput.toLowerCase())?.value as Equipo["marca"] | undefined;
          if (!marca) {
            errors.push(`Fila ${i + 1} (${identificacion}): 'marca' ("${marcaInput}") inválida. Valores válidos: ${appSettings.marcasEquipos.map(m => m.label).join(', ')}.`);
            continue;
          }

          const zonaInput = String(rowData.zona || "");
          const zona = appSettings.zonasEquipos.find(z => z.label.toLowerCase() === zonaInput.toLowerCase() || z.value.toLowerCase() === zonaInput.toLowerCase())?.value as Equipo["zona"] | undefined;
          if (!zona) {
            errors.push(`Fila ${i + 1} (${identificacion}): 'zona' ("${zonaInput}") inválida. Valores válidos: ${appSettings.zonasEquipos.map(z => z.label).join(', ')}.`);
            continue;
          }


          const equipoData: Omit<Equipo, 'id' | 'fechaUltimaRevision' | 'revisionCount' | 'estadoHistorial'> & { 
            fechaUltimaRevision?: Date | null, 
            revisionCount?: number, 
            estadoHistorial?: any[],
            proximoMantenimientoProgramado?: Date | null,
            intervaloMantenimientoDias?: number | null,
            intervaloMantenimientoRevisiones?: number | null 
          } = {
            tipo,
            direccion: String(rowData.direccion || ""),
            marca,
            estado: estado || appSettings.estadosEquipos.find(e => e.value.toLowerCase() === "activo")?.value || "Activo",
            requiereCanasta: String(rowData.requierecanasta || "FALSE").toUpperCase() === 'TRUE',
            zonaPeligrosa: String(rowData.zonapeligrosa || "FALSE").toUpperCase() === 'TRUE',
            ip: String(rowData.ip || ""),
            tipoComunicacion: String(rowData.tipocomunicacion || "Fibra óptica") as Equipo["tipoComunicacion"],
            piloto: String(rowData.piloto || ""),
            coordenadas: { latitude: lat, longitude: lon },
            zona,
            // Estos campos se inicializarán en el servicio addEquipo
            // fechaUltimaRevision: fechaUltimaRevision, 
            // revisionCount: isNaN(revisionCount) ? 0 : revisionCount,
            proximoMantenimientoProgramado,
            intervaloMantenimientoDias: isNaN(intervaloMantenimientoDias as number) ? null : intervaloMantenimientoDias,
            intervaloMantenimientoRevisiones: isNaN(intervaloMantenimientoRevisiones as number) ? null : intervaloMantenimientoRevisiones,

          };
          
          if (!equipoData.direccion) errors.push(`Fila ${i + 1} (${identificacion}): 'direccion' es requerida.`);
          if (!equipoData.tipoComunicacion) errors.push(`Fila ${i + 1} (${identificacion}): 'tipoComunicacion' es requerida.`);
          
          if (errors.length > 0 && errors.some(e => e.startsWith(`Fila ${i+1}`))) {
            continue; 
          }

          equiposParaImportar.push({ id: identificacion, data: equipoData });
        }
        
        if (equiposParaImportar.length === 0 && errors.length > 0) {
             toast({
                title: "Errores de Validación en el Archivo",
                description: (
                    <div className="max-h-40 overflow-y-auto">
                        <p>No se importaron equipos. Se encontraron los siguientes problemas:</p>
                        <ul className="list-disc list-inside text-xs">
                            {errors.slice(0, 10).map((err, idx) => <li key={idx}>{err}</li>)}
                            {errors.length > 10 && <li>Y {errors.length - 10} más errores...</li>}
                        </ul>
                    </div>
                ),
                variant: "destructive",
                duration: 10000
            });
            setIsImporting(false);
            return;
        }

        let successCount = 0;
        const importPromises = equiposParaImportar.map(async (equipoImp) => {
            try {
                // @ts-ignore // El servicio addEquipo ahora maneja la inicialización de historial, etc.
                await addEquipo(equipoImp.id, equipoImp.data);
                successCount++;
            } catch (err: any) {
                errors.push(`Equipo ${equipoImp.id}: ${err.message || "Error desconocido al guardar."}`);
            }
        });

        await Promise.allSettled(importPromises);
        
        const finalErrorCount = errors.length; 

        if (successCount > 0) {
          toast({
            title: "Importación Completada",
            description: `${successCount} equipo(s) importado(s) con éxito. ${finalErrorCount > 0 ? `${finalErrorCount} fila(s) con errores.` : ''}`,
          });
           const fetchedEquipos = await getEquipos();
           setEquipmentList(fetchedEquipos);
        }
        if (finalErrorCount > 0) {
             toast({
                title: "Errores Durante la Importación",
                description: (
                    <div className="max-h-40 overflow-y-auto">
                        <p>Algunos equipos no pudieron ser importados o tuvieron errores de validación:</p>
                        <ul className="list-disc list-inside text-xs ">
                            {errors.slice(0, 10).map((err, idx) => <li key={idx}>{err}</li>)}
                            {errors.length > 10 && <li>Y {errors.length - 10} más errores...</li>}
                        </ul>
                    </div>
                ),
                variant: "destructive",
                duration: 10000
            });
        }
        setIsImportModalOpen(false);
      } catch (error: any) {
        console.error("Error importing Excel:", error);
        toast({ title: "Error de Importación", description: error.message || "Ocurrió un error al procesar el archivo.", variant: "destructive" });
      } finally {
        setIsImporting(false);
        setSelectedFile(null);
        const fileInput = document.getElementById('excelFile') as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleExportExcel = () => {
    if (filteredEquipmentList.length === 0) {
      toast({
        title: "Sin Datos",
        description: "No hay equipos para exportar (según filtros actuales).",
        variant: "default"
      });
      return;
    }

    const dataForExcel = filteredEquipmentList.map(eq => ({
      "Identificación": eq.id,
      "Tipo": appSettings?.tiposEquipos.find(opt => opt.value === eq.tipo)?.label || eq.tipo,
      "Dirección": eq.direccion,
      "Marca": appSettings?.marcasEquipos.find(opt => opt.value === eq.marca)?.label || eq.marca,
      "Estado": appSettings?.estadosEquipos.find(opt => opt.value === eq.estado)?.label || eq.estado,
      "IP": eq.ip || "N/A",
      "Tipo Comunicación": eq.tipoComunicacion,
      "Piloto": eq.piloto || "N/A",
      "Latitud": eq.coordenadas.latitude,
      "Longitud": eq.coordenadas.longitude,
      "Zona": appSettings?.zonasEquipos.find(opt => opt.value === eq.zona)?.label || eq.zona,
      "Fecha Última Revisión": lastRevisionDates.get(eq.id) ? format(lastRevisionDates.get(eq.id) as Date, "yyyy-MM-dd") : "N/A",
      "Total Revisiones": eq.revisionCount,
      "Requiere Canasta": eq.requiereCanasta ? "Sí" : "No",
      "Zona Peligrosa": eq.zonaPeligrosa ? "Sí" : "No",
      "Próx. Mant. Prog.": eq.proximoMantenimientoProgramado ? format(eq.proximoMantenimientoProgramado, "yyyy-MM-dd") : "N/A",
      "Int. Mant. Días": eq.intervaloMantenimientoDias ?? "N/A",
      "Int. Mant. Revisiones": eq.intervaloMantenimientoRevisiones ?? "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Equipos");
    XLSX.writeFile(workbook, "ListaEquipos_Filtrada.xlsx");

    toast({
      title: "Exportación Exitosa",
      description: "La lista de equipos filtrada ha sido exportada a Excel.",
    });
  };
  
  const EquipmentForm = ({ equipment, onClose, currentSettings }: { equipment: Equipo | null, onClose: () => void, currentSettings: AppSettingsState }) => {
    const [identificacion, setIdentificacion] = useState(equipment?.id || "");
    const [tipo, setTipo] = useState<string>(equipment?.tipo || (currentSettings.tiposEquipos[0]?.value || ""));
    const [direccion, setDireccion] = useState(equipment?.direccion || "");
    const [marca, setMarca] = useState<string>(equipment?.marca || (currentSettings.marcasEquipos[0]?.value || ""));
    const [estadoEquipo, setEstadoEquipo] = useState<string>(equipment?.estado || (currentSettings.estadosEquipos.find(e => e.value.toLowerCase() === 'activo')?.value || currentSettings.estadosEquipos[0]?.value || ""));
    const [requiereCanasta, setRequiereCanasta] = useState(equipment?.requiereCanasta || false);
    const [zonaPeligrosa, setZonaPeligrosa] = useState(equipment?.zonaPeligrosa || false);
    const [ip, setIp] = useState(equipment?.ip || "");
    const [tipoComunicacion, setTipoComunicacion] = useState<Equipo["tipoComunicacion"]>(equipment?.tipoComunicacion || "Fibra óptica");
    const [piloto, setPiloto] = useState(equipment?.piloto || "");
    const [latitud, setLatitud] = useState<string>(equipment?.coordenadas?.latitude.toString() || "");
    const [longitud, setLongitud] = useState<string>(equipment?.coordenadas?.longitude.toString() || "");
    const [zona, setZona] = useState<string>(equipment?.zona || (currentSettings.zonasEquipos[0]?.value || ""));
    const [proximoMantenimientoProgramado, setProximoMantenimientoProgramado] = useState<Date | undefined | null>(equipment?.proximoMantenimientoProgramado ? new Date(equipment.proximoMantenimientoProgramado) : undefined);
    const [intervaloMantenimientoDias, setIntervaloMantenimientoDias] = useState<string>(equipment ? (equipment.intervaloMantenimientoDias?.toString() || "") : "365");
    const [intervaloMantenimientoRevisiones, setIntervaloMantenimientoRevisiones] = useState<string>(equipment?.intervaloMantenimientoRevisiones?.toString() || "");
    const { userProfile } = useAuth(); // Get current user for modificadoPor

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const lat = parseFloat(latitud);
      const lon = parseFloat(longitud);

      if (isNaN(lat) || isNaN(lon)) {
        toast({ title: "Error de Validación", description: "Latitud y Longitud deben ser números válidos.", variant: "destructive" });
        return;
      }
      
      const commonEquipmentData: Omit<Equipo, 'id' | 'fechaUltimaRevision' | 'revisionCount' | 'estadoHistorial'> = {
        tipo,
        direccion,
        marca,
        estado: estadoEquipo,
        requiereCanasta,
        zonaPeligrosa,
        ip: ip || "", 
        tipoComunicacion,
        piloto: piloto || "", 
        coordenadas: { latitude: lat, longitude: lon },
        zona,
        proximoMantenimientoProgramado: proximoMantenimientoProgramado || null,
        intervaloMantenimientoDias: intervaloMantenimientoDias ? parseInt(intervaloMantenimientoDias, 10) : null,
        intervaloMantenimientoRevisiones: intervaloMantenimientoRevisiones ? parseInt(intervaloMantenimientoRevisiones, 10) : null,
        // camposAdicionales will be managed separately if UI is added
      };

      if (equipment) { 
        if (!equipment.id) {
            toast({ title: "Error", description: "ID de equipo no encontrado para actualizar.", variant: "destructive"});
            return;
        }
        const updatePayload: Partial<Omit<Equipo, 'id'>> = { ...commonEquipmentData };
        // The service will handle estadoHistorial update
        try {
          await updateEquipo(equipment.id, updatePayload); // Pass userProfile.id if service expects it
          setEquipmentList(prev => prev.map(item => 
            item.id === equipment.id 
            ? { ...item, ...updatePayload, id: equipment.id, fechaUltimaRevision: item.fechaUltimaRevision, revisionCount: item.revisionCount, estadoHistorial: item.estadoHistorial /* This will be updated by service read */ }
            : item
          ));
          toast({ title: "Equipo Actualizado", description: `El equipo ${equipment.id} ha sido actualizado.`});
        } catch (error) {
          toast({ title: "Error al Actualizar", description: (error as Error).message || "No se pudo actualizar el equipo.", variant: "destructive"});
        }
      } else { 
        if (!identificacion) {
             toast({ title: "Error de Validación", description: "La Identificación es requerida para un nuevo equipo.", variant: "destructive" });
             return;
        }
        try {
          // The service addEquipo now initializes estadoHistorial
          const newId = await addEquipo(identificacion, commonEquipmentData); 
          const addedEquipment: Equipo = {
            ...commonEquipmentData, 
            id: newId,       
            fechaUltimaRevision: null, 
            revisionCount: 0,  
            estadoHistorial: [{ estado: estadoEquipo, fecha: new Date(), modificadoPor: "Creación Inicial" }],     
          };
          setEquipmentList(prev => [addedEquipment, ...prev]);
          toast({ title: "Equipo Agregado", description: `El equipo ${newId} ha sido agregado.`});
        } catch (error) {
           toast({ title: "Error al Agregar", description: (error as Error).message || "No se pudo agregar el equipo.", variant: "destructive"});
        }
      }
      onClose();
    };

    return (
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{equipment ? "Editar Equipo" : "Agregar Equipo"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] overflow-y-auto pr-2">
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="identificacion" className="text-right">Identificación</Label>
            <Input id="identificacion" value={identificacion} onChange={e => setIdentificacion(e.target.value)} className="col-span-3" disabled={!!equipment} placeholder={equipment ? "" : "ID único del equipo"}/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tipo" className="text-right">Tipo</Label>
            <Select value={tipo} onValueChange={v => setTipo(v as string)}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currentSettings.tiposEquipos.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="direccion" className="text-right">Dirección</Label>
            <Input id="direccion" value={direccion} onChange={e => setDireccion(e.target.value)} className="col-span-3" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="marca" className="text-right">Marca</Label>
            <Select value={marca} onValueChange={v => setMarca(v as string)}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currentSettings.marcasEquipos.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="estadoEquipo" className="text-right">Estado</Label>
            <Select value={estadoEquipo} onValueChange={v => setEstadoEquipo(v as string)}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currentSettings.estadosEquipos.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ip" className="text-right">IP</Label>
            <Input id="ip" value={ip} onChange={e => setIp(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tipoComunicacion" className="text-right">Tipo Comunicación</Label>
            <Select value={tipoComunicacion} onValueChange={v => setTipoComunicacion(v as Equipo["tipoComunicacion"])}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Fibra óptica">Fibra óptica</SelectItem>
                <SelectItem value="Celular">Celular</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="piloto" className="text-right">Piloto</Label>
            <Input id="piloto" value={piloto} onChange={e => setPiloto(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="latitud" className="text-right">Latitud</Label>
            <Input id="latitud" type="number" step="any" value={latitud} onChange={e => setLatitud(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="longitud" className="text-right">Longitud</Label>
            <Input id="longitud" type="number" step="any" value={longitud} onChange={e => setLongitud(e.target.value)} className="col-span-3" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="zona" className="text-right">Zona</Label>
            <Select value={zona} onValueChange={v => setZona(v as string)}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                 {currentSettings.zonasEquipos.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="requiereCanasta" className="text-right">Requiere Canasta</Label>
            <Checkbox id="requiereCanasta" checked={requiereCanasta} onCheckedChange={checked => setRequiereCanasta(Boolean(checked))} className="col-span-3 justify-self-start" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="zonaPeligrosa" className="text-right">Zona Peligrosa</Label>
            <Checkbox id="zonaPeligrosa" checked={zonaPeligrosa} onCheckedChange={checked => setZonaPeligrosa(Boolean(checked))} className="col-span-3 justify-self-start" />
          </div>
          
          {/* Campos de Mantenimiento Preventivo */}
          <div className="col-span-full border-t pt-4 mt-2">
            <h4 className="text-md font-semibold col-span-full mb-2 text-center">Programación de Mantenimiento</h4>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="proximoMantenimientoProgramado" className="text-right">Próx. Mant. Prog.</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                    variant={"outline"}
                    className={cn(
                        "col-span-3 justify-start text-left font-normal",
                        !proximoMantenimientoProgramado && "text-muted-foreground"
                    )}
                    >
                    <Icons.calendar className="mr-2 h-4 w-4" />
                    {proximoMantenimientoProgramado ? format(proximoMantenimientoProgramado, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                    mode="single"
                    selected={proximoMantenimientoProgramado || undefined}
                    onSelect={(date) => setProximoMantenimientoProgramado(date)}
                    initialFocus
                    locale={es}
                    />
                </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="intervaloMantenimientoDias" className="text-right">Intervalo Mant. (Días)</Label>
            <Input id="intervaloMantenimientoDias" type="number" value={intervaloMantenimientoDias} onChange={e => setIntervaloMantenimientoDias(e.target.value)} placeholder="Ej: 90" className="col-span-3" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="intervaloMantenimientoRevisiones" className="text-right">Intervalo Mant. (Revisiones)</Label>
            <Input id="intervaloMantenimientoRevisiones" type="number" value={intervaloMantenimientoRevisiones} onChange={e => setIntervaloMantenimientoRevisiones(e.target.value)} placeholder="Ej: 100" className="col-span-3" />
          </div>
        </div>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit">Guardar</Button>
        </DialogFooter>
      </form>
    );
  };

  const canManageEquipment = userProfile && (userProfile.perfiles.includes("administrador") || userProfile.perfiles.includes("supervisor"));

  const tipoOptions = useMemo(() => appSettings?.tiposEquipos || [], [appSettings]);
  const marcaOptions = useMemo(() => appSettings?.marcasEquipos || [], [appSettings]);
  const estadoEquipoOptions = useMemo(() => appSettings?.estadosEquipos || [], [appSettings]);


  if (isLoading || isLoadingSettings) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Gestión de Equipos" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
           <p className="ml-2">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Gestión de Equipos">
        <Button variant="outline" onClick={handleExportExcel} disabled={isLoading || filteredEquipmentList.length === 0}>
          <Icons.excel className="mr-2 h-4 w-4" /> Exportar a Excel
        </Button>
        {canManageEquipment && (
          <>
            <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
              <Icons.upload className="mr-2 h-4 w-4" /> Importar desde Excel
            </Button>
            <Button onClick={handleAddEquipment}>
              <Icons.add className="mr-2 h-4 w-4" /> Agregar Equipo
            </Button>
          </>
        )}
      </PageHeader>

      <Card>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1" className="border-b-0">
            <CardHeader className="p-4">
              <AccordionTrigger className="flex w-full items-center justify-between p-0 hover:no-underline">
                <CardTitle className="text-lg">Filtros</CardTitle>
              </AccordionTrigger>
            </CardHeader>
            <AccordionContent>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end pt-0 pb-4 px-4 md:px-6">
                <div>
                  <Label htmlFor="searchText">Buscar Equipo</Label>
                  <Input
                    id="searchText"
                    placeholder="ID, dirección, marca..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="filterTipo">Tipo de Equipo</Label>
                  <Select value={selectedTipo} onValueChange={(value) => setSelectedTipo(value === ALL_ITEMS_FILTER_VALUE ? "" : value)}>
                    <SelectTrigger id="filterTipo"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ITEMS_FILTER_VALUE}>Todos los tipos</SelectItem>
                      {tipoOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterMarca">Marca</Label>
                  <Select value={selectedMarca} onValueChange={(value) => setSelectedMarca(value === ALL_ITEMS_FILTER_VALUE ? "" : value)}>
                    <SelectTrigger id="filterMarca"><SelectValue placeholder="Todas las marcas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ITEMS_FILTER_VALUE}>Todas las marcas</SelectItem>
                      {marcaOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterEstadoEquipo">Estado del Equipo</Label>
                  <Select value={selectedEstadoEquipo} onValueChange={(value) => setSelectedEstadoEquipo(value === ALL_ITEMS_FILTER_VALUE ? "" : value)}>
                    <SelectTrigger id="filterEstadoEquipo"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ITEMS_FILTER_VALUE}>Todos los estados</SelectItem>
                      {estadoEquipoOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterRequiereCanasta">Requiere Canasta</Label>
                  <Select value={filterRequiereCanasta} onValueChange={(v) => setFilterRequiereCanasta(v as "any" | "yes" | "no")}>
                    <SelectTrigger id="filterRequiereCanasta"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BOOLEAN_FILTER_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterZonaPeligrosa">Zona Peligrosa</Label>
                  <Select value={filterZonaPeligrosa} onValueChange={(v) => setFilterZonaPeligrosa(v as "any" | "yes" | "no")}>
                    <SelectTrigger id="filterZonaPeligrosa"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BOOLEAN_FILTER_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                 <div className="xl:col-span-full xl:col-start-3 xl:self-end"> 
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
                <TableHead>Identificación</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Última Revisión (Completada)</TableHead>
                <TableHead>Req. Canasta</TableHead>
                <TableHead>Zona Peligrosa</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEquipmentList.map((item) => {
                const tipoLabel = appSettings?.tiposEquipos.find(opt => opt.value === item.tipo)?.label || item.tipo;
                const marcaLabel = appSettings?.marcasEquipos.find(opt => opt.value === item.marca)?.label || item.marca;
                const estadoLabel = appSettings?.estadosEquipos.find(opt => opt.value === item.estado)?.label || item.estado;
                const lastRevisionDate = lastRevisionDates.get(item.id);
                return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <Link href={`/equipment/${item.id}`} className="text-primary hover:underline">
                      {item.id} 
                    </Link>
                  </TableCell>
                  <TableCell>{tipoLabel}</TableCell>
                  <TableCell>{item.direccion}</TableCell>
                  <TableCell>{marcaLabel}</TableCell>
                  <TableCell> 
                    <Badge variant={item.estado.toLowerCase() === "activo" ? "default" : "destructive"} className={item.estado.toLowerCase() === "activo" ? "bg-green-500" : "bg-red-500"}>
                      {estadoLabel}
                    </Badge>
                  </TableCell>
                  <TableCell>{lastRevisionDate ? format(lastRevisionDate, "dd/MM/yyyy") : "N/A"}</TableCell>
                  <TableCell>
                    {item.requiereCanasta ? 
                        <Badge variant="destructive">Sí</Badge> : 
                        <Badge variant="secondary">No</Badge>}
                  </TableCell>
                  <TableCell>
                    {item.zonaPeligrosa ? 
                        <Badge variant="destructive" className="bg-orange-500">Sí</Badge> : 
                        <Badge variant="secondary">No</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Icons.ellipsis className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                           <Link href={`/equipment/${item.id}`}>
                            <Icons.view className="mr-2 h-4 w-4" /> Ver Detalles
                           </Link>
                        </DropdownMenuItem>
                        {canManageEquipment && (
                          <DropdownMenuItem onClick={() => handleEditEquipment(item)}>
                            <Icons.edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })}
              {!isLoading && filteredEquipmentList.length === 0 && (
                <TableRow>
                    <TableCell colSpan={9} className="text-center h-24"> 
                        {equipmentList.length === 0 ? "No hay equipos registrados. Intenta agregar uno." : "No hay equipos que coincidan con los filtros."}
                    </TableCell>
                </TableRow>
              )}
               {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center"> 
                    <Icons.loader className="mx-auto h-8 w-8 animate-spin text-primary" />
                    Cargando equipos...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[525px]">
          {isAddModalOpen && appSettings && <EquipmentForm equipment={editingEquipment} onClose={() => setIsAddModalOpen(false)} currentSettings={appSettings} />}
        </DialogContent>
      </Dialog>

      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Equipos desde Excel</DialogTitle>
            <DialogDescription>
              Sube un archivo Excel (.xlsx, .xls, .csv) con los datos de los equipos.
              Las cabeceras de las columnas deben coincidir (insensible a mayúsculas): 
              <strong>identificacion, tipo, direccion, marca, estado, ip, tipoComunicacion, piloto, latitud, longitud, zona, fechaUltimaRevision (YYYY-MM-DD), revisionCount, requiereCanasta (TRUE/FALSE), zonaPeligrosa (TRUE/FALSE), proximoMantenimientoProgramado (YYYY-MM-DD), intervaloMantenimientoDias, intervaloMantenimientoRevisiones</strong>.
              Los valores de Tipo, Marca, Estado y Zona deben coincidir con los configurados en el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="excelFile">Archivo Excel</Label>
            <Input id="excelFile" type="file" accept=".xlsx, .xls, .csv" onChange={handleFileChange} className="mt-1"/>
            <Button variant="link" className="p-0 h-auto text-sm" onClick={handleDownloadTemplate}>
              <Icons.download className="mr-2 h-4 w-4" /> Ver columnas esperadas
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {setIsImportModalOpen(false); setSelectedFile(null);}} disabled={isImporting}>Cancelar</Button>
            <Button onClick={handleImportExcel} disabled={isImporting || !selectedFile || !appSettings}>
              {isImporting ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.upload className="mr-2 h-4 w-4" />}
               Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
    




