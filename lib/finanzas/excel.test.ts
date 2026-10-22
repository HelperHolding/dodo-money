import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaComparativo, hojaPL } from "./excel.ts";
import { calcularPL, entradaVacia } from "./pl.ts";
import { PRESENTACION } from "./secciones.ts";

const BARRA = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };
const ctx = (venta: number) => ({ ventaNeta: venta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });

test("hojaPL: secciones con color, barras de total, montos contables y memo al final", () => {
  const e = { ...entradaVacia(), ventaNeta: 1000, alimento: 300, descuentos: 50 };
  const filas = calcularPL(e, [{ renglon: "alimento", tipo: "pct", valor: 0.3 }], ctx(1000));
  const [h] = hojaPL({
    titulo: "Consolidado", periodo: "Semana 41 · 5 al 11 oct 2026", generado: "Sebastián", filas, entrada: e, anterior: null,
    acumulado: new Map([["alimento", 0.31]]), columnas: { anterior: "Semana anterior %", acumulado: "Acumulado del mes %" },
  }, PRESENTACION);
  const fila = (t: string) => h.filas.findIndex((f) => f[0] === t);
  assert.equal(h.nombre, "Contra meta");
  assert.equal(h.filas[1][0], "Semana 41 · 5 al 11 oct 2026 · venta neta sin IVA, después de descuentos; criterio devengado · merma de productos terminados e insumos adicionales al BOM");
  assert.deepEqual(h.filas[4], ["Renglón", "Real", "% de venta", "Meta", "Meta %", "Diferencia", "Semana anterior %", "Acumulado del mes %"]);
  assert.deepEqual(h.estilos![fila("VENTA E INGRESOS")], { fondo: "BDD7EE", negrita: true });
  assert.deepEqual(h.estilos![fila("GASTOS DE OPERACIÓN")], { fondo: "FCE4D6", negrita: true });
  assert.deepEqual(h.estilos![fila("Margen bruto")], BARRA);
  assert.deepEqual(h.estilos![fila("EBITDA")], BARRA);
  assert.equal(h.estilos![fila("Alimento y empaque")], undefined);
  assert.deepEqual(h.filas[fila("Alimento y empaque")].slice(1), [
    { valor: 300, formato: "contable" }, { valor: 0.3, formato: "porcentaje" }, { valor: 300, formato: "contable" },
    { valor: 0.3, formato: "porcentaje" }, { valor: 0, formato: "contable" }, null, { valor: 0.31, formato: "porcentaje" },
  ]);
  assert.deepEqual(h.filas[fila("Descuentos (informativo)")], ["Descuentos (informativo)", { valor: 50, formato: "contable" }]);
  assert.equal(h.filas[fila("Merma")][1], "Sin dato");
  assert.ok(fila("Descuentos (informativo)") < fila("COSTO DE VENTA"));
  assert.ok(fila("MEMO") > fila("EBITDA"));
});

test("hojaComparativo: periodos lado a lado (monto y %) con su total", () => {
  const col = (etiqueta: string, venta: number) => {
    const entrada = { ...entradaVacia(), ventaNeta: venta, alimento: venta * 0.3 };
    return { etiqueta, filas: calcularPL(entrada, [], ctx(venta)), entrada };
  };
  const [h] = hojaComparativo({
    titulo: "Consolidado", periodo: "Semanas de octubre 2026", generado: "Sebastián",
    columnas: [col("Sem 40 · 1–4 oct", 400), col("Sem 41 · 5–11 oct", 600)], total: col("Total octubre", 1000),
  }, PRESENTACION);
  assert.equal(h.nombre, "Comparativo");
  assert.deepEqual(h.filas[4], ["Renglón", "Sem 40 · 1–4 oct", "%", "Sem 41 · 5–11 oct", "%", "Total octubre", "%"]);
  assert.deepEqual(h.filas.find((f) => f[0] === "Venta neta")!.slice(1), [
    { valor: 400, formato: "contable" }, { valor: 1, formato: "porcentaje" }, { valor: 600, formato: "contable" },
    { valor: 1, formato: "porcentaje" }, { valor: 1000, formato: "contable" }, { valor: 1, formato: "porcentaje" },
  ]);
  assert.deepEqual(h.estilos![h.filas.findIndex((f) => f[0] === "EBITDA")], BARRA);
});

test("hojaPL: un costo fijo sin capturar dice 'Sin capturar' en la diferencia", () => {
  const filas = calcularPL({ ...entradaVacia(), ventaNeta: 1000 }, [{ renglon: "renta", tipo: "monto", valor: 300 }], ctx(1000));
  const [h] = hojaPL({ titulo: "Zapopan-1", periodo: "Octubre 2026", generado: "S", filas, entrada: entradaVacia(), anterior: null,
    acumulado: new Map(), columnas: { anterior: "Mes anterior %", acumulado: "Acumulado del año %" } }, PRESENTACION);
  assert.equal(h.filas.find((f) => f[0] === "Renta")![5], "Sin capturar");
});


test("Excel P&L y comparativo excluyen venta bruta y conservan ventas netas y costos por fuente", () => {
  const entrada = { ...entradaVacia(), ventaNeta: 300, alimento: 90,
    canales: { dodo: { bruta: 140, neta: 100, alimento: 30 }, rappi: { bruta: 300, neta: 200, alimento: 60 } } };
  const filas = calcularPL(entrada, [], ctx(300));
  const [meta] = hojaPL({ titulo: "Sucursal", periodo: "Octubre", generado: "S", entrada, filas, anterior: null,
    acumulado: new Map(), columnas: { anterior: "Anterior", acumulado: "Acumulado" } }, PRESENTACION);
  const col = { etiqueta: "Octubre", entrada, filas };
  const [comp] = hojaComparativo({ titulo: "Sucursal", periodo: "Octubre", generado: "S", columnas: [col], total: col }, PRESENTACION);
  for (const hoja of [meta, comp]) {
    assert.equal(hoja.filas.some(f => typeof f[0] === "string" && f[0].toLowerCase().includes("venta bruta")), false);
    assert.deepEqual(hoja.filas.find(f => f[0] === "Venta neta")![1], { valor: 300, formato: "contable" });
    assert.deepEqual(hoja.filas.find(f => f[0] === "Rappi · alimento y empaque")![1], { valor: 60, formato: "contable" });
  }
});


test("exportaciones conservan el estado provisional de merma en comparativo",()=>{
 const e={...entradaVacia(),ventaNeta:1000,alimento:300,merma:40,mermaPendiente:true};
 const filas=calcularPL(e,[],ctx(1000)),col={etiqueta:"Octubre",entrada:e,filas};
 const [h]=hojaComparativo({titulo:"Sucursal",periodo:"Octubre",generado:"S",columnas:[col],total:col},PRESENTACION);
 assert.ok(h.filas.some(f=>f[0]==="EBITDA (provisional)"));
 assert.ok(h.filas.some(f=>f[0]==="Merma (pendiente/parcial)"));
 const fila=h.filas.find(f=>f[0]==="EBITDA (provisional)")!;
 assert.deepEqual(fila[1],{valor:660,formato:"contable"});
});
