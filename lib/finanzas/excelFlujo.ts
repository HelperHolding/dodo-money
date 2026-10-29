import type { Celda, EstiloFila, HojaXlsx } from "../xlsx-escribir";
import type { Flujo, SeccionFlujo } from "./flujo";

type Secciones = readonly { clave: SeccionFlujo; nombre: string; fondo: string }[];
const BARRA: EstiloFila = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };
const contable = (n: number): Celda => ({ valor: n, formato: "contable" });

/** Encabezado, secciones con color y totales en barra; `celdas` da las columnas de cada renglón. */
function cuerpo(secciones: Secciones, referencia: Flujo, mostrar: ReadonlySet<string>, desde: number, celdas: (clave: string) => Celda[]) {
  const filas: Celda[][] = [], estilos: Record<number, EstiloFila> = {};
  for (const s of secciones) {
    estilos[desde + filas.length] = { fondo: s.fondo, negrita: true };
    filas.push([s.nombre.toUpperCase()]);
    for (const r of referencia.renglones.filter((x) => x.seccion === s.clave && mostrar.has(x.clave))) {
      if (r.tipo === "total") estilos[desde + filas.length] = BARRA;
      filas.push([r.nombre, ...celdas(r.clave)]);
    }
    filas.push([]);
  }
  return { filas, estilos };
}
const avisos = (f: Flujo): Celda[][] => [
  ...(f.porConciliar.n ? [[`${f.porConciliar.n} ${f.porConciliar.n === 1 ? "movimiento" : "movimientos"} por conciliar.`]] : []),
  ...(f.diferencia ? [[`Diferencia contra el saldo del banco: ${f.diferencia.toFixed(2)} (hay huecos en los reportes importados).`]] : []),
];

export function hojaFlujo(r: { titulo: string; periodo: string; generado: string; flujo: Flujo; secciones: Secciones; mostrar: ReadonlySet<string> }): HojaXlsx[] {
  const arriba: Celda[][] = [[`Flujo de efectivo · ${r.titulo}`], [`${r.periodo} · montos en MXN; cifras reales del banco; % sobre ingresos operativos`], [`Generado por ${r.generado}`], [], ["Renglón", "Monto", "% de ingresos"]];
  const de = new Map(r.flujo.renglones.map((x) => [x.clave, x]));
  const c = cuerpo(r.secciones, r.flujo, r.mostrar, arriba.length, (k) => {
    const x = de.get(k)!;
    return [contable(x.monto), x.pct === null ? null : { valor: x.pct, formato: "porcentaje" }];
  });
  return [{ nombre: "Flujo", filas: [...arriba, ...c.filas, ...avisos(r.flujo)], negritas: [0, 4], estilos: c.estilos, anchos: [40, 18, 16] }];
}

export function hojaFlujoComparativo(r: {
  titulo: string; periodo: string; generado: string; columnas: { etiqueta: string; flujo: Flujo }[]; total: { etiqueta: string; flujo: Flujo };
  secciones: Secciones; mostrar: ReadonlySet<string>;
}): HojaXlsx[] {
  const todas = [...r.columnas, r.total];
  const arriba: Celda[][] = [[`Flujo de efectivo comparativo · ${r.titulo}`], [`${r.periodo} · montos en MXN; cifras reales del banco`], [`Generado por ${r.generado}`], [], ["Renglón", ...todas.map((c) => c.etiqueta)]];
  const c = cuerpo(r.secciones, r.total.flujo, r.mostrar, arriba.length, (k) => todas.map((col) => contable(col.flujo.renglones.find((x) => x.clave === k)!.monto)));
  return [{ nombre: "Flujo comparativo", filas: [...arriba, ...c.filas, ...avisos(r.total.flujo)], negritas: [0, 4], estilos: c.estilos, anchos: [40, ...todas.map(() => 16)] }];
}
