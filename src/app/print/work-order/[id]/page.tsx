
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import type { OrdenDeTrabajo, Trabajo, UserProfile, Vehiculo, Equipo, Solicitud, AppSettingsState, GeoPoint } from "@/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getWorkOrderById } from "@/services/workOrderService";
import { getUsers } from "@/services/userService";
import { getVehiculos } from "@/services/vehicleService";
import { getEquipos } from "@/services/equipmentService";
import { getSolicitudes } from "@/services/requestService";
import { getAppSettings } from "@/services/settingsService";
import { DashboardMap, type EquipmentLocationWithInfo } from "@/components/dashboard/DashboardMap";
import QRCode from 'qrcode';

// --- Estilos en Línea ---
const printPageStyles: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: "10pt",
  lineHeight: "1.3",
  color: "#333",
  paddingTop: "10mm",
  paddingRight: "15mm",
  paddingBottom: "10mm",
  paddingLeft: "15mm",
  maxWidth: "210mm", // A4 width
  margin: "0 auto",
};

const header1Styles: React.CSSProperties = {
  fontWeight: "bold",
  textAlign: "center",
  fontSize: "24pt",
  marginBottom: "2px", // Reducido de 5px
  color: "#000",
};

const header2Styles: React.CSSProperties = {
  fontWeight: "bold",
  textAlign: "center",
  fontSize: "18pt",
  marginBottom: "15px",
  color: "#000",
};

const companyBlockStyles: React.CSSProperties = {
  fontWeight: "bold",
  textAlign: "center",
  fontSize: "12pt",
  marginBottom: "2px",
  color: "#111",
  lineHeight: "1.2",
};
const companyBlockContainerStyles: React.CSSProperties = {
  marginBottom: "20px",
};

const sectionTitleStyles: React.CSSProperties = {
  fontWeight: "bold",
  textAlign: "left",
  fontSize: "13pt",
  marginBottom: "8px",
  borderBottom: "1px solid #ccc",
  paddingBottom: "4px",
  color: "#000",
  marginTop: "15px",
};

const boxStyles: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "8px",
  marginBottom: "15px",
  pageBreakInside: "avoid",
};

const unidadesContainerStyles: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
};

const unidadesListStyles: React.CSSProperties = {
  flex: "1 1 70%", // Takes up most of the space
};

const qrCodeContainerStyles: React.CSSProperties = {
  flex: "0 0 100px", // Fixed width for QR code
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const qrCodeImageStyles: React.CSSProperties = {
    width: '100px',
    height: '100px',
};


const signatureContainerStyles: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: "30px",
  gap: "15px",
  pageBreakInside: "avoid",
};

const signatureBoxStyles: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "10px",
  width: "48%",
  minHeight: "100px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end", // Align text to bottom
  textAlign: "center",
  fontSize: "9pt",
};

const tableStyles: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "5px",
  fontSize: "9pt",
};

const thStyles: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "4px",
  textAlign: "left",
  backgroundColor: "#f2f2f2",
  fontWeight: "bold",
};

const tdStyles: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "4px",
  verticalAlign: "top",
};
// --- Fin Estilos en Línea ---

interface MapRouteToDisplay {
  id: string;
  path: google.maps.LatLngLiteral[];
  color: string;
}

