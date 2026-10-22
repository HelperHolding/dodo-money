/** Presentación del P&L como estado de resultados formal: secciones con color, barras de total y cifras contables. */
import type { ClaveRenglon } from "./pl";

export type ClaveSeccion = "venta" | "costo" | "operacion" | "oficina";
export type Seccion = { clave: ClaveSeccion; nombre: string; fondo: string; renglones: readonly ClaveRenglon[]; total: ClaveRenglon | null };

export const SECCIONES: readonly Seccion[] = [
  { clave: "venta", nombre: "Venta e ingresos", fondo: "BDD7EE", renglones: ["venta_neta", "venta_neta_dodo", "venta_neta_rappi", "rappi_fuera_base", "rappi_excedente"], total: null },
  { clave: "costo", nombre: "Costo de venta", fondo: "D9EAD3", renglones: ["alimento", "alimento_dodo", "alimento_rappi", "merma", "merma_productos", "merma_insumos"], total: "margen_bruto" },
  {
    clave: "operacion", nombre: "Gastos de operación", fondo: "FCE4D6",
    renglones: ["nomina_cocina", "nomina_gerencia", "repartidores", "agregadores", "rappi_ajustes", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "regalias", "otros"],
    total: "ebitda_tienda",
  },
  { clave: "oficina", nombre: "Oficina central", fondo: "EAD1DC", renglones: ["oficina"], total: "ebitda" },
];
export const MEMO = { nombre: "Memo", fondo: "F2F2F2" } as const;
export const BARRA_TOTAL = { fondo: "7F7F7F", texto: "FFFFFF" } as const;

/** Lo que el Excel necesita de aquí (los módulos de lib/ no se importan valores entre sí). */
export const PRESENTACION = { secciones: SECCIONES, memo: MEMO, barra: BARRA_TOTAL };
export type Presentacion = { secciones: readonly Seccion[]; memo: { nombre: string; fondo: string }; barra: { fondo: string; texto: string } };

const cifra = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cifra contable sin el $: "1,234.50", negativos "(10.00)", cero "-", sin dato "—". */
export function cifraContable(n: number | null): string {
  if (n === null) return "—";
  const r = Math.round(n * 100) / 100;
  if (r === 0) return "-";
  return r < 0 ? `(${cifra.format(-r)})` : cifra.format(r);
}
