import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaAsesores } from "./excelAsesores.ts";
import { formatoAsesores, SECCIONES_ASESORES } from "./formatoAsesores.ts";
import { calcularPL, entradaVacia } from "./pl.ts";

const e = { ...entradaVacia(), canales: { dodo: { bruta: 1100, neta: 1000, alimento: 300 }, rappi: { bruta: 0, neta: 0, alimento: 0 } }, ventaNeta: 1000, alimento: 300, regalias: 50 };
const formato = formatoAsesores(e, calcularPL(e, [], { ventaNeta: 1000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } }));
const [h] = hojaAsesores({ titulo: "Consolidado", periodo: "Octubre 2026", generado: "Sebastián", formato, secciones: SECCIONES_ASESORES });
const fila = (t: string) => h.filas.findIndex((f) => f[0] === t);

test("hoja P&L asesores: encabezado, secciones con color y barras de total", () => {
  assert.equal(h.nombre, "P&L asesores");
  assert.equal(h.filas[0][0], "P&L formato asesores · Consolidado");
  assert.deepEqual(h.filas[4], ["Renglón", "Monto", "% de ventas brutas"]);
  assert.deepEqual(h.estilos![fila("VENTAS")], { fondo: "BDD7EE", negrita: true });
  assert.deepEqual(h.estilos![fila("EBITDA 4-Wall")], { fondo: "7F7F7F", texto: "FFFFFF", negrita: true });
  assert.equal(h.estilos![fila("Regalías")], undefined);
});

test("montos contables, porcentaje y Pendiente", () => {
  assert.deepEqual(h.filas[fila("Ventas brutas")], ["Ventas brutas", { valor: 1100, formato: "contable" }, { valor: 1, formato: "porcentaje" }]);
  assert.deepEqual(h.filas[fila("ISR")], ["ISR", "Pendiente", null]);
});
