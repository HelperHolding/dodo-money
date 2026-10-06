import type { Celda, HojaXlsx } from "../xlsx-escribir";

export type Aplicacion = {
  pago_id: string; monto: number | string;
  pagos: { fecha: string; anulado_en: string | null };
  facturas: { id: string; serie: string | null; folio: string | null; uuid: string | null; total: number | string;
    tipo: string; estado: string; retencion_iva: number | string; retencion_isr: number | string;
    proveedores: { razon_social: string; nombre_comercial: string | null; rfc: string } | null };
};
export type RenglonRetencion = { pagoId: string; facturaId: string; factura: string; proveedor: string; rfc: string; fecha: string; pagado: number; iva: number; isr: number };
export type Entero = { id: string; mes: string; fecha: string; iva: number | string; isr: number | string; operacion: string | null;
  acuse_ruta: string | null; anulado_en: string | null; motivo_anulacion: string | null };
export type Estado = "enterado" | "de_mas" | "falta" | "vencido" | "por_vencer" | "pendiente" | "sin_retenciones";
export type MesRetenciones = { mes: string; limite: string; renglones: RenglonRetencion[]; enteros: Entero[]; iva: number; isr: number;
  enteradoIva: number; enteradoIsr: number; faltaIva: number; faltaIsr: number; excesoIva: number; excesoIsr: number;
  estado: Estado; vencido: boolean; dias: number; ultimoEntero: string | null };
const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const mesReal = (mes: string) => /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(mes);
const fechaReal = (fecha: string) => /^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number.isFinite(Date.parse(`${fecha}T00:00:00Z`)) && new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) === fecha;