export default function WorkOrderPrintPage() {
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<OrdenDeTrabajo | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [vehicles, setVehicles] = useState<Vehiculo[]>([]);
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);
  const [allSolicitudes, setAllSolicitudes] = useState<Solicitud[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  const [orderEquipmentForMap, setOrderEquipmentForMap] = useState<EquipmentLocationWithInfo[]>([]);
  const [orderRoutePathForMap, setOrderRoutePathForMap] = useState<MapRouteToDisplay | null>(null);


  const fetchOrderDetails = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [
        fetchedOrder,
        fetchedUsers,
        fetchedVehicles,
        fetchedEquiposData,
        fetchedSolicitudesData,
        fetchedAppSettings,
      ] = await Promise.all([
        getWorkOrderById(id),
        getUsers(),
        getVehiculos(),
        getEquipos(),
        getSolicitudes(),
        getAppSettings(),
      ]);

      setOrder(fetchedOrder);
      setUsers(fetchedUsers);
      setVehicles(fetchedVehicles);
      setAllEquipos(fetchedEquiposData);
      setAllSolicitudes(fetchedSolicitudesData);
      setAppSettings(fetchedAppSettings);

    } catch (error) {
      console.error("Error fetching work order details for print:", error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);

  useEffect(() => {
    if (order && users.length > 0 && vehicles.length > 0 && allEquipos.length > 0) {
      // QR Code Generation Logic
      const creatorProfile = users.find(u => u.id === order.creadoPor);
      const assignedVehiclePlates = Array.from(new Set(order.unidadesAsignadas.map(ua => {
        const vehicle = vehicles.find(v => v.id === ua.vehiculoId);
        return vehicle?.placa || 'N/A';
      })));
      const assignedTechnicianCIs = Array.from(new Set(order.unidadesAsignadas.flatMap(ua => ua.tecnicos).map(techId => {
        const tech = users.find(u => u.id === techId);
        return tech?.cedula || 'N/A';
      })));
      const revisionCoordinates = order.trabajos.map(t => {
        const equipo = allEquipos.find(e => e.id === t.equipoId);
        return equipo?.coordenadas ? `${equipo.coordenadas.latitude.toFixed(6)},${equipo.coordenadas.longitude.toFixed(6)}` : 'N/A';
      });

      const qrData = {
        ordenId: order.displayId,
        fechaCreacion: new Date(order.fechaCreacion).toISOString(),
        creadorCI: creatorProfile?.cedula || 'N/A',
        placasVehiculos: assignedVehiclePlates,
        cedulasTecnicos: assignedTechnicianCIs,
        coordenadasRevisiones: revisionCoordinates,
      };

      QRCode.toDataURL(JSON.stringify(qrData, null, 2), { errorCorrectionLevel: 'M' })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => console.error("Failed to generate QR code", err));

      // Map Generation Logic
      const equipmentForRoute: EquipmentLocationWithInfo[] = [];
      const pathCoordinates: google.maps.LatLngLiteral[] = [];

      order.trabajos.forEach(trabajo => {
        const equipo = allEquipos.find(eq => eq.id === trabajo.equipoId);
        if (equipo?.coordenadas && typeof equipo.coordenadas.latitude === 'number' && typeof equipo.coordenadas.longitude === 'number') {
          equipmentForRoute.push({
            id: equipo.id,
            coordenadas: equipo.coordenadas,
            tipo: equipo.tipo,
            marca: equipo.marca,
          });
          pathCoordinates.push({ lat: equipo.coordenadas.latitude, lng: equipo.coordenadas.longitude });
        }
      });
      setOrderEquipmentForMap(equipmentForRoute);
      if (pathCoordinates.length > 0) {
        setOrderRoutePathForMap({
          id: `print-ot-route-${order.id}`,
          path: pathCoordinates,
          color: "#0275d8", // Primary blue
        });
      } else {
        setOrderRoutePathForMap(null);
      }
    }
  }, [order, users, vehicles, allEquipos]);


  const getUserName = (userId: string) =>
    users.find((u) => u.id === userId)?.nombre || userId;

  const getEquipmentDetails = (equipoId: string): Equipo | undefined => {
    return allEquipos.find(eq => eq.id === equipoId);
  };


  if (isLoading) {
    return (
      <div style={{ ...printPageStyles, textAlign: "center", paddingTop: "50px" }}>
        <Icons.loader className="h-12 w-12 animate-spin text-primary mx-auto mb-4 print:hidden" />
        <p>Cargando datos de la Orden de Trabajo...</p>
      </div>
    );
  }

  if (!order || !appSettings) {
    return (
      <div style={printPageStyles}>
        <p style={{textAlign: "center", color: "red"}}>
            { !order ? `Orden de trabajo con ID '${id}' no encontrada.` : "No se pudo cargar la configuración de la empresa."}
        </p>
      </div>
    );
  }

  const firstTrabajo = order?.trabajos?.[0];
  const firstSolicitud = firstTrabajo?.solicitudId ? allSolicitudes.find(s => s.id === firstTrabajo.solicitudId) : null;
  const solicitanteName = firstSolicitud ? getUserName(firstSolicitud.creadoPor) : "N/A";
  const ordenCreadaPorName = getUserName(order.creadoPor);

  return (
    <div style={printPageStyles}>
      <Button
        onClick={() => window.print()}
        className="my-4 print:hidden bg-primary text-primary-foreground hover:bg-primary/90 fixed top-4 right-4 z-50"
      >
        <Icons.fileText className="mr-2 h-4 w-4" /> Imprimir / Guardar PDF
      </Button>

      <div style={{textAlign: "center"}}>
        <h1 style={header1Styles}>ORDEN DE TRABAJO</h1>
        <h2 style={header2Styles}>{order.displayId}</h2>
      </div>

      <div style={companyBlockContainerStyles}>
        <p style={companyBlockStyles}>
          {appSettings.empresaNombre || "Nombre de Empresa no Configurado"}
          {appSettings.empresaUnidadNegocio ? `, ${appSettings.empresaUnidadNegocio}` : ""}
        </p>
        <p style={companyBlockStyles}>{appSettings.empresaDepartamento || "Departamento no Configurado"}</p>
        <p style={{...companyBlockStyles, fontSize: "11pt", marginTop: "5px"}}>Fecha de Creación: {format(new Date(order.fechaCreacion), "dd 'de' MMMM 'de' yyyy HH:mm", { locale: es })}</p>
      </div>

      <div style={boxStyles}>
        <h3 style={sectionTitleStyles}>Unidades Asignadas</h3>
        <div style={unidadesContainerStyles}>
          <div style={unidadesListStyles}>
            {order.unidadesAsignadas.length > 0 ? (
              order.unidadesAsignadas.map((unidad, index) => {
                const vehicle = vehicles.find(v => v.id === unidad.vehiculoId);
                return (
                  <div key={index} style={{ marginBottom: "8px", paddingLeft: "5px", borderLeft: "2px solid #f0f0f0" }}>
                    <p><b>Unidad: {unidad.vehiculoId}</b> (Placa: {vehicle?.placa || 'N/A'})</p>
                    <ul style={{ listStyleType: "none", paddingLeft: "15px", fontSize:"9pt" }}>
                      {unidad.tecnicos.map((techId) => (
                        <li key={techId}>- {getUserName(techId)}</li>
                      ))}
                    </ul>
                  </div>
                );
              })
            ) : (
              <p style={{fontSize: "9pt"}}>No hay unidades asignadas.</p>
            )}
          </div>
          {qrCodeDataUrl && (
            <div style={qrCodeContainerStyles}>
              <img
                src={qrCodeDataUrl}
                alt={`QR Code for Order ${order.displayId}`}
                style={qrCodeImageStyles}
              />
            </div>
          )}
        </div>
      </div>

      <div style={boxStyles}>
        <h3 style={sectionTitleStyles}>Trabajos Incluidos</h3>
        {order.trabajos && order.trabajos.length > 0 ? (
          <table style={tableStyles}>
            <thead>
              <tr>
                <th style={thStyles}>ID Trabajo</th>
                <th style={thStyles}>Equipo</th>
                <th style={thStyles}>Dirección</th>
                <th style={thStyles}>Coord. (Lat,Lon)</th>
                <th style={thStyles}>Trabajo Solicitado</th>
                <th style={thStyles}>Solicitado Por</th>
              </tr>
            </thead>
            <tbody>
              {order.trabajos.map((trabajo) => {
                const equipo = getEquipmentDetails(trabajo.equipoId);
                const solicitud = allSolicitudes.find(s => s.id === trabajo.solicitudId);
                const trabajoSolicitadoOriginal = trabajo.detalles || solicitud?.descripcion || "N/A";
                const lat = equipo?.coordenadas?.latitude.toFixed(6) || "N/A";
                const lon = equipo?.coordenadas?.longitude.toFixed(6) || "N/A";

                return (
                  <tr key={trabajo.id}>
                    <td style={tdStyles}>{trabajo.id}</td>
                    <td style={tdStyles}>{trabajo.equipoId}</td>
                    <td style={tdStyles}>{equipo?.direccion || "N/A"}</td>
                    <td style={tdStyles}>{lat}, {lon}</td>
                    <td style={tdStyles}>{trabajoSolicitadoOriginal}</td>
                    <td style={tdStyles}>{solicitud ? getUserName(solicitud.creadoPor) : "N/A"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{fontSize: "9pt"}}>No hay trabajos en esta orden.</p>
        )}
      </div>

      <div style={{ ...boxStyles, pageBreakBefore: order.trabajos.length > 5 ? "always" : "auto" }}>
        <h3 style={sectionTitleStyles}>Ruta</h3>
        <div style={{ height: "300px", width: "100%", border: "1px solid #ccc", borderRadius: "4px", overflow: "hidden" }} className="print:border-none">
          {orderEquipmentForMap.length > 0 || (orderRoutePathForMap && orderRoutePathForMap.path.length > 0) ? (
              <DashboardMap
                key={`map-${order.id}`} 
                equipmentLocations={orderEquipmentForMap}
                routesToDisplay={orderRoutePathForMap ? [orderRoutePathForMap] : []}
                allUsers={users}
              />
            ) : (
              <div style={{display: "flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#888", fontSize:"10pt"}}>
                <p>No hay suficientes datos de equipos con coordenadas para mostrar la ruta en el mapa.</p>
              </div>
            )}
        </div>
         <p className="print:block hidden text-xs text-gray-500 mt-1">Nota: La visualización del mapa en el PDF puede variar.</p>
      </div>

      <div style={signatureContainerStyles}>
        <div style={signatureBoxStyles}>
          <div style={{borderBottom: "1px solid #888", height: "50px", marginBottom:"5px"}}></div>
          <p>Solicitado por:</p>
          <p style={{fontWeight:"bold"}}>{solicitanteName}</p>
        </div>
        <div style={signatureBoxStyles}>
          <div style={{borderBottom: "1px solid #888", height: "50px", marginBottom:"5px"}}></div>
          <p>Creado por:</p>
          <p style={{fontWeight:"bold"}}>{ordenCreadaPorName}</p>
        </div>
      </div>

      <footer style={{ marginTop: "25px", paddingTop: "8px", borderTop: "1px solid #ccc", fontSize: "8pt", textAlign: "center" }}>
        <p>Documento Generado por Camith - {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
      </footer>
    </div>
  );
}
