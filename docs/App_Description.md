
# Documentación Completa de la Aplicación: Camith

## 1. Introducción y Visión General

**Camith** es una aplicación web integral de gestión de servicios de campo (Field Service Management - FSM), diseñada para optimizar y centralizar las operaciones de empresas con equipos técnicos que realizan trabajos en ubicaciones remotas. La plataforma sirve como un centro de mando unificado que conecta al personal de oficina (administradores, supervisores, ingenieros) con los técnicos de campo, garantizando un flujo de trabajo eficiente, trazabilidad completa y una toma de decisiones basada en datos en tiempo real.

El sistema está concebido para manejar todo el ciclo de vida de una orden de trabajo, desde la creación de una solicitud de servicio hasta la ejecución, supervisión y reporte del trabajo realizado en campo.

**Propósito Principal:** Proporcionar una solución digital, centralizada y en tiempo real para la planificación, despacho, ejecución y monitoreo de operaciones de servicio de campo, aumentando la eficiencia operativa, mejorando la comunicación y facilitando la supervisión y la generación de informes.

---

## 2. Módulos y Funcionalidades Detalladas

La aplicación se estructura en varios módulos interconectados, cada uno enfocado en un aspecto específico de la operación.

### 2.1. Panel de Inicio (Dashboard)

Es la pantalla principal y el centro neurálgico de la aplicación. Ofrece una vista panorámica del estado de las operaciones del día y tendencias recientes.

*   **Indicadores Clave de Rendimiento (KPIs):** Presenta tarjetas con métricas vitales actualizadas en tiempo real:
    *   **Órdenes Creadas Hoy:** Total de nuevas órdenes de trabajo generadas en el día.
    *   **Trabajos Pendientes (Total):** Conteo global de todos los trabajos individuales que aún no se han completado.
    *   **Trabajos Completados Hoy:** Total de trabajos finalizados exitosamente durante el día.
*   **Mapa de Operaciones Interactivo:**
    *   Utiliza la API de Google Maps para mostrar la ubicación geográfica de los equipos que requieren servicio para las órdenes del día seleccionado.
    *   Superpone las rutas planificadas para cada orden de trabajo, diferenciadas por colores.
    *   Muestra la ubicación de la Sede Central como punto de partida.
    *   Los marcadores en el mapa indican el estado del trabajo asociado a ese equipo (Pendiente, Completado, etc.), permitiendo una supervisión visual rápida.
*   **Gráficos y Tendencias:**
    *   **Proporción de Trabajos del Día:** Un gráfico de dona que muestra la distribución de trabajos (Pendientes, Completados, No Completados) para las órdenes creadas en el día.
    *   **Órdenes Creadas (Últimos 7 días):** Un gráfico de barras que muestra la tendencia de creación de órdenes de trabajo.
    *   **Estado de Trabajos por Día (Últimos 10 días):** Un gráfico de barras apiladas que visualiza la cantidad de trabajos por estado (Pendiente, Completado, No Completado, Cancelado) a lo largo del tiempo.
*   **Listados de Acceso Rápido:**
    *   **Trabajos Pendientes:** Una tabla con todos los trabajos individuales que tienen estado "Pendiente", ideal para seguimiento.
    *   **Solicitudes No Asignadas:** Una lista de todas las solicitudes de servicio que aún esperan ser incluidas en una orden de trabajo.
*   **Vista NOC (Network Operations Center):** Un enlace para abrir una vista especializada a pantalla completa, diseñada para monitores grandes, que muestra las unidades en tiempo real y el mapa operativo.

### 2.2. Gestión de Activos

Este módulo se encarga de administrar los recursos físicos de la empresa.

#### 2.2.1. Gestión de Equipos
Permite un control total sobre los equipos instalados en campo.

