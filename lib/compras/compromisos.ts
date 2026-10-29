/** Compromisos recurrentes por sucursal (renta, fumigación, basura, trampas de grasa). Fechas YYYY-MM-DD. */
import type { FormaPago } from "./proveedores";

export type Concepto = "renta" | "fumigacion" | "basura" | "trampas_grasa" | "otro";
export const CONCEPTOS: Record<Concepto, string> = { renta: "Renta", fumigacion: "Fumigación", basura: "Recolección de basura", trampas_grasa: "Limpieza de trampas de grasa", otro: "Otro" };
/** Valor inicial de la casilla en el formulario: los servicios se comprueban; la renta no. */
export const REQUIERE_SERVICIO: Record<Concepto, boolean> = { renta: false, fumigacion: true, basura: true, trampas_grasa: true, otro: false };

export type Compromiso = {
  id: string; sucursal_id: string; concepto: Concepto; descripcion: string | null; proveedor_id: string; monto_estimado: number;
  forma_pago: FormaPago; unidad: "mes" | "semana"; cada: number; dia_mes: number | null; inicio: string; fin: string | null;
  requiere_servicio: boolean; revision: number;
};
/** Una fila de `compromisos_en_rango`: la fecha calculada y lo guardado de ella. */
export type FechaCompromiso = {
  compromiso_id: string; vence: string; fecha_id: string | null; factura_id: string | null;
  factura_estado: "por_pagar" | "parcial" | "pagada" | "cancelada" | null; factura_saldo: number | null;
  omitida_motivo: string | null; servicio: "pendiente" | "realizado" | "no_realizado"; servicio_fecha: string | null;
  servicio_nota: string | null; revision: number;
};
export type EstadoPago = "previsto" | "vencido" | "por_pagar" | "pagada" | "omitida";
export const ESTADO_PAGO: Record<EstadoPago, { texto: string; tono: string }> = {
  previsto: { texto: "Previsto", tono: "info" }, vencido: { texto: "Vencido sin factura", tono: "peligro" },
  por_pagar: { texto: "Con factura por pagar", tono: "aviso" }, pagada: { texto: "Pagada", tono: "exito" }, omitida: { texto: "Omitida", tono: "gris" },
};
export const ESTADO_SERVICIO: Record<FechaCompromiso["servicio"], string> = { pendiente: "Servicio pendiente", realizado: "Servicio realizado", no_realizado: "Servicio no realizado" };

const LOS_DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

export function textoFrecuencia(r: { unidad: "mes" | "semana"; cada: number; dia_mes: number | null; inicio: string }): string {
  if (r.unidad === "mes") {
    const d = r.dia_mes ?? 1;
    return `${r.cada === 1 ? "Cada mes" : `Cada ${r.cada} meses`}, día ${d}${d > 28 ? " (o el último del mes)" : ""}`;
  }
  return `${r.cada === 1 ? "Cada semana" : `Cada ${r.cada} semanas`}, los ${LOS_DIAS[new Date(`${r.inicio}T00:00:00Z`).getUTCDay()]}`;
}

export const tituloCompromiso = (c: { concepto: Concepto; descripcion: string | null }, sucursal: string) =>
  `${c.concepto === "otro" && c.descripcion ? c.descripcion : CONCEPTOS[c.concepto]} · ${sucursal}`;

/** Una factura cancelada no cuenta: la fecha vuelve a estar sin factura. */
const conFactura = (f: FechaCompromiso) => !!f.factura_id && !!f.factura_estado && f.factura_estado !== "cancelada";

export function estadoPago(f: FechaCompromiso, hoy: string): EstadoPago {
  if (f.omitida_motivo) return "omitida";
  if (conFactura(f)) return f.factura_estado === "pagada" ? "pagada" : "por_pagar";
  return f.vence < hoy ? "vencido" : "previsto";
}

export const servicioSinComprobar = (f: FechaCompromiso, requiere: boolean, hoy: string) =>
  requiere && !f.omitida_motivo && f.servicio === "pendiente" && f.vence < hoy;

export function avisosCompromisos(fechas: readonly FechaCompromiso[], requiere: (id: string) => boolean, hoy: string) {
  return {
    vencidosSinFactura: fechas.filter((f) => estadoPago(f, hoy) === "vencido").length,
    serviciosSinComprobar: fechas.filter((f) => servicioSinComprobar(f, requiere(f.compromiso_id), hoy)).length,
  };
}

