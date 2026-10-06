import { test } from "node:test";
import assert from "node:assert/strict";
import { limiteEntero, nombreMes, retencionesDePagos, porMes, leerEntero, hojaRetenciones } from "./retenciones.ts";
import type { Aplicacion, Entero } from "./retenciones.ts";

const aplicacion = (monto = 29744, fecha = "2026-10-06"): Aplicacion => ({ pago_id: "p", monto, pagos: { fecha, anulado_en: null },
  facturas: { id: "f", serie: null, folio: "Renta", uuid: null, total: 29744, tipo: "ingreso", estado: "pagada", retencion_iva: 3328, retencion_isr: 3120,
    proveedores: { razon_social: "Arrendador", nombre_comercial: null, rfc: "PEPJ800101AB1" } } });
const entero = (iva = 3328, isr = 3120, fecha = "2026-11-15"): Entero => ({ id: "e", mes: "2026-10-01", fecha, iva, isr, operacion: "123", acuse_ruta: null, anulado_en: null, motivo_anulacion: null });
const mes = (enteros: Entero[] = [], hoy = "2026-11-01") => porMes(retencionesDePagos([aplicacion()]), enteros, hoy)[0];

test("retenciones: límite de diciembre cruza el año y nombre del mes", () => {
  assert.equal(limiteEntero("2026-12"), "2027-01-17"); assert.equal(limiteEntero("2026-02"), "2026-03-17");
  assert.equal(nombreMes("2026-10"), "Octubre 2026"); assert.throws(() => limiteEntero("2026-13"));
});
test("retenciones: renta completa, mitad y tope proporcional", () => {
  assert.equal(retencionesDePagos([aplicacion()])[0].iva, 3328);
  const mitad = retencionesDePagos([aplicacion(14872)])[0]; assert.equal(mitad.iva, 1664); assert.equal(mitad.isr, 1560);
  assert.equal(retencionesDePagos([aplicacion(40000)])[0].iva, 3328);
});
test("retenciones: centavos de una aplicación pequeña", () => {
  assert.equal(retencionesDePagos([aplicacion(100)])[0].iva, 11.19); assert.equal(retencionesDePagos([aplicacion(100)])[0].isr, 10.49);
});
test("retenciones: descarta pagos anulados, egresos, canceladas y sin retención", () => {
  const anulada = aplicacion(); anulada.pagos.anulado_en = "2026-10-07";
  const egreso = aplicacion(); egreso.facturas.tipo = "egreso";
  const cancelada = aplicacion(); cancelada.facturas.estado = "cancelada";
  const sin = aplicacion(); sin.facturas.retencion_iva = 0; sin.facturas.retencion_isr = 0;
  const cero = aplicacion(); cero.facturas.total = 0;
  assert.deepEqual(retencionesDePagos([anulada, egreso, cancelada, sin, cero, aplicacion(0)]), []);
});
test("retenciones: dos pagos en meses diferentes y orden descendente", () => {
  const meses = porMes(retencionesDePagos([aplicacion(14872, "2026-09-30"), aplicacion(14872)]), [], "2026-10-06");
  assert.deepEqual(meses.map((m) => m.mes), ["2026-10", "2026-09"]); assert.equal(meses[0].iva, 1664); assert.equal(meses[1].isr, 1560);
});
test("retenciones: pendiente, cinco días, vence hoy y vencido", () => {
  assert.equal(mes().estado, "pendiente"); assert.equal(mes([], "2026-11-12").estado, "por_vencer");
  assert.equal(mes([], "2026-11-17").dias, 0); assert.equal(mes([], "2026-11-17").estado, "por_vencer");
  assert.equal(mes([], "2026-11-18").estado, "vencido");
});
test("retenciones: entero completo y tolerancia por impuesto", () => {
  assert.equal(mes([entero()]).estado, "enterado"); assert.equal(mes([entero(3327, 3119)]).estado, "enterado");
  assert.equal(mes([entero(3326.99, 3120)]).estado, "falta"); assert.equal(mes([entero(3329, 3121)]).estado, "enterado");
});
test("retenciones: complementario suma y conserva fecha del último", () => {
  const m = mes([entero(1664, 1560), { ...entero(1664, 1560, "2026-11-16"), id: "e2" }]);
  assert.equal(m.estado, "enterado"); assert.equal(m.ultimoEntero, "2026-11-16"); assert.equal(m.enteradoIva, 3328);
});
test("retenciones: anulados quedan en historial pero no suman", () => {
  const e = { ...entero(), anulado_en: "2026-11-16", motivo_anulacion: "Error" };
  const m = mes([e], "2026-11-18"); assert.equal(m.estado, "vencido"); assert.equal(m.enteros.length, 1); assert.equal(m.enteradoIva, 0); assert.equal(m.ultimoEntero, null);
});
test("retenciones: falta con vencimiento y exceso no compensa otro impuesto", () => {
  const m = mes([entero(4000, 0)], "2026-11-18"); assert.equal(m.estado, "falta"); assert.equal(m.vencido, true); assert.equal(m.faltaIsr, 3120); assert.equal(m.excesoIva, 672);
});
test("retenciones: exceso y mes sin pagos después de anular el pago", () => {
  assert.equal(mes([entero(3330, 3120)]).estado, "de_mas");
  assert.equal(porMes([], [entero()], "2026-11-18")[0].estado, "de_mas");
  assert.equal(porMes([], [{ ...entero(), anulado_en: "2026-11-16" }], "2026-11-18")[0].estado, "sin_retenciones");
});
test("retenciones: Excel incluye detalle, fecha, importes y totales", () => {
  const hoja = hojaRetenciones(mes(), "Admin")[0]; assert.equal(hoja.filas[5][0], "Arrendador"); assert.deepEqual(hoja.filas[5][3], { fecha: "2026-10-06" });
  assert.deepEqual(hoja.filas.at(-1)?.slice(4), [{ valor: 29744, formato: "pesos" }, { valor: 3328, formato: "pesos" }, { valor: 3120, formato: "pesos" }]);
});
const leer = (cambios: Record<string, string> = {}) => leerEntero((c) => ({ mes: "2026-10", fecha: "2026-11-01", iva: "3328.00", isr: "3120", operacion: " 123 ", ...cambios })[c], "2026-11-15");
test("retenciones: valida entero y operación opcional", () => {
  assert.deepEqual(leer(), { datos: { mes: "2026-10-01", fecha: "2026-11-01", iva: 3328, isr: 3120, operacion: "123" } });
  assert.ok("datos" in leer({ iva: "0", operacion: "" }));
});
test("retenciones: rechaza mes inválido y fechas falsas, futuras o anteriores", () => {
  for (const cambios of [{ mes: "2026-13" }, { mes: "0000-01" }, { fecha: "2026-02-30" }, { fecha: "2026-11-16" }, { fecha: "2026-09-30" }]) assert.ok("error" in leer(cambios));
});
test("retenciones: rechaza ceros, negativos, basura y fracciones de centavo", () => {
  for (const cambios of [{ iva: "0", isr: "0" }, { iva: "-1" }, { iva: "NaN" }, { iva: "Infinity" }, { iva: "" }, { iva: "1.001" }, { operacion: "X".repeat(61) }]) assert.ok("error" in leer(cambios));
});
