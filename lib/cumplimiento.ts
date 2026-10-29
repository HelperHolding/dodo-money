/** Calendario de cumplimiento: obligaciones, compromisos con servicio y mantenimientos en una sola lista. Fechas YYYY-MM-DD.
 * Sin imports: lo usan componentes de cliente y las pruebas con strip-types. */
export type TipoObligacion = "permiso" | "licencia" | "proteccion_civil" | "extintores" | "tramite_fiscal" | "seguro" | "otro";
export const TIPOS: Record<TipoObligacion, string> = {
  permiso: "Permiso", licencia: "Licencia", proteccion_civil: "Protección civil", extintores: "Extintores",
  tramite_fiscal: "Trámite fiscal", seguro: "Seguro", otro: "Otro",
};
export type Frecuencia = "semanal" | "quincenal" | "mensual" | "bimestral" | "anual";
export const FRECUENCIAS: Record<Frecuencia, string> = { semanal: "Semanal", quincenal: "Quincenal (15 y último día)", mensual: "Mensual", bimestral: "Bimestral", anual: "Anual" };
export type Origen = "obligacion" | "compromiso" | "mantenimiento";
export const ORIGENES: Record<Origen, string> = { obligacion: "Obligaciones", compromiso: "Compromisos fijos", mantenimiento: "Mantenimiento de activos" };
export type EstadoCumplimiento = "pendiente" | "por_vencer" | "vencida" | "cumplida" | "cumplida_sin_factura" | "omitida";
export const ESTADOS: Record<EstadoCumplimiento, { texto: string; tono: string }> = {
  pendiente: { texto: "Pendiente", tono: "info" }, por_vencer: { texto: "Por vencer", tono: "aviso" }, vencida: { texto: "Vencida", tono: "peligro" },
  cumplida: { texto: "Cumplida", tono: "exito" }, cumplida_sin_factura: { texto: "Cumplida, falta factura", tono: "aviso" }, omitida: { texto: "Omitida", tono: "gris" },
};
export type TipoAviso = "vencida" | "por_vencer" | "sin_factura";
export type Canal = "correo" | "chat";

export type Obligacion = {
  id: string; tipo: TipoObligacion; nombre: string; descripcion: string | null; autoridad: string | null; folio: string | null; notas: string | null;
  sucursal_id: string | null; razon_social_rfc: string | null; frecuencia: Frecuencia; inicio: string; fin: string | null;
  con_pago: boolean; proveedor_id: string | null; monto_estimado: number | null; revision: number;
};
/** Una fila de `cumplimiento_en_rango`. */
export type FilaCumplimiento = {
  origen: Origen; referencia_id: string; fecha_id: string | null; revision: number; titulo: string; detalle: string; tipo: string;
  sucursal_id: string | null; razon_social_rfc: string | null; ambito: string | null; vence: string; fecha: string; frecuencia: Frecuencia | null;
  estado: EstadoCumplimiento; falta_evidencia: boolean; falta_factura: boolean; factura_id: string | null; ruta: string;
};
/** Una fila de `avisos_cumplimiento` con la liga absoluta que arma el endpoint. */
export type AvisoCumplimiento = {
  clave: string; origen: Origen; referencia_id: string; titulo: string; detalle: string; ambito: string | null; vence: string;
  tipo_aviso: TipoAviso; dias: number; ruta: string; url: string;
};

const LOS_DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function textoFrecuencia(frecuencia: Frecuencia, inicio: string): string {
  const [, m, d] = inicio.split("-").map(Number);
  if (frecuencia === "semanal") return `Cada semana, los ${LOS_DIAS[new Date(`${inicio}T00:00:00Z`).getUTCDay()]}`;
  if (frecuencia === "quincenal") return "Cada quincena: día 15 y último día del mes";
  if (frecuencia === "anual") return `Cada año, el ${d} de ${MESES[m - 1]}${m === 2 && d === 29 ? " (o el 28 si no es bisiesto)" : ""}`;
  return `${frecuencia === "mensual" ? "Cada mes" : "Cada 2 meses"}, día ${d}${d > 28 ? " (o el último del mes)" : ""}`;
}