export function limiteEntero(mes: string): string {
  if (!mesReal(mes)) throw new Error("Mes inválido");
  const fecha = new Date(`${mes}-17T00:00:00Z`);
  fecha.setUTCMonth(fecha.getUTCMonth() + 1);
  return fecha.toISOString().slice(0, 10);
}
export function nombreMes(mes: string): string {
  if (!mesReal(mes)) throw new Error("Mes inválido");
  const nombre = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`));
  return nombre.charAt(0).toUpperCase() + nombre.slice(1).replace(" de ", " ");
}
export function retencionesDePagos(aplicaciones: readonly Aplicacion[]): RenglonRetencion[] {
  return aplicaciones.flatMap((a) => {
    const f = a.facturas;
    if (a.pagos.anulado_en || f.tipo !== "ingreso" || f.estado === "cancelada" || Number(f.total) <= 0 || Number(a.monto) <= 0) return [];
    const parte = Math.min(1, Number(a.monto) / Number(f.total));
    const iva = centavos(Number(f.retencion_iva) * parte), isr = centavos(Number(f.retencion_isr) * parte);
    if (!(iva > 0 || isr > 0)) return [];
    return [{ pagoId: a.pago_id, facturaId: f.id, factura: [f.serie, f.folio].filter(Boolean).join(" ") || f.uuid || "Sin CFDI",
      proveedor: f.proveedores?.nombre_comercial || f.proveedores?.razon_social || "Sin proveedor", rfc: f.proveedores?.rfc || "",
      fecha: a.pagos.fecha, pagado: Number(a.monto), iva, isr }];
  });
}
export function porMes(renglones: readonly RenglonRetencion[], enteros: readonly Entero[], hoy: string): MesRetenciones[] {
  const meses = new Set([...renglones.map((r) => r.fecha.slice(0, 7)), ...enteros.map((e) => e.mes.slice(0, 7))]);
  return [...meses].sort().reverse().map((mes) => {
    const detalle = renglones.filter((r) => r.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.pagoId.localeCompare(b.pagoId));
    const historial = enteros.filter((e) => e.mes.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
    const vigentes = historial.filter((e) => !e.anulado_en);
    const iva = centavos(detalle.reduce((s, r) => s + r.iva, 0)), isr = centavos(detalle.reduce((s, r) => s + r.isr, 0));
    const enteradoIva = centavos(vigentes.reduce((s, e) => s + Number(e.iva), 0)), enteradoIsr = centavos(vigentes.reduce((s, e) => s + Number(e.isr), 0));
    const faltaIva = centavos(Math.max(0, iva - enteradoIva)), faltaIsr = centavos(Math.max(0, isr - enteradoIsr));
    const excesoIva = centavos(Math.max(0, enteradoIva - iva)), excesoIsr = centavos(Math.max(0, enteradoIsr - isr));
    const limite = limiteEntero(mes), dias = Math.round((Date.parse(`${limite}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
    const falta = faltaIva > 1 || faltaIsr > 1;
    // Un faltante de un impuesto tiene prioridad sobre un exceso del otro.
    const estado: Estado = falta ? (vigentes.length ? "falta" : dias < 0 ? "vencido" : dias <= 5 ? "por_vencer" : "pendiente")
      : excesoIva > 1 || excesoIsr > 1 ? "de_mas" : vigentes.length ? "enterado" : iva || isr ? (dias < 0 ? "vencido" : dias <= 5 ? "por_vencer" : "pendiente") : "sin_retenciones";
    return { mes, limite, renglones: detalle, enteros: historial, iva, isr, enteradoIva, enteradoIsr, faltaIva, faltaIsr, excesoIva, excesoIsr,
      estado, vencido: dias < 0, dias, ultimoEntero: vigentes[0]?.fecha ?? null };
  });
}
export function leerEntero(valor: (campo: string) => string, hoy: string): { datos: { mes: string; fecha: string; iva: number; isr: number; operacion: string | null } } | { error: string } {
  const mes = valor("mes").trim(), fecha = valor("fecha").trim(), operacion = valor("operacion").trim();
  if (!mesReal(mes)) return { error: "Elige el mes (AAAA-MM)." };
  if (!fechaReal(fecha)) return { error: "Elige una fecha válida." };
  if (fecha > hoy) return { error: "La fecha no puede ser futura." };
  if (fecha < `${mes}-01`) return { error: "La fecha no puede ser anterior al mes." };
  const monto = (campo: string) => { const texto = valor(campo).trim(); return /^\d+(\.\d{1,2})?$/.test(texto) ? Number(texto) : NaN; };
  const iva = monto("iva"), isr = monto("isr");
  if (![iva, isr].every((n) => Number.isFinite(n) && n >= 0 && n <= 999999999999.99) || iva + isr <= 0) return { error: "Escribe montos válidos de cero o más, con al menos uno mayor que cero y hasta dos decimales." };
  if (operacion.length > 60) return { error: "La operación admite hasta 60 caracteres." };
  return { datos: { mes: `${mes}-01`, fecha, iva, isr, operacion: operacion || null } };
}
export function hojaRetenciones(mes: MesRetenciones, generado: string): HojaXlsx[] {
  const pesos = (valor: number): Celda => ({ valor, formato: "pesos" });
  const filas: Celda[][] = [[`Retenciones · ${nombreMes(mes.mes)}`], [`Generado por ${generado}`], [`Fecha límite: ${mes.limite}`], [],
    ["Proveedor", "RFC", "Factura", "Fecha de pago", "Pagado", "IVA retenido", "ISR retenido"],
    ...mes.renglones.map((r): Celda[] => [r.proveedor, r.rfc, r.factura, { fecha: r.fecha }, pesos(r.pagado), pesos(r.iva), pesos(r.isr)]),
    ["TOTAL", "", "", "", pesos(centavos(mes.renglones.reduce((s, r) => s + r.pagado, 0))), pesos(mes.iva), pesos(mes.isr)]];
  return [{ nombre: "Retenciones", filas, negritas: [0, 4, filas.length - 1], anchos: [35, 18, 25, 18, 20, 20, 20] }];
}