*   **Listado y Filtrado:** Muestra una tabla con todos los equipos, con potentes filtros por ID, dirección, tipo, marca, estado, y características como "Requiere Canasta" o "Zona Peligrosa".
*   **Creación y Edición:** Un formulario detallado permite registrar nuevos equipos o modificar existentes, especificando:
    *   Identificación, tipo, dirección, marca, zona.
    *   Coordenadas GPS (Latitud y Longitud).
    *   Estado (Activo, Dado de baja), con un historial de cambios.
    *   Características especiales (requiere canasta, zona peligrosa).
    *   Parámetros de mantenimiento preventivo (fecha de próximo mantenimiento, intervalo en días o revisiones).
*   **Importación y Exportación:** Funcionalidad para importar masivamente equipos desde un archivo Excel y exportar la lista filtrada actual a Excel.
*   **Vista de Detalle de Equipo:** Una página dedicada para cada equipo que muestra:
    *   Toda su información de registro.
    *   Su ubicación en un mapa individual.
    *   Un historial completo de todos los trabajos y revisiones que se le han realizado.
    *   Un historial de sus cambios de estado (de Activo a Dado de baja y viceversa).

#### 2.2.2. Gestión de Vehículos
Administra la flota de vehículos de la empresa.

*   **Listado Visual:** Muestra los vehículos en tarjetas con una imagen representativa según el tipo (camioneta, camión canasta).
*   **Registro de Vehículos:** Formulario para añadir nuevos vehículos especificando Nº de Unidad, Placa, Tipo, y Estado (Disponible, En Mantenimiento, Dado de Baja).
*   **Asignación de Custodio:** Permite asignar un técnico (con la licencia de conducir adecuada) como responsable o custodio principal del vehículo.

### 2.3. Gestión del Ciclo de Trabajo

Este es el núcleo funcional de la aplicación, cubriendo desde la solicitud hasta la finalización del trabajo.

#### 2.3.1. Solicitudes de Servicio
El punto de partida para cualquier trabajo.

*   **Creación de Solicitudes:** Un formulario permite a los ingenieros o supervisores crear una nueva solicitud de servicio, especificando el equipo que requiere atención, el tipo de trabajo, la urgencia (Normal, Urgente) y una descripción.
*   **Gestión de Solicitudes Pendientes:** La aplicación detecta si ya existe una solicitud pendiente para un equipo, evitando duplicados y permitiendo reemplazar la solicitud antigua si es necesario.
*   **Listado y Revisión:** Una tabla centraliza todas las solicitudes, permitiendo filtrarlas y ver su estado actual (pendiente, asignada, completada, cancelada).
*   **Revisión y Cancelación:** Los usuarios autorizados pueden revisar los trabajos completados asociados a una solicitud y, si es necesario, cancelar solicitudes pendientes o asignadas (con un motivo obligatorio).

#### 2.3.2. Creación de Órdenes de Trabajo (Planificación y Despacho)
Este es el módulo de planificación donde las solicitudes se convierten en trabajo real.

*   **Paso 1: Composición de Unidades de Campo:** El supervisor primero compone las "unidades de campo" para la jornada, asignando técnicos a los vehículos disponibles. Estas composiciones son temporales para la sesión de creación de la OT.
*   **Paso 2: Creación de Rutas y Asignación (Drag & Drop):**
    *   El supervisor puede crear múltiples "Rutas" (ej: Ruta 1, Ruta 2).
    *   **Arrastra y suelta** las solicitudes pendientes de la lista a la ruta deseada.
    *   Asigna una o más unidades de campo (vehículo + técnicos) a cada ruta.
    *   El sistema realiza validaciones, como verificar si una ruta con equipos que requieren canasta tiene asignado un vehículo tipo canasta.
*   **Generación de Órdenes:** Con un clic, el sistema genera automáticamente una o más Órdenes de Trabajo, una por cada ruta definida.

#### 2.3.3. Órdenes de Trabajo (OT)
Una vez creadas, las OT son los documentos que agrupan y formalizan el trabajo a realizar.

