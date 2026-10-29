import type { Celda, EstiloFila, HojaXlsx } from "../xlsx-escribir";
import type { FormatoAsesores, SeccionAsesores } from "./formatoAsesores";

const BARRA: EstiloFila = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };

/** Hoja "P&L asesores": secciones de la plantilla con color, totales en barra, monto contable y % de venta. */
export function hojaAsesores(r: {
  titulo: string; periodo: string; generado: string; formato: FormatoAsesores;
  secciones: readonly { clave: SeccionAsesores; nombre: string; fondo: string }[];
}): HojaXlsx[] {
  const base = r.formato.base === "bruta" ? "% de ventas brutas" : "% de ventas netas";
  const filas: Celda[][] = [
    [`P&L formato asesores · ${r.titulo}`],
    [`${r.periodo} · montos en MXN sin IVA; criterio devengado; ${base}`],
    [`Generado por ${r.generado}`],
    [],
    ["Renglón", "Monto", base],
  ];
  const estilos: Record<number, EstiloFila> = {};
  for (const s of r.secciones) {
    estilos[filas.length] = { fondo: s.fondo, negrita: true };
    filas.push([s.nombre.toUpperCase()]);
    for (const x of r.formato.renglones.filter((y) => y.seccion === s.clave)) {
      if (x.tipo === "total") estilos[filas.length] = BARRA;
      filas.push([x.nombre, x.monto === null ? "Pendiente" : { valor: x.monto, formato: "contable" }, x.pct === null ? null : { valor: x.pct, formato: "porcentaje" }]);
    }
    filas.push([]);
  }
  for (const a of r.formato.avisos) filas.push([a]);
  return [{ nombre: "P&L asesores", filas, negritas: [0, 4], estilos, anchos: [40, 18, 18] }];
}
