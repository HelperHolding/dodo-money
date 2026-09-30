import type { TasaIva } from "./proveedores";

export const ESTADOS_ORDEN = ["borrador", "enviada", "confirmada", "cerrada", "cancelada"] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];
export const NOMBRE_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  borrador: "Cotización (borrador)", enviada: "Cotización enviada", confirmada: "Orden de compra", cerrada: "Cerrada", cancelada: "Cancelada",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const tasa = (t: TasaIva) => (t === "16" ? 0.16 : 0);

/** Importe e IVA por renglón, redondeados a centavos, como en una factura. */
export function totalesOrden(renglones: readonly { cantidad: number; precio: number; tasa_iva: TasaIva }[]) {
  let subtotal = 0;
  let iva = 0;
  for (const r of renglones) {
    const importe = r2(Number(r.cantidad) * Number(r.precio));
    subtotal += importe;
    iva += r2(importe * tasa(r.tasa_iva));
  }
  return { subtotal: r2(subtotal), iva: r2(iva), total: r2(subtotal + iva) };
}

export type Avance = "nada" | "parcial" | "completa";
export const NOMBRE_AVANCE: Record<Avance, string> = { nada: "Sin recibir", parcial: "Recibida en parte", completa: "Recibida completa" };

const EPS = 1e-9;
export const avanceRenglon = (cantidad: number, recibido: number): Avance =>
  recibido <= EPS ? "nada" : recibido + EPS >= cantidad ? "completa" : "parcial";
export const recibidoDeMas = (cantidad: number, recibido: number) => recibido > cantidad + EPS;

export function avanceOrden(renglones: readonly { cantidad: number; recibido: number }[]): Avance {
  const a = renglones.map((r) => avanceRenglon(Number(r.cantidad), Number(r.recibido)));
  if (!a.length || a.every((x) => x === "nada")) return "nada";
  return a.every((x) => x === "completa") ? "completa" : "parcial";
}

export type AccionOrden = "editar" | "enviar" | "confirmar" | "copiar" | "cancelar" | "cerrar";
/** Lo que el admin puede hacer con la orden en su estado. Con algo recibido ya no se cancela: se cierra. */
export function accionesDe(estado: EstadoOrden, hayRecepciones: boolean): AccionOrden[] {
  if (estado === "borrador") return ["editar", "enviar", "confirmar", "copiar", "cancelar"];
  if (estado === "enviada") return ["editar", "confirmar", "copiar", "cancelar"];
  if (estado === "confirmada") return hayRecepciones ? ["cerrar"] : ["cancelar", "cerrar"];
  return [];
}

/** "1,500.25" o "$ 68.4" → número (las comas son de miles, como en México). */
const numeroDe = (t: string) => (t.trim() === "" ? Number.NaN : Number(t.replace(/[$\s,]/g, "")));

export function leerRenglon(valor: (campo: string) => string): { datos: { articulo_id: string; cantidad: number; precio: number } } | { error: string } {
  const articulo_id = valor("articulo_id").trim();
  if (!articulo_id) return { error: "Elige el artículo." };
  const cantidad = numeroDe(valor("cantidad"));
  if (!(cantidad > 0)) return { error: "La cantidad debe ser mayor a cero." };
  const texto = valor("precio").trim();
  const precio = texto === "" ? 0 : numeroDe(texto);
  if (!(precio >= 0)) return { error: "El precio no es válido." };
  return { datos: { articulo_id, cantidad: Math.round(cantidad * 1000) / 1000, precio: r2(precio) } };
}

export type Cotizacion = { id: string; renglones: { articulo_id: string; cantidad: number; precio: number; tasa_iva: TasaIva }[] };

/** Más barata = menor total entre las que tienen precio en todos sus renglones. Empates: la primera. */
export function compararCotizaciones(cotizaciones: readonly Cotizacion[]) {
  const totales = new Map(cotizaciones.map((c) => [c.id, totalesOrden(c.renglones).total]));
  let masBarata: string | null = null;
  for (const c of cotizaciones) {
    if (!c.renglones.length || c.renglones.some((r) => !(r.precio > 0))) continue;
    if (masBarata === null || totales.get(c.id)! < totales.get(masBarata)!) masBarata = c.id;
  }
  const mejorPrecio = new Map<string, number>();
  const mejorPorArticulo = new Map<string, string>();
  for (const c of cotizaciones) {
    for (const r of c.renglones) {
      if (!(r.precio > 0)) continue;
      if (!mejorPrecio.has(r.articulo_id) || r.precio < mejorPrecio.get(r.articulo_id)!) {
        mejorPrecio.set(r.articulo_id, r.precio);
        mejorPorArticulo.set(r.articulo_id, c.id);
      }
    }
  }
  return { totales, masBarata, mejorPorArticulo };
}
