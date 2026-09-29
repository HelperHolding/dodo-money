import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerPrimeraHoja } from "./xlsx.ts";
import { extraerProductos, extraerVentas } from "./extraer.ts";
import {
  compararConCierre, costearProductos, costeo, resumenSinCosto, costoVigente, descuentos, diasConCierre, errorDeCosto, errorDeMonto, separarDesglose, sumarDesglose, ventaPorDia, periodoAnterior, periodoElegido, periodoPorDefecto,
  porProducto, resumenVentas, tamanoPorNombre, topProductos, type Categoria, type RenglonCosteo, type VentaDia,
} from "./calculos.ts";

// Costos del seed (supabase/seed_ventas_costos.sql), vigentes desde 2026-08-09.
const SEED: Record<number, [Categoria, number | null]> = {
  27: ["pizza", 26.74], 33: ["pizza", 44.09], 40: ["pizza", 32.66], 42: ["pizza", 42.00], 43: ["pizza", 40.32],
  64: ["pizza", 39.39], 65: ["pizza", 41.13], 67: ["pizza", 44.01], 70: ["pizza", 29.76], 71: ["pizza", 35.21],
  73: ["pizza", 48.28], 80: ["pizza", 51.70], 87: ["pizza", 42.87], 96: ["pizza", 43.13], 108: ["pizza", 45.51],
  115: ["pizza", 48.58], 117: ["pizza", 72.99], 139: ["pizza", 39.77], 145: ["pizza", 41.57], 165: ["pizza", 69.07],
  171: ["pizza", 70.02], 187: ["pizza", 48.68],
  161: ["snack", 25.49], 202: ["snack", 23.66], 204: ["snack", 21.38], 199: ["snack", 16.48], 200: ["snack", 12.56],
  201: ["snack", 19.58], 208: ["snack", 28.26],
  156: ["bebida", null], 157: ["bebida", null],
};

const hoja = (n: string) => leerPrimeraHoja(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url)));
const ventas = extraerVentas(hoja("ventas-2026-09-25.xlsx"));
const productos = extraerProductos(hoja("productos-2026-09-25.xlsx"));
const factor = (ventas.resumen.total - ventas.resumen.iva) / ventas.resumen.total;
/** Lo que devolvería la vista ventas_producto_costeo para el 25/09/2026 con el seed cargado. */
const renglones: RenglonCosteo[] = productos.productos.map((p) => ({
  fecha: productos.fecha, dodo_id: p.dodo_id, nombre: p.nombre, categoria: SEED[p.dodo_id]?.[0] ?? null,
  cantidad: p.cantidad, importe: p.importe, importe_sin_descuento: p.importe_sin_descuento,
  importe_neto: p.importe * factor, costo_unitario: SEED[p.dodo_id]?.[1] ?? null,
}));
const dia: VentaDia = { sucursal_id: "s", fecha: ventas.fecha, venta_m2: ventas.resumen.venta_m2, ...ventas.resumen };

test("tamanoPorNombre", () => {
  assert.equal(tamanoPorNombre("Quatro quesos Pequeño"), "pequeno");
  assert.equal(tamanoPorNombre("Margarita Mediano"), "mediano");
  assert.equal(tamanoPorNombre("Papas Gajo Medium"), "mediano");
  assert.equal(tamanoPorNombre("Pepperoni Grande"), "grande");
  assert.equal(tamanoPorNombre("Pepperoni Grande T"), "grande");
  assert.equal(tamanoPorNombre("Alitas Buffalo 10 uds"), null);
  assert.equal(tamanoPorNombre("Coca-Cola 2 L"), null);
});

test("costoVigente toma el más reciente que no pasa de la fecha", () => {
  const costos = [{ vigente_desde: "2026-08-09", costo: 42 }, { vigente_desde: "2026-10-01", costo: 45 }];
  assert.equal(costoVigente(costos, "2026-08-08")?.costo ?? null, null);
  assert.equal(costoVigente(costos, "2026-08-09")?.costo ?? null, 42);
  assert.equal(costoVigente(costos, "2026-09-30")?.costo ?? null, 42);
  assert.equal(costoVigente(costos, "2026-10-01")?.costo ?? null, 45);
  assert.equal(costoVigente([], "2026-10-01"), null);
});

test("resumenVentas del 25/09/2026", () => {
  const r = resumenVentas([dia]);
  assert.equal(r.total, 7736);
  assert.equal(r.neta, 6669.03);
  assert.equal(r.pedidos, 39);
  assert.equal(r.ticket?.toFixed(2), "198.36");
  assert.equal(r.dias, 1);
  assert.equal(resumenVentas([]).ticket, null);
});