*   **Listado y Seguimiento:** Una página muestra todas las OT con su estado general (Pendiente, En Progreso, Completada Parcial, etc.).
*   **Vista de Detalle de OT:**
    *   Muestra la información general (quién la creó, cuándo).
    *   Detalla las unidades asignadas (vehículos y técnicos).
    *   Presenta una tabla con todos los trabajos individuales incluidos en la orden.
    *   Permite ver la ruta planificada en un mapa.
*   **Versión Imprimible:** Genera una vista limpia y profesional de la OT, ideal para imprimir o guardar como PDF, que incluye un código QR con los datos clave de la orden.
*   **Revisión de Trabajos:** Desde aquí, un supervisor puede abrir los detalles de un trabajo completado por un técnico para añadir observaciones o cambiar su estado si es necesario.

### 2.4. Operaciones de Campo (Vista del Técnico)

Módulo diseñado específicamente para el uso de los técnicos en campo, accesible desde dispositivos móviles.

*   **"Mis Trabajos":** La pantalla principal para el técnico. Muestra una lista clara y concisa de todos los trabajos que tiene asignados (pendientes o completados por él).
*   **Actualización de Trabajo:** Al seleccionar un trabajo, el técnico puede:
    *   Ver los detalles del equipo y la solicitud.
    *   Ver la ubicación del equipo en un mapa.
    *   Registrar sus "Hallazgos" o acciones realizadas.
    *   **Subir fotografías** como evidencia del trabajo.
    *   Cambiar el estado del trabajo a "Completado" o "No Completado".

### 2.5. Administración del Sistema

#### 2.5.1. Gestión de Usuarios
Permite al administrador gestionar el acceso y los permisos.

*   **Creación y Edición:** Formulario para crear nuevos usuarios (con contraseña inicial) o editar perfiles existentes.
*   **Asignación de Roles (Perfiles):** Se pueden asignar uno o más roles a cada usuario: `administrador`, `supervisor`, `ingenieroDeOficina`, `tecnicoDeCampo`.
*   **Asignación de Habilidades:** Para los técnicos, se pueden asignar habilidades específicas como "Eléctrico", "Escalador" o tipos de licencia de conducir ("C", "D"), que son cruciales para las validaciones al crear órdenes de trabajo.
*   **Gestión de Estado:** Un administrador puede activar o desactivar usuarios, registrando un motivo para el cambio, lo que deshabilita su acceso a la aplicación.

#### 2.5.2. Configuración General (Ajustes)
Un panel central donde los administradores pueden personalizar las opciones de la aplicación sin necesidad de cambiar el código.

*   **Información de la Empresa:** Nombre, departamento, etc.
*   **Coordenadas de la Sede Central:** Para el cálculo y visualización de rutas.
*   **Horarios de Operación.**
*   **Listas de Valores Personalizables:** El administrador puede añadir, editar o eliminar opciones para:
    *   Marcas y Tipos de Equipos.
    *   Zonas geográficas.
    *   Tipos y Estados de vehículos.
    *   Niveles de urgencia para solicitudes.
    *   **Respuestas Predefinidas** para agilizar la creación de solicitudes.
*   **Tipos de Trabajo por Equipo:** Se pueden definir qué trabajos específicos se pueden realizar para cada tipo de equipo (ej: "Revisión" para un "Repetidor", "Reconexión" para un "Medidor"), incluyendo un tiempo estimado en minutos para cada uno.

### 2.6. Reportes
Módulo dedicado a la inteligencia de negocio y análisis de rendimiento.

