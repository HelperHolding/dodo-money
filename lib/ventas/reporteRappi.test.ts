import test from "node:test";
import assert from "node:assert/strict";
import { hojasReporteRappi, ordenesReporteRappi, resumenReporteRappi } from "./reporteRappi.ts";
import { ordenesDesdeDodo, TIENDA_TURBO, type RappiGuardada } from "./rappi.ts";
import { escribirXlsx } from "../xlsx-escribir.ts";

const SUC = "suc-la-calma";
const orden = (rappi_id: string, fecha: string, hora: string, estado: RappiGuardada["estado"], importes: [number, number, number], extra: Partial<RappiGuardada> = {}): RappiGuardada => {
  const [bruto, descuento, descuentoRappi] = importes, subtotal = bruto - descuento;
  return { rappi_id, tienda_id: "MX1", fecha, hora, estado, pago: "Tarjeta de Crédito/Débito - visa", bruto, descuento_restaurante: descuento,
    subtotal_restaurante: subtotal, descuento_rappi: descuentoRappi, facturar: subtotal - descuentoRappi, sucursal_id: SUC, sumar: true,
    archivo: "portal-rappi-2026-10-30_2026-10-30.json", registrado_en: "",
    rappi_lineas: [{ rappi_id, linea: 1, nombre: "Pepperoni", opciones: "30 cm", cantidad: 1, importe: bruto, producto_id: 1 }], ...extra };
};
// Real del 31 oct 2026 (#2485131479) más casos de cada estado y fuente.
const ORDENES: RappiGuardada[] = [
  orden("2485131479", "2026-10-31", "22:38:00", "Finalizado", [165, 39.6, 43.4]),
  orden("2485000001", "2026-10-30", "20:05:00", "Finalizado", [199, 47.75, 52.25], { tienda_id: TIENDA_TURBO, pago: "Efectivo" }),
  orden("2485000002", "2026-10-30", "21:10:00", "Cancelado", [300, 0, 0]),
  orden("2485000003", "2026-10-30", "21:40:00", "Con reclamo", [120, 20, 0]),
  orden("2485000004", "2026-10-31", "13:00:00", "Finalizado", [200, 0, 0], { sumar: false }),
  ...ordenesDesdeDodo([{ dodo_id: "11F1", sucursal_id: SUC, fecha: "2026-10-31", hora: "14:15:00", total: 120, total_sin_descuento: 150, agregador: "Rappi",
    pedido_productos: [{ renglon: 1, nombre: "Hawaiana Mediano", precio: 99, precio_sin_descuento: 120, dodo_id: 7 }, { renglon: 2, nombre: "Coca Light 0,6 L", precio: 21, precio_sin_descuento: 30, dodo_id: 8 }] }]),
];

test("reporte Rappi: renglones por orden con tienda, fuente y si cuenta en la venta", () => {
  const o = ordenesReporteRappi(ORDENES, () => "Zapopan-1 La Calma");
  assert.deepEqual(o.map((x) => [x.id, x.dia, x.tienda, x.fuente, x.cuenta]), [
    ["2485000001", "Viernes", "Rappi Turbo", "Portal Rappi", true],
    ["2485000002", "Viernes", "Rappi", "Portal Rappi", false],
    ["2485000003", "Viernes", "Rappi", "Portal Rappi", false],
    ["2485000004", "Sábado", "Rappi", "Incluida en Dodo IS", false],
    ["Dodo IS 11F1", "Sábado", "Dodo IS", "Dodo IS", true],
    ["2485131479", "Sábado", "Rappi", "Portal Rappi", true],
  ]);
  assert.equal(o[0].hora, "20:05");
});

test("reporte Rappi: la venta solo suma las que cuentan; canceladas, reclamos y tiendas aparte", () => {
  const r = resumenReporteRappi(ordenesReporteRappi(ORDENES, () => "Zapopan-1 La Calma"));
  assert.deepEqual(r.venta, { ordenes: 3, bruto: 514, descuento: 117.35, subtotal: 396.65, descuentoRappi: 95.65, facturar: 301 });
  assert.deepEqual([r.recibidas, r.canceladas, r.conReclamo, r.noSuman, r.subtotalCanceladas, r.subtotalReclamo], [6, 1, 1, 1, 300, 100]);
  assert.deepEqual(r.tiendas, [{ tienda: "Rappi", ordenes: 1, subtotal: 125.4 }, { tienda: "Rappi Turbo", ordenes: 1, subtotal: 151.25 }, { tienda: "Dodo IS", ordenes: 1, subtotal: 120 }]);
  assert.deepEqual(r.dias.map((d) => [d.fecha, d.ordenes, d.subtotal, d.turbo, d.canceladas, d.reclamos]), [["2026-10-30", 1, 151.25, 151.25, 1, 1], ["2026-10-31", 2, 245.4, 0, 0, 0]]);
  assert.deepEqual(r.semana.map((d) => d.dia), ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
  assert.deepEqual(r.horas.map((h) => [h.hora, h.ordenes]), [[14, 1], [20, 1], [22, 1]]);
  assert.deepEqual(r.productos[0], { nombre: "Pepperoni", unidades: 2, ordenes: 2, importe: 364 });
  assert.deepEqual(r.pagos, [{ pago: "Dodo IS · Rappi", ordenes: 1 }, { pago: "Efectivo", ordenes: 1 }, { pago: "Tarjeta de Crédito/Débito", ordenes: 1 }]);
});

test("reporte Rappi: Excel con fórmulas sobre «Órdenes» y sus resultados", () => {
  const ordenes = ordenesReporteRappi(ORDENES, () => "Zapopan-1 La Calma");
  const hojas = hojasReporteRappi({ titulo: "Zapopan-1 La Calma", desde: "2026-10-01", hasta: "2026-10-31", generado: "Prueba", ordenes });
  assert.deepEqual(hojas.map((h) => h.nombre), ["Resumen", "Por día", "Órdenes", "Productos", "Más vendidos"]);
  const resumen = hojas[0].filas, valor = (fila: number) => resumen[fila - 1][1] as { formula: string; resultado: number };
  assert.equal(valor(7).formula, 'COUNTIFS(Órdenes!$H$2:$H$7,"Sí")');
  assert.equal(valor(7).resultado, 3);
  assert.equal(valor(12).formula, 'SUMIFS(Órdenes!$O$2:$O$7,Órdenes!$H$2:$H$7,"Sí")');
  assert.equal(valor(12).resultado, 396.65);
  assert.deepEqual(resumen.slice(20, 23).map((f) => f[0]), ["Rappi", "Rappi Turbo", "Dodo IS"]);
  assert.equal(hojas[2].filas.length, 7);
  assert.equal(hojas[3].filas.length, 8);
  const totalDia = hojas[1].filas.at(-1)!;
  assert.equal((totalDia[7] as { resultado: number }).resultado, 396.65);
  assert.ok(escribirXlsx(hojas).length > 1000);
});

test("reporte Rappi: periodo sin órdenes no truena", () => {
  const hojas = hojasReporteRappi({ titulo: "Todas las sucursales", desde: "2026-12-01", hasta: "2026-12-02", generado: "Prueba", ordenes: [] });
  assert.equal(hojas[2].filas.length, 1);
  assert.ok(escribirXlsx(hojas).length > 1000);
});