export type Previsto = { compromisoId: string; vence: string; fechaPago: string; monto: number; titulo: string; vencido: boolean };

/** Lo que aún no tiene factura vigente ni está omitido, agrupado por día de pago (igual que una factura). */
export function previstosPorDia(fechas: readonly FechaCompromiso[], datos: ReadonlyMap<string, { monto: number; titulo: string }>, hoy: string, fechaDePago: (vence: string) => string): Record<string, Previsto[]> {
  const r: Record<string, Previsto[]> = {};
  for (const f of fechas) {
    const estado = estadoPago(f, hoy), d = datos.get(f.compromiso_id);
    if (!d || (estado !== "previsto" && estado !== "vencido")) continue;
    const fechaPago = fechaDePago(f.vence);
    (r[fechaPago] ??= []).push({ compromisoId: f.compromiso_id, vence: f.vence, fechaPago, monto: d.monto, titulo: d.titulo, vencido: estado === "vencido" });
  }
  return r;
}

/** Mismos filtros que las facturas en Pagos. Un compromiso siempre es de una sucursal: "oficina" no muestra ninguno. */
export const filtrarPrevistos = <T extends { sucursal_id: string; proveedor_id: string }>(cs: T[], f: { sucursal: string; proveedor: string }) =>
  cs.filter((c) => (!f.sucursal || c.sucursal_id === f.sucursal) && (!f.proveedor || c.proveedor_id === f.proveedor));

/** Mismo día `n` meses antes o después; si ese mes es más corto, su último día. */
function moverMeses(f: string, n: number): string {
  const [a, m, d] = f.split("-").map(Number), total = a * 12 + (m - 1) + n, anio = Math.floor(total / 12), mes = (total % 12) + 1;
  const dia = Math.min(d, new Date(Date.UTC(anio, mes, 0)).getUTCDate());
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Fechas que muestran Pagos, la lista y el detalle: los últimos 3 meses y los próximos 12. Una sola ventana para que
 * todo vencido que se avisa tenga su tarjeta en el detalle (y se pueda ligar u omitir). */
export const ventanaCompromisos = (hoy: string) => ({ desde: moverMeses(hoy, -3), hasta: moverMeses(hoy, 12) });

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMAS = ["transferencia", "efectivo", "tarjeta", "cheque"];

/** Valida el formulario y arma `p_datos` de `guardar_compromiso`. */
export function leerCompromiso(campo: (c: string) => string): { datos: Record<string, string> } | { error: string } {
  const v = (c: string) => campo(c).trim();
  const concepto = v("concepto"), unidad = v("unidad"), monto = v("monto_estimado").replace(/[$,\s]/g, "");
  if (!v("sucursal_id") || !v("proveedor_id")) return { error: "Elige sucursal y proveedor." };
  if (!(concepto in CONCEPTOS)) return { error: "Elige el concepto." };
  if (concepto === "otro" && v("descripcion").length < 3) return { error: "Describe el compromiso (al menos 3 letras)." };
  if (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) return { error: "Escribe el monto estimado (mayor a cero)." };
  if (!FORMAS.includes(v("forma_pago"))) return { error: "Elige la forma de pago prevista." };
  if (unidad !== "mes" && unidad !== "semana") return { error: "Elige si se repite por meses o por semanas." };
  const cada = Number(v("cada"));
  if (!Number.isInteger(cada) || cada < 1 || cada > 12) return { error: "La frecuencia va de 1 a 12." };
  const dia = Number(v("dia_mes"));
  if (unidad === "mes" && (!Number.isInteger(dia) || dia < 1 || dia > 31)) return { error: "El día del mes va del 1 al 31." };
  if (!FECHA.test(v("inicio"))) return { error: "Indica la fecha de inicio." };
  if (v("fin") && (!FECHA.test(v("fin")) || v("fin") < v("inicio"))) return { error: "El fin no puede ser antes del inicio." };
  return { datos: {
    sucursal_id: v("sucursal_id"), concepto, descripcion: v("descripcion"), proveedor_id: v("proveedor_id"), monto_estimado: monto,
    forma_pago: v("forma_pago"), unidad, cada: String(cada), dia_mes: unidad === "mes" ? String(dia) : "", inicio: v("inicio"), fin: v("fin"),
    requiere_servicio: v("requiere_servicio") === "si" ? "true" : "false",
  } };
}
