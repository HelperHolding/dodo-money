import type { Rol } from "./tipos";

/** Help Desk: problemas y mejoras del sistema. Espejo de la migración 20261123120000_soporte. */
export const TIPOS = { problema: "Problema", mejora: "Mejora" } as const;
export type TipoTicket = keyof typeof TIPOS;
export const ESTADOS = { nuevo: "Nuevo", en_revision: "En revisión", en_progreso: "En progreso", resuelto: "Resuelto", descartado: "Descartado" } as const;
export type EstadoTicket = keyof typeof ESTADOS;
/** Columnas del tablero; Descartado solo sale en la lista. */
export const COLUMNAS: EstadoTicket[] = ["nuevo", "en_revision", "en_progreso", "resuelto"];
export const PRIORIDADES = { alta: "Alta", media: "Media", baja: "Baja" } as const;
export type Prioridad = keyof typeof PRIORIDADES;
export const TONO_PRIORIDAD: Record<Prioridad, string> = { alta: "peligro", media: "aviso", baja: "info" };
export const TONO_ESTADO: Record<EstadoTicket, string | undefined> = { nuevo: "aviso", en_revision: "info", en_progreso: "info", resuelto: "exito", descartado: undefined };
export const BUCKET_SOPORTE = "soporte";
export const OTRA_SECCION = "Otra / general";

/** Soporte = puesto admin (Sebastián y Julio). */
export const esSoporte = (rol: Rol) => rol === "admin";
export const cerrado = (e: EstadoTicket) => e === "resuelto" || e === "descartado";
export const clave = (numero: number) => `HD-${numero}`;
export function numeroDeClave(texto: string): number | null {
  const m = /^(?:hd-)?(\d{1,12})$/i.exec(texto.trim());
  return m ? Number(m[1]) : null;
}

const PASOS: Record<EstadoTicket, EstadoTicket[]> = {
  nuevo: ["en_revision", "en_progreso", "resuelto", "descartado"],
  en_revision: ["en_progreso", "resuelto", "descartado"],
  en_progreso: ["en_revision", "resuelto", "descartado"],
  resuelto: ["en_progreso"],
  descartado: ["en_revision"],
};
/** Estados a los que soporte puede mover el ticket. cambiar_ticket vuelve a validar. */
export const siguientes = (e: EstadoTicket): EstadoTicket[] => PASOS[e];
/** Cerrar pide la respuesta para quien lo levantó. */
export const pideComentario = (a: EstadoTicket) => a === "resuelto" || a === "descartado";