*   **Reporte de Estadísticas por Usuario:** Muestra el rendimiento de cada técnico en un rango de fechas, con métricas como trabajos atendidos, completados, no completados, y un porcentaje de efectividad.
*   **Reporte de Ranking de Equipos:** Clasifica los equipos según el número total de intervenciones, permitiendo identificar equipos problemáticos.
*   **Reporte de Resumen Mensual:** Compara la cantidad de solicitudes creadas contra la cantidad de trabajos exitosos por mes, mostrando un porcentaje de éxito.
*   **Reporte de Productividad Mensual:** Desglosa los trabajos completados por mes según el tipo de trabajo (mantenimiento, instalación, etc.).
*   **Reporte de Resumen de Órdenes de Trabajo:** Ofrece una vista general de las OT creadas en un rango de fechas, su estado y quién las creó.

---

## 3. Arquitectura y Tecnologías

*   **Frontend:** Construido con **Next.js** y **React**, utilizando el **App Router**. La interfaz de usuario se implementa con **ShadCN UI**, un conjunto de componentes reutilizables y accesibles, estilizados con **Tailwind CSS**.
*   **Backend y Base de Datos:** **Firebase** es el corazón del backend.
    *   **Firebase Authentication:** Gestiona la identidad de los usuarios (login por email/contraseña).
    *   **Cloud Firestore:** Una base de datos NoSQL en tiempo real que almacena toda la información de la aplicación (usuarios, equipos, órdenes, etc.).
    *   **Firebase Storage:** Se utiliza para almacenar los archivos subidos, como las fotos de los trabajos de campo.
*   **Mapeo:** La **API de Google Maps** se utiliza para todas las funcionalidades de visualización de mapas y rutas.
*   **Inteligencia Artificial:** La aplicación integra **Genkit**, el framework de IA de Google, con un flujo pre-construido para la **optimización de rutas**, sentando las bases para futuras funcionalidades inteligentes.

---

## 4. Roles de Usuario y Flujo de Trabajo Típico

La aplicación define un claro sistema de permisos basado en roles.

*   **Administrador:** Acceso total. Puede gestionar usuarios, configuraciones y todos los demás módulos.
*   **Supervisor:** Puede gestionar órdenes de trabajo, solicitudes, unidades de campo y activos. Es el rol principal de planificación y despacho.
*   **Ingeniero de Oficina:** Puede crear y gestionar solicitudes de servicio, y revisar el estado de los trabajos completados.
*   **Técnico de Campo:** Tiene acceso principalmente a "Mis Trabajos" para ver y actualizar las tareas que le han sido asignadas.

**Flujo de Trabajo Típico:**
1.  Un **Ingeniero de Oficina** detecta una falla y crea una **Solicitud** de "Revisión de comunicación" para el equipo "EQ-001".
2.  Un **Supervisor** ve la solicitud pendiente en su panel.
3.  El **Supervisor** va a la pantalla de "Crear Orden de Trabajo". Asigna al Técnico A y al Técnico B al Vehículo C.
4.  Luego, crea una "Ruta 1", asigna la Unidad C a esa ruta, y arrastra la solicitud del equipo "EQ-001" a la ruta.
5.  El **Supervisor** genera la **Orden de Trabajo**.
6.  El **Técnico A** y el **Técnico B** ven un nuevo trabajo en su pantalla "Mis Trabajos" en sus dispositivos.
7.  Van al sitio, realizan la revisión, toman una foto del equipo funcionando y actualizan el trabajo a "Completado" en la app, añadiendo "Se reinició el equipo, ahora comunica OK" en los hallazgos.
8.  El **Supervisor** y el **Ingeniero** ven en el **Dashboard** y en la OT que el estado del trabajo ha cambiado a "Completado", y pueden ver las notas y la foto adjunta.

---

## 5. Conclusión

**Camith** es más que un simple sistema de tickets; es una plataforma de operaciones completa que aporta estructura, visibilidad y eficiencia a la gestión de servicios de campo. Al digitalizar y centralizar los flujos de trabajo, reduce la dependencia de la comunicación manual, minimiza los errores, optimiza la asignación de recursos y proporciona datos valiosos para la mejora continua de la operación.