export const ambitoDe = (f: { sucursal_id: string | null; razon_social_rfc: string | null }) => (f.sucursal_id ? `s:${f.sucursal_id}` : `r:${f.razon_social_rfc}`);

export type FiltroEstado = "vigentes" | "pendiente" | "por_vencer" | "vencida" | "cumplida_sin_factura" | "sin_evidencia" | "cumplida" | "todos";
export const FILTROS_ESTADO: Record<FiltroEstado, string> = {
  vigentes: "Todo menos omitidas", pendiente: "Pendientes", por_vencer: "Por vencer", vencida: "Vencidas",
  cumplida_sin_factura: "Cumplidas sin factura", sin_evidencia: "Sin evidencia", cumplida: "Cumplidas", todos: "Todas, incluidas omitidas",
};

/** `tipo` (opcional) solo aplica a obligaciones: con un tipo elegido, se muestran solo las obligaciones de ese tipo. */
export function filtrarFilas(filas: FilaCumplimiento[], f: { origen: string; estado: FiltroEstado; ambito: string; tipo?: string }): FilaCumplimiento[] {
  const tipo = f.tipo ?? "";
  return filas.filter((x) => (!f.origen || x.origen === f.origen) && (!tipo || (x.origen === "obligacion" && x.tipo === tipo)) && (!f.ambito || ambitoDe(x) === f.ambito) && (
    f.estado === "todos" ? true : f.estado === "vigentes" ? x.estado !== "omitida" : f.estado === "sin_evidencia" ? x.falta_evidencia : x.estado === f.estado));
}

