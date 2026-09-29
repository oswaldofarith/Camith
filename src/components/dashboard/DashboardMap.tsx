
"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer, InfoWindow } from "@react-google-maps/api";
import type { Equipo, GeoPoint, OrdenDeTrabajo, UserProfile, Trabajo, AppSettingsState } from "@/types";
import { Icons } from "@/components/icons";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const containerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: "400px",
  borderRadius: "0.5rem",
};

const defaultCenter = {
  lat: -2.170998,
  lng: -79.922356,
};

interface MapRoute {
  id: string;
  path: google.maps.LatLngLiteral[];
  color: string;
}

export interface EquipmentLocationWithInfo extends Pick<Equipo, "id" | "coordenadas" | "tipo" | "marca"> {
  ordenDisplayId?: string;
  unidadesAsignadas?: OrdenDeTrabajo['unidadesAsignadas'];
  trabajoDelDia_estado?: Trabajo['estado'];
  trabajoDelDia_fechaFinalizacion?: Date;
  trabajoDelDia_tipoTrabajo?: string;
}

interface DashboardMapProps {
  equipmentLocations?: EquipmentLocationWithInfo[];
  routesToDisplay?: MapRoute[];
  allUsers?: UserProfile[];
  simpleInfoWindow?: boolean;
  appSettings?: AppSettingsState | null;
  allEquipos?: Equipo[];
}

const isValidLatLng = (point?: GeoPoint | google.maps.LatLngLiteral): point is google.maps.LatLngLiteral => {
  if (!point) return false;
  const lat = 'latitude' in point ? point.latitude : point.lat;
  const lng = 'longitude' in point ? point.longitude : point.lng;
  return typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);
};

const markerColorMapping: Record<Trabajo['estado'] | 'default', string> = {
  Pendiente: "#FFEB3B",    
  Completado: "#4CAF50",   
  "No Completado": "#F44336", 
  Cancelado: "#9E9E9E",    
  default: "#757575",      
};

const mapLibraries: ("geometry")[] = ["geometry"];

const RouteRenderer: React.FC<{ path: google.maps.LatLngLiteral[]; color: string; }> = ({ path, color }) => {
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  useEffect(() => {
    if (path.length < 2 || !window.google) return;

    const directionsService = new window.google.maps.DirectionsService();
    const origin = path[0];
    const destination = path[path.length - 1];
    const waypoints = path.slice(1, -1).map(p => ({ location: p, stopover: true }));

    directionsService.route(
      {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        } else {
          console.error(`Directions request failed for a route due to ${status}.`);
        }
      }
    );
  }, [path]);

  if (!directions) return null;

  return (
    <DirectionsRenderer
      directions={directions}
      options={{
        polylineOptions: {
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 5,
        },
        suppressMarkers: true, 
      }}
    />
  );
};


