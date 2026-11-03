// @ts-expect-error Node strip-types requiere extensión explícita.
import { fechaTexto } from "./formato.ts";
import type { Rol } from "./tipos";

/** Estados del backlog. `hecho` y `cancelada` cierran la tarea. */
export const ESTADOS = { por_hacer: "Por hacer", en_curso: "En curso", en_revision: "En revisión", hecho: "Hecho", cancelada: "Cancelada" } as const;
export type EstadoTarea = keyof typeof ESTADOS;
/** Columnas del tablero (las canceladas no se muestran). */
export const COLUMNAS: EstadoTarea[] = ["por_hacer", "en_curso", "en_revision", "hecho"];
export const abierta = (e: EstadoTarea) => e !== "hecho" && e !== "cancelada";

export const PRIORIDADES = { alta: "Alta", media: "Media", baja: "Baja" } as const;
export type Prioridad = keyof typeof PRIORIDADES;
export const TONO_PRIORIDAD: Record<Prioridad, string> = { alta: "peligro", media: "aviso", baja: "info" };
const PESO_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export const DOCUMENTOS = { orden: "Orden de compra", factura: "Factura", ventas_dia: "Día de venta", apertura_proyecto: "Apertura", apertura_item: "Ítem de apertura" } as const;
export type TipoDocumento = keyof typeof DOCUMENTOS;
export const MODULOS = { compras: "Compras", facturas: "Facturas", ventas: "Ventas", aperturas: "Aperturas", sin: "Sin documento" } as const;
export type Modulo = keyof typeof MODULOS;
export const moduloDe = (tipo: TipoDocumento | null): Modulo =>
  tipo === "orden" ? "compras" : tipo === "factura" ? "facturas" : tipo === "ventas_dia" ? "ventas" : tipo ? "aperturas" : "sin";

/** Una fila de `tareas_visibles`. */
export type Tarea = {
  id: string; numero: number; titulo: string; descripcion: string | null; estado: EstadoTarea; prioridad: Prioridad; vence: string | null;
  asignado_a: string; asignado: string; asignado_activo: boolean; creado_por: string | null; creador: string | null;
  sucursal_id: string | null; sucursal: string | null; origen: "manual" | "automatica";
  documento_tipo: TipoDocumento | null; documento_id: string | null; documento_texto: string | null; documento_ruta: string | null; documento_anulado: boolean;
  motivo_cierre: string | null; revision: number; creada_en: string; actualizada_en: string; cerrada_en: string | null;
};
export type Quien = { id: string; rol: Rol; sucursal_id: string | null };

export const clave = (numero: number) => `DODO-${numero}`;
export function numeroDeClave(texto: string): number | null {
  const m = /^(?:dodo-)?(\d{1,12})$/i.exec(texto.trim());
  return m ? Number(m[1]) : null;
}

/** Quien creó la tarea, un admin o el gerente de la sucursal (si no es quien la tiene asignada): edita, cierra, regresa y cancela. Espejo de administra_tarea. */
export const administra = (t: Tarea, q: Quien) =>
  q.rol === "admin" || (t.creado_por !== null && t.creado_por === q.id) || (q.rol === "gerente" && t.sucursal_id !== null && t.sucursal_id === q.sucursal_id && t.asignado_a !== q.id);

const AVANCE: Partial<Record<EstadoTarea, EstadoTarea[]>> = { por_hacer: ["en_curso", "en_revision"], en_curso: ["en_revision"] };
const CIERRE: Partial<Record<EstadoTarea, EstadoTarea[]>> = { en_revision: ["hecho", "en_curso"] };

/** Estados a los que esta persona puede mover la tarea, en el orden de los botones. La base de datos vuelve a validar. */
export function siguientes(t: Tarea, q: Quien): EstadoTarea[] {
  if (q.rol === "corporativo" || !abierta(t.estado)) return [];
  const manda = administra(t, q), out: EstadoTarea[] = [];
  if (manda || t.asignado_a === q.id) out.push(...(AVANCE[t.estado] ?? []));
  if (manda) out.push(...(CIERRE[t.estado] ?? []), "cancelada");
  return out;
}
export const pideComentario = (de: EstadoTarea, a: EstadoTarea) => a === "cancelada" || (de === "en_revision" && a === "en_curso");

