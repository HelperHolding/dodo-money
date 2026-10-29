import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaAsesores } from "./excelAsesores.ts";
import { formatoAsesores, SECCIONES_ASESORES } from "./formatoAsesores.ts";
import { calcularPL, entradaVacia, type EntradaPL } from "./pl.ts";

const e: EntradaPL = {
  ...entradaVacia(),
  canales: { dodo: { bruta: 1276, brutaSinIva: 1100, neta: 1000, alimento: 300 }, rappi: { bruta: 0, brutaSinIva: 0, neta: 0, alimento: 0 } },
  ventaNeta: 1000, alimento: 300, regalias: 50,
};
const hoja = (x: EntradaPL, avisos: readonly string[] = []) => {
  const formato = formatoAsesores(x, calcularPL(x, [], { ventaNeta: x.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } }));
  const [h] = hojaAsesores({ titulo: "Consolidado", periodo: "Octubre 2026", generado: "Sebastián", formato, secciones: SECCIONES_ASESORES, avisos });
  return { h, fila: (t: string) => h.filas.findIndex((f) => f[0] === t) };
};

test("hoja P&L asesores: encabezado, secciones con color y barras de total", () => {
  const { h, fila } = hoja(e);
  assert.equal(h.nombre, "P&L asesores");
  assert.equal(h.filas[0][0], "P&L formato asesores · Consolidado");
  assert.deepEqual(h.filas[4], ["Renglón", "Monto", "% de ventas brutas"]);
  assert.deepEqual(h.estilos![fila("VENTAS")], { fondo: "BDD7EE", negrita: true });
  assert.deepEqual(h.estilos![fila("EBITDA 4-Wall")], { fondo: "7F7F7F", texto: "FFFFFF", negrita: true });
  assert.equal(h.estilos![fila("Regalías")], undefined);
});

test("montos contables, porcentaje y Pendiente", () => {
  const { h, fila } = hoja(e);
  assert.deepEqual(h.filas[fila("Ventas brutas")], ["Ventas brutas", { valor: 1100, formato: "contable" }, { valor: 1, formato: "porcentaje" }]);
  assert.deepEqual(h.filas[fila("ISR")], ["ISR", "Pendiente", null]);
});

test("sin venta bruta sin IVA: porcentajes sobre ventas netas en encabezado y subtítulo", () => {
  const { h } = hoja({ ...e, canales: { ...e.canales, dodo: { ...e.canales.dodo, brutaSinIva: null } } });
  assert.deepEqual(h.filas[4], ["Renglón", "Monto", "% de ventas netas"]);
  assert.match(String(h.filas[1][0]), /% de ventas netas$/);
});

test("totales provisionales con monto llevan la marca; los Pendiente sin monto no", () => {
  const { h, fila } = hoja({ ...e, merma: 10, mermaPendiente: true });
  assert.notEqual(fila("EBITDA (provisional)"), -1);
  assert.notEqual(fila("Utilidad bruta (provisional)"), -1);
  assert.notEqual(fila("Merma (provisional)"), -1);
  assert.equal(fila("EBITDA"), -1);
  assert.notEqual(fila("ISR"), -1);
});

test("avisos del formato y de la página al final, uno por fila", () => {
  const { h } = hoja({ ...e, canales: { ...e.canales, dodo: { ...e.canales.dodo, brutaSinIva: null } } }, ["Renta sin capturar.", "Merma pendiente."]);
  const ultimas = h.filas.slice(-3).map((f) => f[0]);
  assert.match(String(ultimas[0]), /^La venta bruta sin IVA no está completa/);
  assert.deepEqual(ultimas.slice(1), ["Renta sin capturar.", "Merma pendiente."]);
  assert.ok(h.filas.slice(-3).every((f) => f.length === 1));
});