const DashboardMapComponent = ({ equipmentLocations = [], routesToDisplay = [], allUsers = [], simpleInfoWindow = false, appSettings, allEquipos = [] }: DashboardMapProps) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentLocationWithInfo | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey || "",
    libraries: mapLibraries,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);

  const getUserName = (userId: string, usersList: UserProfile[]): string => {
    const user = usersList.find(u => u.id === userId);
    return user ? user.nombre : userId;
  };
  
  const getTipoTrabajoNombreFromSettings = (trabajoId: string, equipoId: string): string => {
    if (!appSettings || !trabajoId || !equipoId) return trabajoId;
    const equipo = allEquipos.find(e => e.id === equipoId);
    if (equipo) {
      const tipoEquipoConfig = appSettings.tiposEquipos.find(te => te.value === equipo.tipo);
      const trabajoConfig = tipoEquipoConfig?.tiposDeTrabajoAsociados.find(tt => tt.id === trabajoId);
      if (trabajoConfig) return trabajoConfig.nombre;
    }
    for (const te of appSettings.tiposEquipos) {
        const trabajo = te.tiposDeTrabajoAsociados.find(tt => tt.id === trabajoId);
        if (trabajo) return trabajo.nombre;
    }
    return trabajoId; 
  };

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    if (!window.google || !window.google.maps) {
      mapInstance.setCenter(defaultCenter);
      mapInstance.setZoom(12);
      setMap(mapInstance);
      return;
    }

    const validEquipmentLocations = equipmentLocations.filter(eq => eq.coordenadas && isValidLatLng(eq.coordenadas));
    const validRoutes = routesToDisplay.filter(route => route.path && route.path.length > 0 && route.path.every(isValidLatLng));

    if (validEquipmentLocations.length === 1 && validRoutes.length === 0) {
      const singleEquip = validEquipmentLocations[0].coordenadas!;
      mapInstance.setCenter(new window.google.maps.LatLng(singleEquip.latitude, singleEquip.longitude));
      mapInstance.setZoom(16);
    } else if (validEquipmentLocations.length > 0 || validRoutes.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      validEquipmentLocations.forEach(equip => {
        bounds.extend(new window.google.maps.LatLng(equip.coordenadas!.latitude, equip.coordenadas!.longitude));
      });
      validRoutes.forEach(route => {
        route.path.forEach(point => {
          bounds.extend(new window.google.maps.LatLng(point.lat, point.lng));
        });
      });
      if (!bounds.isEmpty()) {
        mapInstance.fitBounds(bounds);
        window.google.maps.event.addListenerOnce(mapInstance, 'idle', () => {
          if (mapInstance.getZoom() && mapInstance.getZoom()! > 17) mapInstance.setZoom(17);
        });
      }
    }
    setMap(mapInstance);
  }, [equipmentLocations, routesToDisplay]);

  const onUnmount = useCallback(function callback() {
    setMap(null);
  }, []);
  
  const mapOptions = useMemo(() => ({
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  }), []);

  if (!apiKey) return <div className="flex flex-col items-center justify-center h-full bg-muted p-4 rounded-md">Falta Clave API</div>;
  if (loadError) return <div className="flex flex-col items-center justify-center h-full bg-muted p-4 rounded-md">Error Google Maps</div>;

  const buildingIconSvgString = `
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#30475E" stroke="#FFFFFF" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
    <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
  </svg>`;

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={12}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={mapOptions}
    >
      {equipmentLocations.filter(eq => isValidLatLng(eq.coordenadas)).map((equip) => {
          const isSede = equip.id.startsWith("sede_central");
          const jobStatus = equip.trabajoDelDia_estado || 'default';
          const markerPinColor = markerColorMapping[jobStatus as any] || markerColorMapping.default;
          
          const svgContent = isSede ? buildingIconSvgString : `
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="${markerPinColor}" stroke="#000000" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3.5" fill="white" stroke="${markerPinColor}" stroke-width="0.5"></circle>
                </svg>`;

          return (
            <Marker
              key={`marker-${equip.id}`}
              position={{ lat: equip.coordenadas!.latitude, lng: equip.coordenadas!.longitude }}
              onClick={() => setSelectedEquipment(equip)}
              icon={{
                  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgContent)}`,
                  anchor: isSede ? new window.google.maps.Point(18, 18) : new window.google.maps.Point(18, 36),
              }}
            />
          );
      })}

      {selectedEquipment && selectedEquipment.coordenadas && (
        <InfoWindow
          position={{ lat: selectedEquipment.coordenadas.latitude, lng: selectedEquipment.coordenadas.longitude }}
          onCloseClick={() => setSelectedEquipment(null)}
        >
          <div style={{ padding: '5px', maxWidth: '280px', fontSize: '0.8rem' }}>
            {selectedEquipment.id.startsWith("sede_central") ? (
              <>
                <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{appSettings?.sedeCentralNombre || "Sede Central"}</h4>
                <p>Ubicación Principal</p>
              </>
            ) : simpleInfoWindow ? (
              <h4 style={{ fontWeight: 'bold' }}>Equipo: {selectedEquipment.id}</h4>
            ) : (
              <>
                <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{selectedEquipment.id} ({selectedEquipment.tipo})</h4>
                <p>Marca: {selectedEquipment.marca}</p>
                {selectedEquipment.trabajoDelDia_tipoTrabajo && (
                  <>
                    <p><strong>Orden:</strong> {selectedEquipment.ordenDisplayId}</p>
                    <p><strong>Trabajo:</strong> {getTipoTrabajoNombreFromSettings(selectedEquipment.trabajoDelDia_tipoTrabajo, selectedEquipment.id)}</p>
                    <p><strong>Estado:</strong> {selectedEquipment.trabajoDelDia_estado}</p>
                  </>
                )}
              </>
            )}
          </div>
        </InfoWindow>
      )}
      
      {routesToDisplay.filter(route => route.path && route.path.length > 1).map(route => (
          <RouteRenderer key={`route-${route.id}`} path={route.path} color={route.color} />
      ))}
    </GoogleMap>
  ) : <div className="flex items-center justify-center h-full bg-muted rounded-md min-h-[400px]"><Icons.loader className="h-12 w-12 animate-spin text-primary" /></div>;
}

export const DashboardMap = DashboardMapComponent;
