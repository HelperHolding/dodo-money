import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaFlujo, hojaFlujoComparativo } from "./excelFlujo.ts";
import { calcularFlujo, SECCIONES_FLUJO, visibles, type MovimientoFlujo } from "./flujo.ts";

const m = (fecha: string, cargo: number, abono: number, saldo: number, tipo: string | null, concepto = ""): MovimientoFlujo =>
  ({ cuentaId: "c1", fecha, fila: Number(fecha.slice(8)), cargo, abono, saldo, conciliacion: tipo ? { tipo, concepto } : null });
const flujo = calcularFlujo([m("2026-10-01", 0, 1000, 1000, "cobro_tarjeta", "cobranza_tarjeta"), m("2026-10-02", 30, 0, 970, null)]);
const BARRA = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };

test("hoja Flujo: encabezado, secciones, barras, porcentajes y avisos", () => {
  const [h] = hojaFlujo({ titulo: "Todas las razones sociales", periodo: "Octubre 2026", generado: "Sebastián", flujo, secciones: SECCIONES_FLUJO, mostrar: visibles([flujo]) });
  const fila = (t: string) => h.filas.findIndex((f) => f[0] === t);
  assert.equal(h.nombre, "Flujo");
  assert.equal(h.filas[0][0], "Flujo de efectivo · Todas las razones sociales");
  assert.deepEqual(h.filas[4], ["Renglón", "Monto", "% de ingresos"]);
  assert.deepEqual(h.estilos![fila("FLUJO DE OPERACIÓN · INGRESOS")], { fondo: "BDD7EE", negrita: true });
  assert.deepEqual(h.estilos![fila("Flujo neto")], BARRA);
  assert.deepEqual(h.filas[fila("Cobranza tarjeta (NetPay)")], ["Cobranza tarjeta (NetPay)", { valor: 1000, formato: "contable" }, { valor: 1, formato: "porcentaje" }]);
  assert.equal(fila("Apertura y equipamiento"), -1);
  assert.ok(fila("Por conciliar · salidas") > 0);
  assert.ok(h.filas.some((f) => f[0] === "1 movimiento por conciliar."));
});

test("hoja Flujo comparativo: columnas por mes más total", () => {
  const vacio = calcularFlujo([]);
  const [h] = hojaFlujoComparativo({
    titulo: "Todas", periodo: "2026", generado: "Sebastián", secciones: SECCIONES_FLUJO, mostrar: visibles([flujo, vacio]),
    columnas: [{ etiqueta: "Sep 2026", flujo: vacio }, { etiqueta: "Oct 2026", flujo }], total: { etiqueta: "Total", flujo },
  });
  assert.equal(h.nombre, "Flujo comparativo");
  assert.deepEqual(h.filas[4], ["Renglón", "Sep 2026", "Oct 2026", "Total"]);
  const neto = h.filas.find((f) => f[0] === "Flujo neto")!;
  assert.deepEqual(neto.slice(1), [{ valor: 0, formato: "contable" }, { valor: 970, formato: "contable" }, { valor: 970, formato: "contable" }]);
});
