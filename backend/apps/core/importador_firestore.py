"""Importa la exportación de Firestore (legacy/firebase/export) a PostgreSQL.

Cada colección se traduce a los modelos nuevos conservando los identificadores
que la gente conoce: el código del equipo y del vehículo (ID del documento), el
`displayId` de solicitudes y órdenes, y el ID `OT-…-T1` de cada trabajo.

Es idempotente: lo ya importado (por código o por `firestore_id`) no se vuelve a
crear, así que se puede repetir tras corregir datos. Los usuarios se importan
antes con `importar_usuarios`.
"""

import ipaddress
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from django.contrib.gis.geos import Point
from django.core.files.base import ContentFile
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.assets.models import Equipo, EquipoEstadoHistorial, Vehiculo
from apps.catalogs import models as cat
from apps.notifications.models import Notificacion
from apps.operations.models import (
    MantenimientoProgramado,
    OrdenDeTrabajo,
    OTUnidadAsignada,
    PlanMantenimiento,
    Solicitud,
    Trabajo,
    TrabajoFoto,
    UnidadDeCampo,
)

EMAIL_DESCONOCIDO = "desconocido@migracion.invalid"

# Clave de cada lista de appConfiguration/mainSettings → modelo de catálogo.
CATALOGOS = {
    "marcasEquipos": cat.Marca,
    "zonasEquipos": cat.Zona,
    "tiposEquipos": cat.TipoEquipo,
    "estadosEquipos": cat.EstadoEquipo,
    "tiposVehiculos": cat.TipoVehiculo,
    "estadosVehiculos": cat.EstadoVehiculo,
    "urgenciasSolicitudes": cat.Urgencia,
    "respuestasPredefinidasSolicitudes": cat.RespuestaPredefinida,
}


def clave(texto) -> str:
    """Normaliza un valor o etiqueta: 'Vía a la Costa', 'via-a-la-costa' y 'viaALaCosta'
    dan lo mismo."""
    return slugify(str(texto or "")).replace("-", "")


def fecha_hora(valor) -> datetime | None:
    if not valor or not isinstance(valor, str):
        return None
    try:
        dt = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if timezone.is_aware(dt) else timezone.make_aware(dt)


def dia(valor) -> date | None:
    """Fecha local (Guayaquil) de un instante; Firestore guarda medianoche local en UTC."""
    dt = fecha_hora(valor)
    return timezone.localtime(dt).date() if dt else None


def hora(valor) -> time | None:
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(valor or "").strip())
    return time(int(m[1]), int(m[2])) if m else None


def punto(coordenadas) -> Point | None:
    try:
        lat, lng = float(coordenadas["latitude"]), float(coordenadas["longitude"])
    except (TypeError, KeyError, ValueError):
        return None
    if (lat == 0 and lng == 0) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return Point(lng, lat, srid=4326)


def sin_decimales(coordenadas) -> dict | None:
    """Algunas coordenadas se guardaron sin el punto decimal (-799114261149843 en vez de
    -79.9114261149843). Corre la coma hasta que cada grado sea válido; None si no hay
    nada que corregir."""
    try:
        lat, lng = float(coordenadas["latitude"]), float(coordenadas["longitude"])
    except (TypeError, KeyError, ValueError):
        return None
    corregidas = {}
    for campo, valor, limite in (("latitude", lat, 90), ("longitude", lng, 180)):
        divisiones = 0
        while abs(valor) > limite * 10**divisiones:
            divisiones += 1
        corregidas[campo] = valor / 10**divisiones
    return corregidas if (corregidas["latitude"], corregidas["longitude"]) != (lat, lng) else None


def opcion(choices, valor) -> str | None:
    """Valor de un TextChoices sin distinguir mayúsculas, tildes ni separadores
    ('no completada' → 'no_completada')."""
    por_clave = {clave(etiqueta): v for v, etiqueta in choices.choices}
    por_clave.update({clave(v): v for v in choices.values})
    return por_clave.get(clave(valor))


def texto(valor, largo: int | None = None) -> str:
    t = "" if valor is None else str(valor).strip()
    return t[:largo] if largo else t


