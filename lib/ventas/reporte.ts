/** Reporte de ventas para imprimir o bajar a Excel: resumen contra el periodo anterior y venta por día. */
import type { Celda, HojaXlsx } from "../xlsx-escribir";
import type { Periodo, VentaDia } from "./calculos";

const centavos = (n: number) => Math.round(n * 100) / 100;
/** Ticket en centavos exactos: 2500.50 / 20 = 125.03 (no 125.02 por el redondeo de punto flotante). */
const ticket = (total: number, pedidos: number) => (pedidos > 0 ? Math.round(Math.round(total * 100) / pedidos) / 100 : null);

export type FilaDia = { fecha: string; pedidos: number; total: number; efectivo: number; tarjeta: number; en_linea: number; iva: number; ticket: number | null };
type Montos = "total" | "efectivo" | "tarjeta" | "en_linea" | "iva";
const MONTOS: Montos[] = ["total", "efectivo", "tarjeta", "en_linea", "iva"];

/** Una fila por día; con varias sucursales, cada día las suma. */
export function filasPorDia(dias: readonly VentaDia[]): FilaDia[] {
  const mapa = new Map<string, FilaDia>();
  for (const d of dias) {
    const f = mapa.get(d.fecha) ?? { fecha: d.fecha, pedidos: 0, total: 0, efectivo: 0, tarjeta: 0, en_linea: 0, iva: 0, ticket: null };
    f.pedidos += Number(d.pedidos);
    for (const k of MONTOS) f[k] = centavos(f[k] + Number(d[k]));
    mapa.set(d.fecha, f);
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, ticket: ticket(f.total, f.pedidos) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function totalesDias(filas: readonly FilaDia[]): Omit<FilaDia, "fecha"> {
  const t = { pedidos: 0, total: 0, efectivo: 0, tarjeta: 0, en_linea: 0, iva: 0 };
  for (const f of filas) {
    t.pedidos += f.pedidos;
    for (const k of MONTOS) t[k] = centavos(t[k] + f[k]);
  }
  return { ...t, ticket: ticket(t.total, t.pedidos) };
}

export type ResumenReporte = { total: number; neta: number; iva: number; pedidos: number; ticket: number | null; costoPct: number | null };
export type RenglonResumen = {
  concepto: string; actual: number | null; anterior: number | null;
  /** Fracción (0.1 = +10 %); para el costo, diferencia en puntos como fracción (0.02 = +2 pts). */
  cambio: number | null;
  formato: "pesos" | "numero" | "porcentaje";
};

/** Los indicadores del tablero, cada uno con su valor anterior y el cambio. */
export function renglonesResumen(actual: ResumenReporte, anterior: ResumenReporte | null): RenglonResumen[] {
  const relativo = (a: number | null, b: number | null) =>
    a === null || b === null || b === 0 ? null : Math.round(((a - b) / b) * 10_000) / 10_000;
  const renglon = (concepto: string, k: keyof ResumenReporte, formato: RenglonResumen["formato"]): RenglonResumen => {
    const a = actual[k], b = anterior ? anterior[k] : null;
    const cambio = formato === "porcentaje"
      ? (a === null || b === null ? null : Math.round((a - b) * 10_000) / 10_000)
      : relativo(a, b);
    return { concepto, actual: a, anterior: b, cambio, formato };
  };
  return [
    renglon("Venta total", "total", "pesos"),
    renglon("Venta neta", "neta", "pesos"),
    renglon("IVA", "iva", "pesos"),
    renglon("Pedidos", "pedidos", "numero"),
    renglon("Ticket promedio", "ticket", "pesos"),
    renglon("Costo teórico", "costoPct", "porcentaje"),
  ];
}

/** "Ventas Coyoacán 2026-09-01 a 2026-09-30.xlsx", sin los caracteres que Windows no acepta en un nombre. */
export function nombreArchivo(titulo: string, p: Periodo): string {
  const limpio = titulo.replace(/[\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return `Ventas ${limpio} ${p.desde} a ${p.hasta}.xlsx`;
}

const valor = (n: number | null, formato: RenglonResumen["formato"]): Celda =>
  n === null ? null : formato === "numero" ? n : { valor: n, formato };

/** Las dos hojas del Excel: Resumen y Por día (con renglón de totales). */
export function hojasVentas(r: { titulo: string; periodo: Periodo; generado: string; resumen: RenglonResumen[]; dias: FilaDia[] }): HojaXlsx[] {
  const pesos = (n: number | null): Celda => (n === null ? null : { valor: n, formato: "pesos" });
  const t = totalesDias(r.dias);
  const porDia: Celda[][] = [
    ["Fecha", "Pedidos", "Venta total", "Efectivo", "Tarjeta", "En línea", "IVA", "Ticket promedio"],
    ...r.dias.map((d): Celda[] => [{ fecha: d.fecha }, d.pedidos, pesos(d.total), pesos(d.efectivo), pesos(d.tarjeta), pesos(d.en_linea), pesos(d.iva), pesos(d.ticket)]),
    ["Total", t.pedidos, pesos(t.total), pesos(t.efectivo), pesos(t.tarjeta), pesos(t.en_linea), pesos(t.iva), pesos(t.ticket)],
  ];
  return [
    {
      nombre: "Resumen",
      filas: [
        [`Reporte de ventas · ${r.titulo}`],
        [`Del ${r.periodo.desde} al ${r.periodo.hasta}`],
        [`Generado por ${r.generado}`],
        [],
        ["Concepto", "Periodo", "Periodo anterior", "Cambio"],
        ...r.resumen.map((x): Celda[] => [
          x.concepto, valor(x.actual, x.formato), valor(x.anterior, x.formato),
          // El costo cambia en puntos (0.02 → +2.0 pts); lo demás, en porcentaje.
          x.cambio === null ? null : x.formato === "porcentaje" ? { valor: Math.round(x.cambio * 1000) / 10, formato: "puntos" } : { valor: x.cambio, formato: "porcentaje" },
        ]),
      ],
      negritas: [0, 4],
      anchos: [28, 18, 18, 12],
    },
    { nombre: "Por día", filas: porDia, negritas: [0, porDia.length - 1], anchos: [12, 10, 16, 16, 16, 16, 14, 16] },
  ];
}
