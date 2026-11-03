import type { Celda, EstiloFila, HojaXlsx } from "../xlsx-escribir";
import type { AjustePL } from "./ajustes";
import type { ClaveRenglon, EntradaPL, FilaPL } from "./pl";
import type { Presentacion } from "./secciones";

export type ColumnaPL = { etiqueta: string; filas: FilaPL[]; entrada: EntradaPL };

const contable = (n: number | null): Celda => (n === null ? null : { valor: n, formato: "contable" });
const pct = (n: number | null | undefined): Celda => (n === null || n === undefined ? null : { valor: n, formato: "porcentaje" });

/** Renglones por sección: encabezado de color, renglones, barra del total y un renglón en blanco; al final el memo. */
function porSecciones(pre: Presentacion, fila: (clave: ClaveRenglon) => Celda[] | null, extra: { venta: Celda[][]; memo: Celda[][] }, desde: number) {
  const filas: Celda[][] = [];
  const estilos: Record<number, EstiloFila> = {};
  const agregar = (celdas: Celda[], estilo?: EstiloFila) => { if (estilo) estilos[desde + filas.length] = estilo; filas.push(celdas); };
  const barra = { fondo: pre.barra.fondo, texto: pre.barra.texto, negrita: true };
  for (const s of pre.secciones) {
    agregar([s.nombre.toUpperCase()], { fondo: s.fondo, negrita: true });
    for (const c of s.renglones) { const f = fila(c); if (f) agregar(f); }
    if (s.clave === "venta") for (const f of extra.venta) agregar(f);
    if (s.total) { const f = fila(s.total); if (f) agregar(f, barra); }
    agregar([]);
  }
  agregar([pre.memo.nombre.toUpperCase()], { fondo: pre.memo.fondo, negrita: true });
  for (const f of extra.memo) agregar(f);
  return { filas, estilos };
}

const encabezado = (titulo: string, periodo: string, generado: string, columnas: Celda[]): Celda[][] =>
  [[titulo], [`${periodo} · venta neta sin IVA, después de descuentos; criterio devengado · merma de productos terminados e insumos adicionales al BOM`], [`Generado por ${generado}`], [], columnas];

/** Hoja "Contra meta": real, %, (ajuste y ajustado si hay ajustes), meta, diferencia contra el real y las dos comparaciones. */
export function hojaPL(r: {
  titulo: string; periodo: string; generado: string; filas: FilaPL[]; entrada: EntradaPL;
  anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
  columnas: { anterior: string; acumulado: string };
  ajustado?: readonly FilaPL[] | null;
}, pre: Presentacion): HojaXlsx[] {
  const aj = r.ajustado ? new Map(r.ajustado.map((f) => [f.clave, f])) : null;
  const arriba = encabezado(`P&L · ${r.titulo}`, r.periodo, r.generado,
    ["Renglón", "Real", "% de venta", ...(aj ? ["Ajuste", "Ajustado", "% ajustado"] : []), "Meta", "Meta %", "Diferencia", r.columnas.anterior, r.columnas.acumulado]);
  const de = new Map(r.filas.map((f) => [f.clave, f]));
  const cuerpo = porSecciones(pre, (clave) => {
    const f = de.get(clave);
    if (!f) return null;
    const a = aj?.get(clave);
    const ajuste = a && a.monto !== null && f.monto !== null ? Math.round((a.monto - f.monto) * 100) / 100 : null;
    return [
      f.nombre, f.monto === null ? "Sin dato" : contable(f.monto), pct(f.pct),
      ...(aj ? [ajuste ? contable(ajuste) : null, contable(a?.monto ?? f.monto), pct(a?.pct ?? f.pct)] : []),
      contable(f.meta), pct(f.metaPct), f.sinCapturar ? "Sin capturar" : contable(f.diferencia),
      r.anterior ? pct(r.anterior.get(f.clave)) : null, pct(r.acumulado.get(f.clave)),
    ];
  }, {
    venta: [["Descuentos (informativo)", contable(r.entrada.descuentos)]],
    memo: [["Compras de insumos", contable(r.entrada.memos.insumos)], ["Inversiones", contable(r.entrada.memos.inversiones)]],
  }, arriba.length);
  return [{ nombre: "Contra meta", filas: [...arriba, ...cuerpo.filas], negritas: [0, 4], estilos: cuerpo.estilos,
    anchos: [32, 16, 12, ...(aj ? [16, 16, 12] : []), 16, 12, 16, 18, 18] }];
}

/** Hoja "Ajustes": cada ajuste del periodo con su regla, real, ajuste, ajustado y nota. Sin ajustes no hay hoja. */
export function hojaAjustes(r: { titulo: string; periodo: string; generado: string; lista: readonly AjustePL[] }): HojaXlsx[] {
  if (!r.lista.length) return [];
  const filas: Celda[][] = [
    [`Ajustes del P&L · ${r.titulo}`], [`${r.periodo} · el real no cambia; el ajustado aplica estos ajustes`], [`Generado por ${r.generado}`], [],
    ["Sucursal", "Mes", "Renglón", "Regla", "Real", "Ajuste", "Ajustado", "Nota"],
    ...r.lista.map((a): Celda[] => [a.sucursal, a.mes.slice(0, 7), a.nombre, a.regla, contable(a.real), contable(a.ajuste), contable(a.ajustado), a.nota]),
  ];
  return [{ nombre: "Ajustes", filas, negritas: [0, 4], anchos: [24, 10, 28, 44, 16, 16, 16, 60] }];
}

/** Hoja "Comparativo": cada periodo con su monto y su % de venta, más el total. */
export function hojaComparativo(r: { titulo: string; periodo: string; generado: string; columnas: ColumnaPL[]; total: ColumnaPL }, pre: Presentacion): HojaXlsx[] {
  const todas = [...r.columnas, r.total];
  const arriba = encabezado(`P&L comparativo · ${r.titulo}`, r.periodo, r.generado, ["Renglón", ...todas.flatMap((c) => [c.etiqueta, "%"])]);
  const cuerpo = porSecciones(pre, (clave) => {
    const fs = todas.map((c) => c.filas.find((f) => f.clave === clave));
    return fs[0] ? [r.total.filas.find(f=>f.clave===clave)?.nombre ?? fs[0].nombre, ...fs.flatMap((f) => [contable(f?.monto ?? null), pct(f?.pct)])] : null;
  }, {
    venta: [["Descuentos (informativo)", ...todas.flatMap((c) => [contable(c.entrada.descuentos), null])]],
    memo: [
      ["Compras de insumos", ...todas.flatMap((c) => [contable(c.entrada.memos.insumos), null])],
      ["Inversiones", ...todas.flatMap((c) => [contable(c.entrada.memos.inversiones), null])],
    ],
  }, arriba.length);
  return [{ nombre: "Comparativo", filas: [...arriba, ...cuerpo.filas], negritas: [0, 4], estilos: cuerpo.estilos, anchos: [32, ...todas.flatMap(() => [16, 9])] }];
}