test("costeo del 25/09/2026 con los costos del seed", () => {
  const c = costeo(renglones);
  assert.equal(c.total.costo, 2187.19);
  assert.equal(c.total.ventaNetaConCosto, 6463.77);
  assert.equal(((c.total.costoPct ?? 0) * 100).toFixed(2), "33.84");
  const pizza = c.categorias.find((g) => g.categoria === "pizza")!;
  assert.equal(pizza.costo, 1920.97);
  assert.equal(pizza.piezasConCosto, 44);
  assert.equal(((pizza.costoPct ?? 0) * 100).toFixed(2), "34.21");
  assert.equal(pizza.costoPromedio?.toFixed(2), "43.66");
  const snack = c.categorias.find((g) => g.categoria === "snack")!;
  assert.equal(snack.costo, 266.22);
  assert.equal(snack.piezasConCosto, 14);
  assert.equal(((snack.costoPct ?? 0) * 100).toFixed(2), "31.35");
  assert.equal(snack.costoPromedio?.toFixed(2), "19.02");
  const bebida = c.categorias.find((g) => g.categoria === "bebida")!;
  assert.equal(bebida.piezasConCosto, 0);
  assert.equal(bebida.costoPct, null);
  assert.deepEqual(c.sinCosto.map((s) => s.dodo_id).sort(), [156, 157]);
  assert.equal(c.total.piezas, 64);
});

test("porProducto suma días y deja sin costo si un día no tuvo", () => {
  const r: RenglonCosteo = { fecha: "2026-09-25", dodo_id: 42, nombre: "Pepperoni Grande", categoria: "pizza", cantidad: 2, importe: 200, importe_sin_descuento: 240, importe_neto: 172, costo_unitario: 42 };
  const [p] = porProducto([r, { ...r, fecha: "2026-09-26", nombre: "Pepperoni  Grande" }]);
  assert.deepEqual(p, { dodo_id: 42, nombre: "Pepperoni  Grande", categoria: "pizza", piezas: 4, importe: 400, sinDescuento: 480, descuento: 80, ventaNeta: 344, costo: 168, costoPct: 168 / 344 });
  const [q] = porProducto([r, { ...r, fecha: "2026-09-26", costo_unitario: null }]);
  assert.equal(q.costo, null);
  assert.equal(q.costoPct, null);
});

test("topProductos ordena por importe y calcula el cambio", () => {
  const top = topProductos(porProducto(renglones), [{ dodo_id: 42, importe: 2000 }], 3);
  assert.equal(top.length, 3);
  assert.equal(top[0].dodo_id, 42);
  assert.equal(top[0].importe, 2499);
  assert.equal(top[0].cambio?.toFixed(4), "0.2495");
  assert.equal(top[1].cambio, null);
});

test("descuentos del 25/09/2026", () => {
  const d = descuentos(porProducto(renglones));
  assert.equal(d.sinDescuento, 8832);
  assert.equal(d.total, 1096);
  assert.equal(d.top[0].dodo_id, 42);
});

test("compararConCierre marca lo que difiere más de $1 o de 0 pedidos", () => {
  const cierre = { sucursal_id: "s", fecha: "2026-09-25", efectivo: 4299, tarjeta: 3436.5, app: 0, rappi: 0, iva: 1060, transacciones: 38 };
  const d = compararConCierre(dia, cierre);
  const por = Object.fromEntries(d.map((x) => [x.concepto, x]));
  assert.equal(por["Total"].diferencia, -0.5);
  assert.equal(por["Total"].alerta, false);
  assert.equal(por["Tarjeta"].alerta, false);
  assert.equal(por["IVA"].diferencia, -6.97);
  assert.equal(por["IVA"].alerta, true);
  assert.equal(por["Pedidos"].diferencia, -1);
  assert.equal(por["Pedidos"].alerta, true);
  assert.equal(por["En línea (app + Rappi)"].alerta, false);
});

test("periodos", () => {
  assert.deepEqual(periodoPorDefecto("2026-09-25"), { desde: "2026-09-19", hasta: "2026-09-25" });
  const def = periodoPorDefecto("2026-09-25");
  assert.deepEqual(periodoElegido("2026-09-01", "2026-09-10", def), { desde: "2026-09-01", hasta: "2026-09-10" });
  assert.deepEqual(periodoElegido("2026-09-10", "2026-09-01", def), def);
  assert.deepEqual(periodoElegido("2026-02-31", "2026-03-01", def), def);
  assert.deepEqual(periodoElegido(undefined, "2026-03-01", def), def);
  assert.deepEqual(periodoElegido("2026-01-01", "2026-09-01", def), def);
  assert.deepEqual(periodoAnterior({ desde: "2026-09-19", hasta: "2026-09-25" }), { desde: "2026-09-12", hasta: "2026-09-18" });
  assert.deepEqual(periodoAnterior({ desde: "2026-03-01", hasta: "2026-03-01" }), { desde: "2026-02-28", hasta: "2026-02-28" });
});

test("ventaPorDia suma sucursales y ordena por fecha", () => {
  const otro: VentaDia = { ...dia, sucursal_id: "t", total: 1000.5, pedidos: 5 };
  assert.deepEqual(ventaPorDia([{ ...dia, fecha: "2026-09-26" }, dia, otro]), [
    { fecha: "2026-09-25", total: 8736.5, pedidos: 44 },
    { fecha: "2026-09-26", total: 7736, pedidos: 39 },
  ]);
});