export const puedeCrearTareas = (rol: Rol) => rol === "admin" || rol === "gerente" || rol === "encargado";
/** Ligar exige ver el documento: compras y aperturas son de oficina; el gerente liga días de venta de su sucursal. */
export const puedeLigar = (rol: Rol, tipo: TipoDocumento) => rol === "admin" || (rol === "gerente" && tipo === "ventas_dia");
/** Si no puede abrirlo, la tarea muestra el texto del documento sin enlace. */
export const puedeAbrirDocumento = (rol: Rol, tipo: TipoDocumento) =>
  rol === "admin" || rol === "corporativo" || (rol === "gerente" && tipo === "ventas_dia");
export const veTablero = (rol: Rol) => rol !== "operacion";

export const GRUPOS_VENCE = { vencidas: "Vencidas", hoy: "Hoy", semana: "Esta semana", despues: "Después", sin_fecha: "Sin fecha" } as const;
export type GrupoVence = keyof typeof GRUPOS_VENCE;
const masDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
export function grupoVence(vence: string | null, hoy: string): GrupoVence {
  if (!vence) return "sin_fecha";
  if (vence < hoy) return "vencidas";
  if (vence === hoy) return "hoy";
  return vence <= masDias(hoy, 7) ? "semana" : "despues";
}
export const vencida = (t: Tarea, hoy: string) => abierta(t.estado) && t.vence !== null && t.vence < hoy;

/** Vencidas primero, luego prioridad, luego fecha (sin fecha al final) y número. */
export function ordenPendientes(ts: Tarea[], hoy: string): Tarea[] {
  return [...ts].sort((a, b) =>
    Number(vencida(b, hoy)) - Number(vencida(a, hoy)) || PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad]
    || (a.vence ?? "9999-12-31").localeCompare(b.vence ?? "9999-12-31") || a.numero - b.numero);
}
/** Grupos no vacíos en el orden de GRUPOS_VENCE; dentro, por fecha y prioridad. */
export function agrupar(ts: Tarea[], hoy: string): [GrupoVence, Tarea[]][] {
  const orden = [...ts].sort((a, b) => (a.vence ?? "9999-12-31").localeCompare(b.vence ?? "9999-12-31") || PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad] || a.numero - b.numero);
  return (Object.keys(GRUPOS_VENCE) as GrupoVence[]).map((g) => [g, orden.filter((t) => grupoVence(t.vence, hoy) === g)] as [GrupoVence, Tarea[]]).filter(([, l]) => l.length);
}

export type FiltrosTablero = { persona: string; sucursal: string; prioridad: Prioridad | ""; modulo: Modulo | ""; vencidas: boolean; origen: "manual" | "automatica" | "" };
export function leerFiltros(p: Record<string, string | undefined>): FiltrosTablero {
  const de = <T extends string>(v: string | undefined, validos: Record<T, unknown>): T | "" => (v && Object.hasOwn(validos, v) ? (v as T) : "");
  return {
    persona: p.persona ?? "", sucursal: p.sucursal ?? "", prioridad: de(p.prioridad, PRIORIDADES), modulo: de(p.modulo, MODULOS),
    vencidas: p.vencidas === "1", origen: de(p.origen, { manual: 1, automatica: 1 }),
  };
}
export function filtrar(ts: Tarea[], f: FiltrosTablero, hoy: string): Tarea[] {
  return ts.filter((t) => (!f.persona || t.asignado_a === f.persona) && (!f.sucursal || (f.sucursal === "oficina" ? t.sucursal_id === null : t.sucursal_id === f.sucursal))
    && (!f.prioridad || t.prioridad === f.prioridad) && (!f.modulo || moduloDe(t.documento_tipo) === f.modulo)
    && (!f.vencidas || vencida(t, hoy)) && (!f.origen || t.origen === f.origen));
}

/** Pestaña «En revisión (me toca cerrar)»: lo que creé, o lo de mi sucursal si soy gerente. */
export const meTocaCerrar = (t: Tarea, q: Quien) =>
  t.estado === "en_revision" && ((t.creado_por !== null && t.creado_por === q.id) || (q.rol === "gerente" && t.sucursal_id !== null && t.sucursal_id === q.sucursal_id && t.asignado_a !== q.id));