/** Mismo día `n` meses antes o después; si ese mes es más corto, su último día. */
function moverMeses(f: string, n: number): string {
  const [a, m, d] = f.split("-").map(Number), total = a * 12 + (m - 1) + n, anio = Math.floor(total / 12), mes = (total % 12) + 1;
  const dia = Math.min(d, new Date(Date.UTC(anio, mes, 0)).getUTCDate());
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
const sumarDias = (f: string, n: number) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Lo que muestra el calendario: un año atrás y 13 meses adelante (cabe en el máximo de 800 días de la consulta). */
export const ventanaCalendario = (hoy: string) => ({ desde: moverMeses(hoy, -12), hasta: moverMeses(hoy, 13) });
/** La misma ventana que usa `avisos_cumplimiento`: 12 meses atrás (lo que muestra el calendario) y 61 días adelante
 * (el aviso anual más lejano es a 60). Los compromisos solo cuentan 3 meses atrás, lo que muestra su ficha. */
export const ventanaAlertas = (hoy: string) => ({ desde: moverMeses(hoy, -12), hasta: sumarDias(hoy, 61) });

export type Alertas = { vencidas: number; porVencer: number; sinFactura: number; sinEvidencia: number };
/** Contadores de la franja. Ignora compromisos que vencieron hace más de 3 meses, como `avisos_cumplimiento`. */
export const contarAlertas = (todas: readonly FilaCumplimiento[], hoy: string): Alertas => {
  const corte = moverMeses(hoy, -3), filas = todas.filter((f) => f.origen !== "compromiso" || f.vence >= corte);
  return {
    vencidas: filas.filter((f) => f.estado === "vencida").length,
    porVencer: filas.filter((f) => f.estado === "por_vencer").length,
    sinFactura: filas.filter((f) => f.estado === "cumplida_sin_factura").length,
    sinEvidencia: filas.filter((f) => f.falta_evidencia).length,
  };
};

/** Valor del selector al cambiar la factura de una fecha cumplida: un id, o "quitar" para desligarla. Vacío es error. */
export function facturaElegida(v: string): { factura: string | null } | { error: string } {
  const x = v.trim();
  if (x === "quitar") return { factura: null };
  if (!x) return { error: "Elige una factura o «Quitar la factura»." };
  return { factura: x };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Valida el formulario y arma `p_datos` de `guardar_obligacion`. `ambito` llega como `s:<sucursal>` o `r:<RFC>`. */
export function leerObligacion(campo: (c: string) => string): { datos: Record<string, string> } | { error: string } {
  const v = (c: string) => campo(c).trim();
  const tipo = v("tipo"), frecuencia = v("frecuencia"), ambito = v("ambito"), pago = v("con_pago") === "si", monto = v("monto_estimado").replace(/[$,\s]/g, "");
  if (!(tipo in TIPOS)) return { error: "Elige el tipo de obligación." };
  if (v("nombre").length < 3) return { error: "Escribe el nombre (al menos 3 letras)." };
  if (tipo === "otro" && v("descripcion").length < 3) return { error: "Describe la obligación (al menos 3 letras)." };
  if (!/^[sr]:.+/.test(ambito)) return { error: "Elige la sucursal o la razón social." };
  if (!(frecuencia in FRECUENCIAS)) return { error: "Elige la frecuencia." };
  if (!FECHA.test(v("inicio"))) return { error: "Indica la fecha de inicio." };
  if (v("fin") && (!FECHA.test(v("fin")) || v("fin") < v("inicio"))) return { error: "El fin no puede ser antes del inicio." };
  if (pago && !v("proveedor_id")) return { error: "Elige el proveedor que factura el pago." };
  if (pago && monto && (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0)) return { error: "El monto estimado debe ser mayor a cero (o déjalo vacío)." };
  return { datos: {
    tipo, nombre: v("nombre"), descripcion: v("descripcion"), autoridad: v("autoridad"), folio: v("folio"), notas: v("notas"),
    sucursal_id: ambito.startsWith("s:") ? ambito.slice(2) : "", razon_social_rfc: ambito.startsWith("r:") ? ambito.slice(2) : "",
    frecuencia, inicio: v("inicio"), fin: v("fin"), con_pago: pago ? "true" : "false",
    proveedor_id: pago ? v("proveedor_id") : "", monto_estimado: pago ? monto : "",
  } };
}

export function agruparAvisos(avisos: AvisoCumplimiento[]): Record<TipoAviso, AvisoCumplimiento[]> {
  const r: Record<TipoAviso, AvisoCumplimiento[]> = { vencida: [], por_vencer: [], sin_factura: [] };
  for (const a of avisos) r[a.tipo_aviso].push(a);
  return r;
}

/** Compara la llave del header contra la configurada en tiempo constante (sin `node:crypto`, para que el módulo sirva
 * también en el cliente). Sin llave configurada, nadie entra. */
export function llaveValida(recibida: string | null, esperada: string | undefined): boolean {
  if (!recibida || !esperada || recibida.length !== esperada.length) return false;
  let d = 0;
  for (let i = 0; i < esperada.length; i++) d |= recibida.charCodeAt(i) ^ esperada.charCodeAt(i);
  return d === 0;
}

const CLAVE = new RegExp(`^(obligacion|compromiso|mantenimiento):${UUID.source.slice(1, -1)}:\\d{4}-\\d{2}-\\d{2}:(vencida|por_vencer|sin_factura):\\d{4}-\\d{2}-\\d{2}$`);
/** Cuerpo de POST /api/cumplimiento/avisos/entregados. Mismas reglas que `registrar_avisos_cumplimiento`. */
export function leerEntregados(cuerpo: unknown): { canal: Canal; claves: string[] } | { error: string } {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return { error: "Cuerpo inválido." };
  const { canal, claves } = cuerpo as { canal?: unknown; claves?: unknown };
  if (canal !== "correo" && canal !== "chat") return { error: "Canal inválido." };
  if (!Array.isArray(claves) || claves.length < 1 || claves.length > 500) return { error: "Envía de 1 a 500 claves." };
  if (!claves.every((c) => typeof c === "string" && CLAVE.test(c))) return { error: "Clave de aviso inválida." };
  return { canal, claves: [...new Set(claves as string[])] };
}