test("sumarDesglose junta tipos y quita los vacíos", () => {
  const filas = ventas.desglose.flatMap((d) => [d, d]);
  assert.deepEqual(sumarDesglose(filas), [{ tipo: "restaurante", pedidos: 78, total: 15472 }]);
});

test("diasConCierre compara solo los días con cierre", () => {
  const cierre = { sucursal_id: "s", fecha: "2026-09-25", efectivo: 4299, tarjeta: 3437, app: 0, rappi: 0, iva: 1066.97, transacciones: 39 };
  const r = diasConCierre([dia, { ...dia, fecha: "2026-09-26" }], [cierre, { ...cierre, fecha: "2026-09-24" }]);
  assert.equal(r.sinCierre, 1);
  assert.equal(r.comparados.length, 1);
  assert.equal(r.comparados[0].alerta, false);
  assert.ok(r.comparados[0].filas.every((f) => f.diferencia === 0));
});

test("errorDeCosto", () => {
  assert.equal(errorDeCosto(42.5, "2026-10-01"), null);
  assert.equal(errorDeCosto(0, "2026-10-01"), null);
  assert.match(errorDeCosto(-1, "2026-10-01") ?? "", /costo válido/);
  assert.match(errorDeCosto(Number.NaN, "2026-10-01") ?? "", /costo válido/);
  assert.match(errorDeCosto(10, "2026-02-30") ?? "", /fecha/);
  assert.match(errorDeCosto(10, "") ?? "", /fecha/);
});

test("separarDesglose: el tipo de servicio suma el total; el origen es otra forma de partirlo", () => {
  const filas = [
    { tipo: "entrega" as const, pedidos: 2, total: 100 },
    { tipo: "app" as const, pedidos: 2, total: 100 },
    { tipo: "restaurante" as const, pedidos: 1, total: 50 },
  ];
  const { servicio, origen } = separarDesglose(filas);
  assert.deepEqual(servicio.map((t) => t.tipo), ["entrega", "restaurante"]);
  assert.equal(servicio.reduce((s, t) => s + t.total, 0), 150);
  assert.deepEqual(origen, [{ tipo: "app", pedidos: 2, total: 100 }]);
});

test("costearProductos da lo mismo que la vista ventas_producto_costeo", () => {
  const ventasProducto = productos.productos.map((p) => ({ sucursal_id: "s", fecha: productos.fecha, ...p }));
  const catalogo = Object.entries(SEED).map(([id, [categoria]]) => ({ dodo_id: Number(id), categoria }));
  const costos = Object.entries(SEED).filter(([, [, c]]) => c !== null)
    .map(([id, [, costo]]) => ({ dodo_id: Number(id), costo: costo as number, vigente_desde: "2026-08-09" }));
  const calculados = costearProductos(ventasProducto, [dia], catalogo, costos);
  assert.equal(calculados.length, 31);
  assert.equal(costeo(calculados).total.costo, 2187.19);
  assert.equal(costeo(calculados).total.ventaNetaConCosto, 6463.77);
  const margarita = calculados.find((r) => r.dodo_id === 27)!;
  assert.equal(margarita.categoria, "pizza");
  assert.equal(margarita.costo_unitario, 26.74);
  assert.equal(margarita.importe_neto.toFixed(4), (143.4 * factor).toFixed(4));
});

test("costearProductos: sin día importado no prorratea; costo futuro o producto fuera del catálogo quedan sin costo", () => {
  const venta = { sucursal_id: "s", fecha: "2026-08-01", dodo_id: 27, nombre: "Margarita Mediano", cantidad: 1, importe: 100, importe_sin_descuento: 100 };
  const [r] = costearProductos([venta], [], [{ dodo_id: 27, categoria: "pizza" }], [{ dodo_id: 27, costo: 26.74, vigente_desde: "2026-08-09" }]);
  assert.equal(r.importe_neto, 100);
  assert.equal(r.costo_unitario, null);
  const [s] = costearProductos([{ ...venta, dodo_id: 5 }], [{ ...dia, fecha: "2026-08-01", total: 0, iva: 0 }], [], []);
  assert.equal(s.categoria, null);
  assert.equal(s.importe_neto, 100);
});

test("errorDeMonto valida solo el monto (para corregir un costo)", () => {
  assert.equal(errorDeMonto(26.74), null);
  assert.equal(errorDeMonto(0), null);
  assert.match(errorDeMonto(-0.01) ?? "", /costo válido/);
  assert.match(errorDeMonto(Number.NaN) ?? "", /costo válido/);
  assert.match(errorDeMonto(100_000_000) ?? "", /demasiado grande/);
});

test("resumenSinCosto: cuántos productos y piezas quedan fuera del costo %", () => {
  assert.deepEqual(resumenSinCosto(costeo(renglones).sinCosto), { productos: 2, piezas: 6 });
  assert.deepEqual(resumenSinCosto([]), { productos: 0, piezas: 0 });
});