export type DatosTarea = {
  titulo: string; descripcion: string; prioridad: Prioridad; vence: string; asignado_a: string; sucursal_id: string;
  documento_tipo: TipoDocumento | ""; documento_id: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fechaValida = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
/** Lee el formulario de alta o edición. Lo vacío queda como "" (la función SQL lo convierte en null). */
export function leerNuevaTarea(get: (c: string) => string): { datos: DatosTarea } | { error: string } {
  const titulo = get("titulo").trim(), descripcion = get("descripcion").trim(), prioridad = get("prioridad").trim() || "media";
  const vence = get("vence").trim(), asignado_a = get("asignado_a").trim(), sucursal_id = get("sucursal_id").trim();
  const documento_tipo = get("documento_tipo").trim(), documento_id = get("documento_id").trim();
  if (titulo.length < 3 || titulo.length > 200) return { error: "El título debe tener de 3 a 200 caracteres." };
  if (descripcion.length > 4000) return { error: "La descripción es demasiado larga (máximo 4000 caracteres)." };
  if (!Object.hasOwn(PRIORIDADES, prioridad)) return { error: "Prioridad inválida." };
  if (vence && !fechaValida(vence)) return { error: "La fecha de vencimiento no es válida." };
  if (!UUID.test(asignado_a)) return { error: "Elige a quién se asigna la tarea." };
  if (sucursal_id && !UUID.test(sucursal_id)) return { error: "Sucursal inválida." };
  if (!documento_tipo !== !documento_id || (documento_tipo && (!Object.hasOwn(DOCUMENTOS, documento_tipo) || !UUID.test(documento_id))))
    return { error: "El documento ligado está incompleto." };
  return { datos: { titulo, descripcion, prioridad: prioridad as Prioridad, vence, asignado_a, sucursal_id, documento_tipo: documento_tipo as TipoDocumento | "", documento_id } };
}

/** Una fila de `hilo_tarea`: comentario o cambio. En `asignado_a`, antes/después ya vienen como nombres. */
export type EntradaHilo = { tipo: "comentario" | "cambio"; autor: string | null; texto: string | null; campo: string | null; antes: string | null; despues: string | null; fecha: string };
const nombreDe = (catalogo: Record<string, string>, v: string | null) => (v && catalogo[v]) ?? v ?? "sin fecha";
export function textoCambio(e: EntradaHilo): string {
  switch (e.campo) {
    case "creada": return "creó la tarea";
    case "estado": return `la movió de ${nombreDe(ESTADOS, e.antes)} a ${nombreDe(ESTADOS, e.despues)}`;
    case "asignado_a": return `la reasignó de ${e.antes ?? "nadie"} a ${e.despues ?? "nadie"}`;
    case "prioridad": return `cambió la prioridad de ${nombreDe(PRIORIDADES, e.antes)} a ${nombreDe(PRIORIDADES, e.despues)}`;
    case "vence": return `cambió el vencimiento de ${e.antes ? fechaTexto(e.antes) : "sin fecha"} a ${e.despues ? fechaTexto(e.despues) : "sin fecha"}`;
    case "titulo": return "cambió el título";
    case "descripcion": return "editó la descripción";
    case "resuelta": return "la cerró: el pendiente ya se resolvió en el documento";
    default: return "actualizó la tarea";
  }
}

/** Una fila de `generar_tareas_automaticas`: lo que hizo cada regla en una corrida. */
export type ResultadoRegla = { regla: string; creadas: number; cerradas: number };
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** «3 tareas creadas y 1 cerrada», o que no hubo cambios. */
export function resumenGeneracion(filas: ResultadoRegla[]): string {
  const creadas = filas.reduce((s, f) => s + f.creadas, 0), cerradas = filas.reduce((s, f) => s + f.cerradas, 0);
  if (!creadas && !cerradas) return "Sin cambios: no hay pendientes nuevos ni tareas por cerrar.";
  return [creadas && plural(creadas, "tarea creada", "tareas creadas"), cerradas && plural(cerradas, "tarea cerrada", "tareas cerradas")].filter(Boolean).join(" y ") + ".";
}
