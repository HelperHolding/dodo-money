import type { Celda, HojaXlsx } from "../xlsx-escribir";

export type FilaFacturaCliente = { creada: string; pedido_id: string; rfc: string; nombre: string; subtotal: number | null; iva: number | null; total: number; uuid: string | null; estado: string; serie: string | null; folio: number | null };

const diaMX = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });
const pesos = (n: number | null): Celda => (n === null ? null : { valor: Math.round(n * 100) / 100, formato: "pesos" });
const ESTADO: Record<string, string> = { timbrada: "Timbrada", cancelada: "Cancelada", en_proceso: "Por confirmar", error: "Rechazada" };

/** Hoja del mes para el contador: una fila por factura; los totales cuentan solo las timbradas. */
export function hojaFacturasClientes(filas: readonly FilaFacturaCliente[], mes: string): HojaXlsx {
  const t = filas.filter((f) => f.estado === "timbrada");
  const suma = (k: "subtotal" | "iva" | "total") => t.reduce((s, f) => s + Number(f[k] ?? 0), 0);
  return {
    nombre: `Facturas ${mes}`,
    filas: [
      ["Fecha", "Ticket", "RFC", "Nombre", "Subtotal", "IVA", "Total", "Folio fiscal (UUID)", "Serie y folio", "Estado"],
      ...filas.map((f): Celda[] => [{ fecha: diaMX.format(new Date(f.creada)) }, f.pedido_id, f.rfc, f.nombre, pesos(f.subtotal), pesos(f.iva), pesos(f.total), f.uuid, f.serie ? `${f.serie}-${f.folio}` : null, ESTADO[f.estado] ?? f.estado]),
      ["Total timbrado", null, null, null, pesos(suma("subtotal")), pesos(suma("iva")), pesos(suma("total")), null, null, `${t.length} facturas`],
    ],
    negritas: [0, filas.length + 1], anchos: [12, 36, 15, 36, 12, 12, 12, 38, 12, 14], inmovilizar: 1,
  };
}