/** Prefijo de ruta → sección del formulario. Gana el más largo; "/" solo cuenta exacto. */
export const SECCIONES: readonly { prefijo: string; nombre: string }[] = [
  { prefijo: "/", nombre: "Inicio" }, { prefijo: "/arqueo", nombre: "Arqueo" }, { prefijo: "/movimientos", nombre: "Movimientos" },
  { prefijo: "/caja-chica", nombre: "Gastos (caja chica)" }, { prefijo: "/cierre", nombre: "Cierre del día" }, { prefijo: "/checklists", nombre: "Checklists" },
  { prefijo: "/turnos", nombre: "Turnos" }, { prefijo: "/recepciones", nombre: "Recepciones" }, { prefijo: "/recolecciones", nombre: "Recolecciones" },
  { prefijo: "/tareas", nombre: "Tareas" }, { prefijo: "/ventas", nombre: "Ventas" }, { prefijo: "/compras", nombre: "Compras" },
  { prefijo: "/orden-compra", nombre: "Compras" }, { prefijo: "/inventario", nombre: "Inventario" }, { prefijo: "/activos", nombre: "Mantenimiento y activos" },
  { prefijo: "/finanzas", nombre: "Finanzas" }, { prefijo: "/banca", nombre: "Banca" }, { prefijo: "/efectivo", nombre: "Efectivo" },
  { prefijo: "/catalogos", nombre: "Catálogos" }, { prefijo: "/aperturas", nombre: "Aperturas" }, { prefijo: "/cumplimiento", nombre: "Cumplimiento" },
  { prefijo: "/administracion", nombre: "Usuarios y sucursales" }, { prefijo: "/correos", nombre: "Correos" }, { prefijo: "/conocimiento", nombre: "Conocimiento" },
  { prefijo: "/asistente", nombre: "Asistente IA" }, { prefijo: "/corporativo", nombre: "Vista general" }, { prefijo: "/reporte", nombre: "Reportes" },
  { prefijo: "/cuenta", nombre: "Mi cuenta" },
];
export const NOMBRES_SECCION: readonly string[] = [...new Set(SECCIONES.map((s) => s.nombre)), OTRA_SECCION];
export function seccionDeRuta(ruta: string | null | undefined): string {
  const r = (ruta ?? "").split(/[?#]/)[0];
  const s = SECCIONES.filter((x) => (x.prefijo === "/" ? r === "/" : r === x.prefijo || r.startsWith(`${x.prefijo}/`)))
    .sort((a, b) => b.prefijo.length - a.prefijo.length)[0];
  return s?.nombre ?? OTRA_SECCION;
}
/** Solo rutas internas de un solo "/", sin control ni barra invertida, de hasta 300 caracteres; si no, null. */
export const rutaInterna = (r: string) => (/^\/(?!\/)[^\\\x00-\x1f]{0,299}$/.test(r) ? r : null);

export type NuevoTicket = { tipo: TipoTicket; titulo: string; descripcion: string; seccion: string; ruta_origen: string | null; bloquea: boolean };
/** Lee el formulario de alta. crear_ticket vuelve a validar. */
export function leerNuevoTicket(leer: (campo: string) => string): { datos: NuevoTicket } | { error: string } {
  const tipo = leer("tipo");
  if (tipo !== "problema" && tipo !== "mejora") return { error: "Elige si es un problema o una mejora." };
  const titulo = leer("titulo").trim(), descripcion = leer("descripcion").trim(), seccion = leer("seccion").trim();
  if (titulo.length < 5 || titulo.length > 150) return { error: "El título debe tener de 5 a 150 caracteres." };
  if (descripcion.length < 10 || descripcion.length > 4000) return { error: "Describe el ticket con 10 a 4000 caracteres." };
  if (!NOMBRES_SECCION.includes(seccion)) return { error: "Elige la sección del sistema." };
  return { datos: { tipo, titulo, descripcion, seccion, ruta_origen: rutaInterna(leer("ruta_origen")), bloquea: tipo === "problema" && leer("bloquea") === "1" } };
}

/** Una fila de tickets_visibles. */
export type Ticket = {
  id: string; numero: number; tipo: TipoTicket; estado: EstadoTicket; prioridad: Prioridad; titulo: string; descripcion: string;
  seccion: string; ruta_origen: string | null; bloquea: boolean; captura: string | null;
  creado_por: string; creador: string; rol_creador: string; sucursal_id: string | null; sucursal: string | null;
  responsable: string | null; responsable_nombre: string | null; revision: number;
  creado_en: string; actualizado_en: string; cerrado_en: string | null; sin_leer: boolean;
  agente_estado: string | null;
};
/** Una fila de hilo_ticket. */
export type EntradaHilo = {
  tipo: "comentario" | "cambio"; autor: string | null; es_soporte: boolean | null; texto: string | null;
  campo: string | null; antes: string | null; despues: string | null; fecha: string; es_agente: boolean | null; interna: boolean | null;
};
export function textoCambio(e: EntradaHilo): string {
  const de = (v: string | null, mapa: Record<string, string>) => (v ? mapa[v] ?? v : "—");
  if (e.campo === "creado") return "levantó el ticket";
  if (e.campo === "estado") return `cambió el estado de «${de(e.antes, ESTADOS)}» a «${de(e.despues, ESTADOS)}»`;
  if (e.campo === "prioridad") return `cambió la prioridad de ${de(e.antes, PRIORIDADES)} a ${de(e.despues, PRIORIDADES)}`;
  if (e.campo === "responsable") return e.despues ? `asignó el ticket a ${e.despues}` : "quitó el responsable";
  return `cambió ${e.campo ?? "el ticket"}`;
}

export type Filtros = { tipo?: string; estado?: string; seccion?: string; prioridad?: string; sucursal?: string; q?: string };
/** Filtros de la lista de soporte. Sucursal vacía se busca como "Oficina"; el texto acepta HD-14. */
export function filtrar(ts: Ticket[], f: Filtros): Ticket[] {
  const q = (f.q ?? "").trim().toLowerCase(), n = q ? numeroDeClave(q) : null;
  return ts.filter((t) => (!f.tipo || t.tipo === f.tipo) && (!f.estado || t.estado === f.estado) && (!f.seccion || t.seccion === f.seccion)
    && (!f.prioridad || t.prioridad === f.prioridad) && (!f.sucursal || (t.sucursal ?? "Oficina") === f.sucursal)
    && (!q || n === t.numero || t.titulo.toLowerCase().includes(q) || t.descripcion.toLowerCase().includes(q)));
}
const TREINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
/** El tablero muestra todo lo abierto y lo resuelto en los últimos 30 días; descartados solo en la lista. */
export function enTablero(t: Ticket, ahoraMs: number): boolean {
  if (t.estado === "descartado") return false;
  if (t.estado !== "resuelto") return true;
  return t.cerrado_en !== null && ahoraMs - Date.parse(t.cerrado_en) <= TREINTA_DIAS;
}
