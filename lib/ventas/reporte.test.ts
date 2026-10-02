import { test } from "node:test";
import assert from "node:assert/strict";
import { filasPorDia, hojasVentas, nombreArchivo, renglonesResumen, totalesDias } from "./reporte.ts";

const dia = (sucursal_id: string, fecha: string, pedidos: number, total: number, efectivo: number, tarjeta: number, en_linea: number, iva: number) =>
  ({ sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2: null });

test("filasPorDia suma las sucursales de cada día y calcula el ticket", () => {
  const filas = filasPorDia([
    dia("a", "2026-09-02", 10, 1000, 400, 500, 100, 137.93),
    dia("b", "2026-09-01", 5, 500, 500, 0, 0, 68.97),
    dia("b", "2026-09-02", 10, 1500.5, 0, 1500.5, 0, 206.97),
  ]);
  assert.deepEqual(filas, [
    { fecha: "2026-09-01", pedidos: 5, total: 500, efectivo: 500, tarjeta: 0, en_linea: 0, iva: 68.97, ticket: 100 },
    { fecha: "2026-09-02", pedidos: 20, total: 2500.5, efectivo: 400, tarjeta: 2000.5, en_linea: 100, iva: 344.9, ticket: 125.03 },
  ]);
});

test("totalesDias y el ticket sin pedidos", () => {
  const t = totalesDias([
    { fecha: "2026-09-01", pedidos: 5, total: 500, efectivo: 500, tarjeta: 0, en_linea: 0, iva: 68.97, ticket: 100 },
    { fecha: "2026-09-02", pedidos: 0, total: 0, efectivo: 0, tarjeta: 0, en_linea: 0, iva: 0, ticket: null },
  ]);
  assert.deepEqual(t, { pedidos: 5, total: 500, efectivo: 500, tarjeta: 0, en_linea: 0, iva: 68.97, ticket: 100 });
  assert.equal(filasPorDia([dia("a", "2026-09-03", 0, 0, 0, 0, 0, 0)])[0].ticket, null);
});

test("renglonesResumen: cambio relativo; el costo cambia en puntos", () => {
  const r = renglonesResumen(
    { total: 1100, neta: 948.28, iva: 151.72, pedidos: 10, ticket: 110, costoPct: 0.32 },
    { total: 1000, neta: 862.07, iva: 137.93, pedidos: 10, ticket: 100, costoPct: 0.3 },
  );
  assert.deepEqual(r.map((x) => x.concepto), ["Venta total", "Venta neta", "IVA", "Pedidos", "Ticket promedio", "Costo teórico"]);
  assert.equal(r[0].cambio, 0.1);
  assert.equal(r[3].cambio, 0);
  assert.equal(r[5].cambio, 0.02);
  assert.equal(r[5].formato, "porcentaje");
  const sin = renglonesResumen({ total: 5, neta: 4, iva: 1, pedidos: 1, ticket: 5, costoPct: null }, null);
  assert.equal(sin[0].anterior, null);
  assert.equal(sin[0].cambio, null);
  assert.equal(sin[5].actual, null);
});

test("nombreArchivo quita caracteres que Windows no acepta", () => {
  assert.equal(nombreArchivo("Coyoacán", { desde: "2026-09-01", hasta: "2026-09-30" }), "Ventas Coyoacán 2026-09-01 a 2026-09-30.xlsx");
  assert.equal(nombreArchivo("Roma/Condesa: centro?", { desde: "2026-09-01", hasta: "2026-09-01" }), "Ventas Roma Condesa centro 2026-09-01 a 2026-09-01.xlsx");
});

test("hojasVentas arma Resumen y Por día con renglón de totales", () => {
  const filas = filasPorDia([dia("a", "2026-09-01", 5, 500, 500, 0, 0, 68.97)]);
  const hojas = hojasVentas({
    titulo: "Coyoacán", periodo: { desde: "2026-09-01", hasta: "2026-09-01" }, generado: "Sebastián · 2026-10-02 10:00",
    resumen: renglonesResumen({ total: 500, neta: 431.03, iva: 68.97, pedidos: 5, ticket: 100, costoPct: null }, null),
    dias: filas,
  });
  assert.deepEqual(hojas.map((h) => h.nombre), ["Resumen", "Por día"]);
  const porDia = hojas[1].filas;
  assert.deepEqual(porDia[0], ["Fecha", "Pedidos", "Venta total", "Efectivo", "Tarjeta", "En línea", "IVA", "Ticket promedio"]);
  assert.deepEqual(porDia[1][0], { fecha: "2026-09-01" });
  assert.equal(porDia.at(-1)![0], "Total");
  assert.deepEqual(hojas[1].negritas, [0, porDia.length - 1]);
  const conCosto = hojasVentas({
    titulo: "X", periodo: { desde: "2026-09-01", hasta: "2026-09-01" }, generado: "",
    resumen: renglonesResumen({ total: 1, neta: 1, iva: 0, pedidos: 1, ticket: 1, costoPct: 0.32 }, { total: 1, neta: 1, iva: 0, pedidos: 1, ticket: 1, costoPct: 0.3 }),
    dias: [],
  })[0].filas;
  assert.deepEqual(conCosto.at(-1)![3], { valor: 2, formato: "puntos" });
  assert.deepEqual(conCosto[5][3], { valor: 0, formato: "porcentaje" });
});
