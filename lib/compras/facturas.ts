import type { TasaIva } from "./proveedores";

export const ESTADOS_FACTURA = ["por_pagar", "parcial", "pagada", "cancelada"] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];
export const NOMBRE_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  por_pagar: "Por pagar", parcial: "Pagada en parte", pagada: "Pagada", cancelada: "Cancelada",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const TOLERANCIA = 1;

/** PUE se paga de contado (vence el día de la factura); PPD o sin método: fecha + días de crédito. */
export function venceEl(fecha: string, diasCredito: number, metodo: "PUE" | "PPD" | null): string {
  if (metodo === "PUE") return fecha;
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + diasCredito);
  return d.toISOString().slice(0, 10);
}

export const vencida = (f: { estado: EstadoFactura; vence_el: string; saldo: number }, hoy: string) =>
  (f.estado === "por_pagar" || f.estado === "parcial") && Number(f.saldo) > 0 && f.vence_el < hoy;

/** Lo recibido valuado al precio de la orden, con IVA por renglón (como factura el proveedor). */
export const valorRecibido = (renglones: readonly { recibido: number; precio: number; tasa_iva: TasaIva }[]) =>
  r2(renglones.reduce((s, r) => {
    const importe = r2(Number(r.recibido) * Number(r.precio));
    return s + importe + r2(importe * (r.tasa_iva === "16" ? 0.16 : 0));
  }, 0));

export type Cotejo = "cuadra" | "facturado_de_mas" | "precio_distinto" | "nada_recibido" | "sin_orden";
export const NOMBRE_COTEJO: Record<Cotejo, { texto: string; alerta: boolean }> = {
  cuadra: { texto: "Cuadra con lo recibido", alerta: false },
  facturado_de_mas: { texto: "Facturado de más: supera lo recibido", alerta: true },
  precio_distinto: { texto: "Precio distinto: lo facturado no coincide con la orden", alerta: true },
  nada_recibido: { texto: "Nada recibido todavía", alerta: true },
  sin_orden: { texto: "Sin orden de compra", alerta: false },
};

/**
 * Orden ↔ recibido ↔ facturado por totales (±$1). Facturar menos de lo recibido cuadra (puede faltar otra factura);
 * con todo recibido, lo facturado debe coincidir con lo ordenado.
 */
export function cotejar(d: { tieneOrdenes: boolean; ordenado: number; recibido: number; recepcionCompleta: boolean; facturado: number }): Cotejo {
  if (!d.tieneOrdenes) return "sin_orden";
  if (d.recibido <= 0) return "nada_recibido";
  if (d.facturado > d.recibido + TOLERANCIA) return "facturado_de_mas";
  if (d.recepcionCompleta && Math.abs(d.facturado - d.ordenado) > TOLERANCIA) return "precio_distinto";
  return "cuadra";
}

export function avanceFacturacion(totalOrden: number, facturado: number): "nada" | "parcial" | "completa" {
  if (facturado <= 0) return "nada";
  return facturado + TOLERANCIA >= totalOrden ? "completa" : "parcial";
}

export const baseArchivo = (nombre: string) => nombre.toLowerCase().replace(/\.(xml|pdf)$/, "");