def entero(valor) -> int | None:
    try:
        n = int(float(valor))
    except (TypeError, ValueError):
        return None
    return n if n >= 0 else None


@dataclass
class Informe:
    creados: Counter = field(default_factory=Counter)
    existentes: Counter = field(default_factory=Counter)
    avisos: list[str] = field(default_factory=list)
    fotos_pendientes: list[tuple] = field(default_factory=list)

    def aviso(self, mensaje: str):
        self.avisos.append(mensaje)


class Importador:
    def __init__(self, carpeta: Path, informe: Informe | None = None):
        self.carpeta = Path(carpeta)
        self.informe = informe or Informe()
        self.catalogos: dict[type, dict[str, object]] = {}
        self.usuarios = {u.firebase_uid: u for u in User.objects.exclude(firebase_uid=None)}
        self.tipos_trabajo_por_id: dict[str, cat.TipoTrabajo] = {}
        self.tipos_trabajo_por_nombre: dict[tuple[int, str], cat.TipoTrabajo] = {}
        # (qué, valor original, valor asignado) → cuántos registros; se avisa al final.
        self.valores_desconocidos: Counter = Counter()
        self._desconocido = None

    # --- lectura -----------------------------------------------------------------

    def leer(self, nombre: str) -> list[dict]:
        ruta = self.carpeta / f"{nombre}.json"
        if not ruta.exists():
            self.informe.aviso(f"No existe {ruta.name}; se omite.")
            return []
        return json.loads(ruta.read_text(encoding="utf-8"))

    # --- referencias -------------------------------------------------------------

    def usuario(self, uid, obligatorio: bool = False) -> User | None:
        if uid and uid in self.usuarios:
            return self.usuarios[uid]
        if not obligatorio:
            return None
        if self._desconocido is None:
            self._desconocido, creado = User.objects.get_or_create(
                email=EMAIL_DESCONOCIDO,
                defaults={"nombre": "Usuario no migrado", "is_active": False},
            )
            if creado:
                self._desconocido.set_unusable_password()
                self._desconocido.save()
                self.informe.aviso(
                    "Algunos registros apuntan a usuarios que ya no existen en Firebase; "
                    f"quedan asignados a «Usuario no migrado» ({EMAIL_DESCONOCIDO})."
                )
        return self._desconocido

    def ubicar(self, coordenadas, contexto: str) -> Point | None:
        ubicacion = punto(coordenadas)
        corregidas = None if ubicacion else sin_decimales(coordenadas)
        if corregidas and (ubicacion := punto(corregidas)):
            self.informe.aviso(
                f"{contexto}: coordenadas sin punto decimal "
                f"({coordenadas['latitude']}, {coordenadas['longitude']}); se corrigieron a "
                f"{corregidas['latitude']}, {corregidas['longitude']}. Revísalas."
            )
        return ubicacion

    def estado(self, choices, valor, defecto: str, que: str) -> str:
        """Traduce un estado o tipo de Firestore; si no se reconoce usa `defecto` y lo
        anota para el informe."""
        encontrado = opcion(choices, valor)
        if encontrado is None:
            if valor not in (None, ""):
                self.valores_desconocidos[(que, str(valor), defecto)] += 1
            return defecto
        return encontrado

    def catalogo(self, modelo, valor, etiqueta=None):
        """Busca por valor o etiqueta (sin distinguir tildes ni mayúsculas); si no
        existe, lo crea para no perder el dato. El valor y la etiqueta de Firestore
        quedan como alias: appConfiguration puede decir {value: "ViaCosta", label:
        "Vía a la Costa"} y los equipos guardar cualquiera de los dos."""
        if valor in (None, "") and not etiqueta:
            return None
        indice = self.catalogos.get(modelo)
        if indice is None:
            indice = {}
            for obj in modelo.objects.all():
                indice.setdefault(clave(obj.valor), obj)
                indice.setdefault(clave(obj.etiqueta), obj)
            self.catalogos[modelo] = indice
        obj = next((indice[clave(c)] for c in (valor, etiqueta) if clave(c) in indice), None)
        if obj is None:
            nuevo_valor = slugify(str(valor or etiqueta))[:60] or "sin-valor"
            obj, creado = modelo.objects.get_or_create(
                valor=nuevo_valor, defaults={"etiqueta": texto(etiqueta or valor, 120)}
            )
            if creado:
                self.informe.creados[modelo._meta.verbose_name_plural] += 1
                self.informe.aviso(
                    f"Se añadió «{obj.etiqueta}» a {modelo._meta.verbose_name_plural}."
                )
        for alias in (valor, etiqueta, obj.valor, obj.etiqueta):
            if clave(alias):
                indice.setdefault(clave(alias), obj)
        return obj

    def tipo_trabajo(self, referencia, tipo_equipo, minutos=None) -> cat.TipoTrabajo:
        """La solicitud guarda el ID del tipo de trabajo o, en datos antiguos, su nombre;
        el nombre se busca solo entre los del tipo de equipo ("Instalación" existe para
        colectores y para repetidores)."""
        if referencia in self.tipos_trabajo_por_id:
            return self.tipos_trabajo_por_id[referencia]
        nombre = texto(referencia, 120) or "Sin especificar"
        llave = (tipo_equipo.pk, clave(nombre))
        if llave not in self.tipos_trabajo_por_nombre:
            for tt in cat.TipoTrabajo.objects.filter(tipo_equipo=tipo_equipo):
                self.tipos_trabajo_por_nombre.setdefault((tipo_equipo.pk, clave(tt.nombre)), tt)
        if llave not in self.tipos_trabajo_por_nombre:
            self.tipos_trabajo_por_nombre[llave] = cat.TipoTrabajo.objects.create(
                tipo_equipo=tipo_equipo, nombre=nombre, tiempo_estimado_minutos=minutos or 30
            )
            self.informe.creados["tipos de trabajo"] += 1
            self.informe.aviso(f"Se añadió el tipo de trabajo «{nombre}» para {tipo_equipo}.")
        return self.tipos_trabajo_por_nombre[llave]

    # --- colecciones -------------------------------------------------------------

    def importar_todo(self):
        self.configuracion()
        self.vehiculos()
        self.equipos()
        self.unidades_de_campo()
        self.solicitudes()
        self.ordenes()
        self.planes()
        self.notificaciones()
        self.fotos_de_perfil()
        for (que, valor, asignado), cuantos in sorted(self.valores_desconocidos.items()):
            self.informe.aviso(
                f"{cuantos} {que} con valor desconocido «{valor}»: quedaron como «{asignado}»."
            )
        return self.informe

    def configuracion(self):
        docs = {d["id"]: d for d in self.leer("appConfiguration")}
        ajustes = docs.get("mainSettings") or next(iter(docs.values()), None)
        if not ajustes:
            return
        for campo, modelo in CATALOGOS.items():
            for orden, item in enumerate(ajustes.get(campo) or []):
                valor, etiqueta = item.get("value"), item.get("label")
                if modelo is cat.RespuestaPredefinida:
                    # La app antigua insertaba `value` (el texto completo) y usaba `label`
                    # solo en el botón; la nueva inserta la etiqueta.
                    etiqueta = valor or etiqueta
                obj = self.catalogo(modelo, valor, etiqueta)
                if obj and obj.orden != orden:
                    obj.orden = orden
                    obj.save(update_fields=["orden"])

        for tipo in ajustes.get("tiposEquipos") or []:
            tipo_equipo = self.catalogo(cat.TipoEquipo, tipo.get("value"), tipo.get("label"))
            for tt in tipo.get("tiposDeTrabajoAsociados") or []:
                nombre = texto(tt.get("nombre"), 120)
                if not nombre:
                    continue
                obj, _ = cat.TipoTrabajo.objects.update_or_create(
                    tipo_equipo=tipo_equipo,
                    nombre=nombre,
                    defaults={
                        "tiempo_estimado_minutos": entero(tt.get("tiempoEstimadoMinutos")) or 30
                    },
                )
                if tt.get("id"):
                    self.tipos_trabajo_por_id[tt["id"]] = obj
                self.tipos_trabajo_por_nombre[(tipo_equipo.pk, clave(nombre))] = obj

        for loc in ajustes.get("localidades") or []:
            nombre = texto(loc.get("nombre"), 120)
            ubicacion = self.ubicar(loc.get("coordenadas"), f"Localidad «{nombre}»")
            if nombre and ubicacion:
                cat.Localidad.objects.update_or_create(
                    nombre=nombre, defaults={"ubicacion": ubicacion}
                )
            else:
                self.informe.aviso(f"Localidad «{nombre}»: sin nombre o coordenadas; se omite.")

        c = cat.Configuracion.get_solo()
        c.empresa_nombre = texto(ajustes.get("empresaNombre"), 150) or c.empresa_nombre
        c.empresa_unidad_negocio = (
            texto(ajustes.get("empresaUnidadNegocio"), 150) or c.empresa_unidad_negocio
        )
        c.empresa_departamento = (
            texto(ajustes.get("empresaDepartamento"), 150) or c.empresa_departamento
        )
        c.sede_central_nombre = (
            texto(ajustes.get("sedeCentralNombre"), 150) or c.sede_central_nombre
        )
        sede = punto(
            {
                "latitude": ajustes.get("sedeCentralLatitud"),
                "longitude": ajustes.get("sedeCentralLongitud"),
            }
        )
        c.sede_central_ubicacion = sede or c.sede_central_ubicacion
        c.hora_inicio_jornada = hora(ajustes.get("operatingHoursStart")) or c.hora_inicio_jornada
        c.hora_fin_jornada = hora(ajustes.get("operatingHoursEnd")) or c.hora_fin_jornada
        c.hora_inicio_almuerzo = hora(ajustes.get("lunchStartTime")) or c.hora_inicio_almuerzo
        c.hora_fin_almuerzo = hora(ajustes.get("lunchEndTime")) or c.hora_fin_almuerzo
        for origen, destino in (
            ("planningTimeMinutes", "minutos_planificacion"),
            ("reportingTimeMinutes", "minutos_reporte"),
            ("lunchTimeMinutes", "minutos_almuerzo"),
        ):
            if entero(ajustes.get(origen)) is not None:
                setattr(c, destino, entero(ajustes[origen]))
        if ajustes.get("timezone"):
            try:
                ZoneInfo(ajustes["timezone"])
                c.zona_horaria = ajustes["timezone"]
            except (KeyError, ValueError):
                pass
        c.save()
        self.informe.creados["configuración"] += 1

    def vehiculos(self):
        existentes = set(Vehiculo.objects.values_list("codigo", flat=True))
        placas = set(Vehiculo.objects.values_list("placa", flat=True))
        for d in self.leer("vehiculos"):
            codigo = texto(d["id"], 50)
            if codigo in existentes:
                self.informe.existentes["vehículos"] += 1
                continue
            placa = texto(d.get("placa") or codigo, 15).upper()
            if placa in placas:
                self.informe.aviso(f"Vehículo {codigo}: placa {placa} repetida; se usa el código.")
                placa = codigo[:15]
            Vehiculo.objects.create(
                codigo=codigo,
                placa=placa,
                tipo=self.catalogo(cat.TipoVehiculo, d.get("tipo") or "sin-tipo"),
                estado=self.catalogo(cat.EstadoVehiculo, d.get("estado") or "disponible"),
                custodio=self.usuario(d.get("custodioId")),
            )
            placas.add(placa)
            self.informe.creados["vehículos"] += 1

    def equipos(self):
        existentes = set(Equipo.objects.values_list("codigo", flat=True))
        sede = cat.Configuracion.get_solo().sede_central_ubicacion or Point(
            -79.9223, -2.1709, srid=4326
        )
        for d in self.leer("equipos"):
            codigo = texto(d["id"], 50)
            if codigo in existentes:
                self.informe.existentes["equipos"] += 1
                continue
            adicionales = dict(d.get("camposAdicionales") or {})
            ubicacion = self.ubicar(d.get("coordenadas"), f"Equipo {codigo}")
            if ubicacion is None:
                ubicacion = sede
                adicionales["ubicacion_pendiente"] = True
                self.informe.aviso(
                    f"Equipo {codigo}: sin coordenadas válidas; se ubicó en la sede "
                    "(campo adicional ubicacion_pendiente). Corrígelo en su ficha."
                )
            ip = texto(d.get("ip")) or None
            if ip:
                try:
                    ipaddress.ip_address(ip)
                except ValueError:
                    adicionales["ip_original"] = ip
                    ip = None
            comunicacion = (
                Equipo.TipoComunicacion.FIBRA
                if "fibra" in clave(d.get("tipoComunicacion"))
                else Equipo.TipoComunicacion.CELULAR
            )
            fabricacion = dia(d.get("fechaFabricacion"))
            equipo = Equipo.objects.create(
                codigo=codigo,
                tipo=self.catalogo(cat.TipoEquipo, d.get("tipo") or "sin-tipo"),
                marca=self.catalogo(cat.Marca, d.get("marca") or "sin-marca"),
                zona=self.catalogo(cat.Zona, d.get("zona") or "sin-zona"),
                estado=self.catalogo(cat.EstadoEquipo, d.get("estado") or "activo"),
                direccion=texto(d.get("direccion"), 255) or "Sin dirección",
                ubicacion=ubicacion,
                ip=ip,
                tipo_comunicacion=comunicacion,
                piloto=texto(d.get("piloto"), 100),
                fecha_fabricacion=fabricacion,
                fecha_ultima_revision=fecha_hora(d.get("fechaUltimaRevision")),
                revision_count=entero(d.get("revisionCount")) or 0,
                requiere_canasta=bool(d.get("requiereCanasta")),
                zona_peligrosa=bool(d.get("zonaPeligrosa")),
                proximo_mantenimiento_programado=dia(d.get("proximoMantenimientoProgramado")),
                intervalo_mantenimiento_dias=entero(d.get("intervaloMantenimientoDias")),
                intervalo_mantenimiento_revisiones=entero(
                    d.get("intervaloMantenimientoRevisiones")
                ),
                campos_adicionales=adicionales,
            )
            historial = [
                EquipoEstadoHistorial(
                    equipo=equipo,
                    estado=self.catalogo(cat.EstadoEquipo, h.get("estado") or "activo"),
                    fecha=fecha_hora(h.get("fecha")),
                    modificado_por=self.usuario(h.get("modificadoPor")),
                    motivo=texto(h.get("motivo")),
                )
                for h in d.get("estadoHistorial") or []
                if fecha_hora(h.get("fecha"))
            ]
            EquipoEstadoHistorial.objects.bulk_create(historial)
            self.informe.creados["equipos"] += 1

    def unidades_de_campo(self):
        vehiculos = {v.codigo: v for v in Vehiculo.objects.all()}
        for d in self.leer("fieldUnitCompositions"):
            vehiculo = vehiculos.get(d.get("vehiculoId"))
            if not vehiculo:
                self.informe.aviso(f"Unidad {d['id']}: vehículo {d.get('vehiculoId')} no existe.")
                continue
            unidad, creada = UnidadDeCampo.objects.get_or_create(vehiculo=vehiculo)
            if not creada:
                self.informe.existentes["unidades de campo"] += 1
                continue
            unidad.tecnicos.set(
                [u for u in (self.usuario(t) for t in d.get("tecnicos") or []) if u]
            )
            self.informe.creados["unidades de campo"] += 1

    def solicitudes(self):
        existentes = set(
            Solicitud.objects.exclude(firestore_id=None).values_list("firestore_id", flat=True)
        )
        display_usados = set(Solicitud.objects.values_list("display_id", flat=True))
        equipos = {e.codigo: e for e in Equipo.objects.select_related("tipo")}
        for d in self.leer("solicitudes"):
            if d["id"] in existentes:
                self.informe.existentes["solicitudes"] += 1
                continue
            equipo = equipos.get(d.get("equipoId"))
            if not equipo:
                self.informe.aviso(
                    f"Solicitud {d.get('displayId') or d['id']}: el equipo "
                    f"{d.get('equipoId')} no existe; se omite."
                )
                continue
            estado = self.estado(Solicitud.Estado, d.get("estado"), "pendiente", "solicitudes")
            solicitada = fecha_hora(d.get("fechaSolicitud")) or timezone.now()
            display_id = texto(d.get("displayId"), 30)
            if not display_id or display_id in display_usados:
                display_id = ""  # se genera uno nuevo al guardar
            s = Solicitud(
                firestore_id=d["id"],
                equipo=equipo,
                fecha_solicitud=solicitada,
                fecha_programada=dia(d.get("fechaProgramada"))
                or timezone.localtime(solicitada).date(),
                tipo_trabajo=self.tipo_trabajo(
                    d.get("tipoTrabajo"), equipo.tipo, entero(d.get("tiempoServicioEstimado"))
                ),
                tiempo_servicio_estimado=entero(d.get("tiempoServicioEstimado")),
                urgencia=self.catalogo(cat.Urgencia, d.get("urgencia") or "normal"),
                descripcion=texto(d.get("descripcion")),
                creado_por=self.usuario(d.get("creadoPor"), obligatorio=True),
                estado=estado,
                motivo_cancelacion=texto(d.get("motivoCancelacion")),
            )
            s.display_id = display_id
            s.save()
            display_usados.add(s.display_id)
            self.informe.creados["solicitudes"] += 1

    def ordenes(self):
        existentes = set(
            OrdenDeTrabajo.objects.exclude(firestore_id=None).values_list("firestore_id", flat=True)
        )
        display_usados = set(OrdenDeTrabajo.objects.values_list("display_id", flat=True))
        codigos_trabajo = set(Trabajo.objects.values_list("codigo", flat=True))
        vehiculos = {v.codigo: v for v in Vehiculo.objects.all()}
        equipos = {e.codigo: e for e in Equipo.objects.select_related("tipo")}
        solicitudes = {s.firestore_id: s for s in Solicitud.objects.exclude(firestore_id=None)}
        for d in self.leer("ordenesDeTrabajo"):
            if d["id"] in existentes:
                self.informe.existentes["órdenes de trabajo"] += 1
                continue
            display_id = texto(d.get("displayId"), 30)
            orden = OrdenDeTrabajo(
                firestore_id=d["id"],
                fecha_creacion=fecha_hora(d.get("fechaCreacion")) or timezone.now(),
                creado_por=self.usuario(d.get("creadoPor"), obligatorio=True),
            )
            orden.display_id = "" if not display_id or display_id in display_usados else display_id
            orden.save()
            display_usados.add(orden.display_id)

            for ua in d.get("unidadesAsignadas") or []:
                vehiculo = vehiculos.get(ua.get("vehiculoId"))
                if not vehiculo:
                    self.informe.aviso(
                        f"OT {orden.display_id}: vehículo {ua.get('vehiculoId')} no existe."
                    )
                    continue
                asignada = OTUnidadAsignada.objects.create(
                    orden=orden, ruta_id=texto(ua.get("rutaId"), 60), vehiculo=vehiculo
                )
                asignada.tecnicos.set(
                    [u for u in (self.usuario(t) for t in ua.get("tecnicos") or []) if u]
                )

            for secuencia, t in enumerate(d.get("trabajos") or [], start=1):
                self._trabajo(orden, secuencia, t, equipos, solicitudes, codigos_trabajo)

            estados = list(orden.trabajos.values_list("estado", flat=True))
            orden.estado_general = opcion(
                OrdenDeTrabajo.Estado, d.get("estadoGeneral")
            ) or OrdenDeTrabajo.calcular_estado(estados)
            orden.save(update_fields=["estado_general"])
            self.informe.creados["órdenes de trabajo"] += 1

    def _trabajo(self, orden, secuencia, t, equipos, solicitudes, codigos_usados):
        equipo = equipos.get(t.get("equipoId"))
        solicitud = solicitudes.get(t.get("solicitudId"))
        if not equipo or not solicitud:
            falta = "equipo" if not equipo else "solicitud"
            self.informe.aviso(
                f"OT {orden.display_id}, trabajo {t.get('id') or secuencia}: "
                f"su {falta} no existe; se omite."
            )
            return
        codigo = texto(t.get("id"), 40)
        if not codigo or codigo in codigos_usados:
            codigo = f"{orden.display_id}-T{secuencia}"
        estado = self.estado(Trabajo.Estado, t.get("estado"), "Pendiente", "trabajos")
        trabajo = Trabajo.objects.create(
            orden=orden,
            codigo=codigo,
            secuencia=secuencia,
            equipo=equipo,
            solicitud=solicitud,
            tipo_trabajo=(
                self.tipo_trabajo(t["tipoTrabajo"], equipo.tipo)
                if t.get("tipoTrabajo")
                else solicitud.tipo_trabajo
            ),
            tiempo_servicio_estimado=entero(t.get("tiempoServicioEstimado"))
            or solicitud.tiempo_servicio_estimado,
            estado=estado,
            detalles=texto(t.get("detalles")),
            hallazgos=texto(t.get("hallazgos")),
            completado_por=self.usuario(t.get("completadoPor")),
            fecha_finalizacion=fecha_hora(t.get("fechaFinalizacion")),
            observacion_ingeniero=texto(t.get("observacionIngeniero")),
            observacion_ingeniero_por=self.usuario(t.get("observacionIngenieroPor")),
            fecha_observacion_ingeniero=fecha_hora(t.get("fechaObservacionIngeniero")),
            requiere_nueva_revision=bool(t.get("requiereNuevaRevision")),
            fecha_nueva_revision=dia(t.get("fechaNuevaRevision")),
            motivo_cancelacion=texto(t.get("motivoCancelacion")),
        )
        codigos_usados.add(codigo)
        for url in t.get("fotos") or []:
            if isinstance(url, str) and url.startswith("http"):
                self.informe.fotos_pendientes.append(("trabajo", trabajo.pk, url))
        self.informe.creados["trabajos"] += 1

    def planes(self):
        existentes = set(
            PlanMantenimiento.objects.exclude(firestore_id=None).values_list(
                "firestore_id", flat=True
            )
        )
        equipos = {e.codigo: e for e in Equipo.objects.all()}
        solicitudes = {s.firestore_id: s for s in Solicitud.objects.exclude(firestore_id=None)}
        for d in self.leer("planesDeMantenimiento"):
            if d["id"] in existentes:
                self.informe.existentes["planes de mantenimiento"] += 1
                continue
            estado = self.estado(
                PlanMantenimiento.Estado, d.get("estado"), "borrador", "planes de mantenimiento"
            )
            plan = PlanMantenimiento.objects.create(
                firestore_id=d["id"],
                nombre=texto(d.get("nombre"), 150) or "Plan sin nombre",
                fecha_creacion=fecha_hora(d.get("fechaCreacion")) or timezone.now(),
                creado_por=self.usuario(d.get("creadoPor"), obligatorio=True),
                tiempo_de_ejecucion_dias=entero(d.get("tiempoDeEjecucionDias")) or 1,
                exclusiones=d.get("exclusiones") or [],
                estado=estado,
                estadisticas=d.get("estadisticas") or {},
            )
            calendario = []
            for m in d.get("calendario") or []:
                equipo = equipos.get(m.get("equipoId"))
                fecha = dia(m.get("fechaProgramada"))
                if not equipo or not fecha:
                    self.informe.aviso(
                        f"Plan «{plan.nombre}»: se omite el mantenimiento de {m.get('equipoId')}."
                    )
                    continue
                calendario.append(
                    MantenimientoProgramado(
                        plan=plan,
                        equipo=equipo,
                        fecha_programada=fecha,
                        solicitud=solicitudes.get(m.get("solicitudId")),
                        estado=self.estado(
                            MantenimientoProgramado.Estado,
                            m.get("estado"),
                            "programado",
                            "mantenimientos programados",
                        ),
                        motivo_prioridad=texto(m.get("motivoPrioridad")),
                    )
                )
            MantenimientoProgramado.objects.bulk_create(calendario)
            self.informe.creados["planes de mantenimiento"] += 1

    def notificaciones(self):
        existentes = set(
            Notificacion.objects.exclude(firestore_id=None).values_list("firestore_id", flat=True)
        )
        # Firestore enlazaba con su ID de documento; la app nueva usa la clave primaria.
        ids_nuevos = dict(
            OrdenDeTrabajo.objects.exclude(firestore_id=None).values_list("firestore_id", "pk")
        )
        ids_nuevos.update(
            Solicitud.objects.exclude(firestore_id=None).values_list("firestore_id", "pk")
        )
        nuevas, omitidas, sin_destino = [], 0, 0
        for d in self.leer("notificaciones"):
            if d["id"] in existentes:
                self.informe.existentes["notificaciones"] += 1
                continue
            usuario = self.usuario(d.get("userId"))
            if not usuario:
                omitidas += 1
                continue
            entidad_id, entidad_url = texto(d.get("entidadId")), texto(d.get("entidadUrl"))
            if entidad_id in ids_nuevos:
                pk = str(ids_nuevos[entidad_id])
                entidad_url = entidad_url.replace(f"/{entidad_id}", f"/{pk}")
                entidad_id = pk
            elif entidad_id and f"/{entidad_id}" in entidad_url:
                # Apunta a algo que no se migró: se enlaza al listado.
                entidad_url = entidad_url.split(f"/{entidad_id}")[0]
                sin_destino += 1
            nuevas.append(
                Notificacion(
                    firestore_id=d["id"],
                    usuario=usuario,
                    mensaje=texto(d.get("mensaje")),
                    tipo=self.estado(
                        Notificacion.Tipo, d.get("tipo"), "info_general", "notificaciones"
                    ),
                    fecha_creacion=fecha_hora(d.get("fechaCreacion")) or timezone.now(),
                    leida=bool(d.get("leida")),
                    entidad_id=entidad_id[:60],
                    entidad_url=entidad_url[:255],
                    creada_por=self.usuario(d.get("creadaPor")),
                )
            )
        Notificacion.objects.bulk_create(nuevas, batch_size=1000)
        self.informe.creados["notificaciones"] += len(nuevas)
        if omitidas:
            self.informe.aviso(f"{omitidas} notificaciones de usuarios no migrados se omitieron.")
        if sin_destino:
            self.informe.aviso(
                f"{sin_destino} notificaciones apuntaban a registros no migrados; "
                "ahora enlazan al listado."
            )

    def fotos_de_perfil(self):
        for d in self.leer("users"):
            usuario = self.usuario(d.get("id"))
            url = d.get("fotoUrl")
            if usuario and not usuario.foto and isinstance(url, str) and url.startswith("http"):
                self.informe.fotos_pendientes.append(("usuario", usuario.pk, url))


# --- fotos (fuera de la transacción: son descargas lentas) -------------------------


def descargar_fotos(pendientes: list[tuple], informe: Informe, cliente: httpx.Client | None = None):
    """Descarga las fotos de Firebase Storage y las guarda en MEDIA_ROOT.

    Las URL de descarga de Firebase llevan su token, así que no hace falta
    credencial. Si una falla, se avisa y se sigue con las demás.
    """
    cliente = cliente or httpx.Client(timeout=30, follow_redirects=True)
    for tipo, pk, url in pendientes:
        nombre = Path(httpx.URL(url).path).name.rsplit("%2F", 1)[-1] or "foto.jpg"
        try:
            respuesta = cliente.get(url)
            respuesta.raise_for_status()
        except httpx.HTTPError as error:
            informe.aviso(f"No se pudo descargar una foto ({tipo} {pk}): {error}")
            continue
        contenido = ContentFile(respuesta.content, name=nombre)
        if tipo == "usuario":
            usuario = User.objects.get(pk=pk)
            usuario.foto.save(nombre, contenido, save=True)
        else:
            TrabajoFoto.objects.create(trabajo_id=pk, imagen=contenido)
        informe.creados["fotos"] += 1
    return informe
