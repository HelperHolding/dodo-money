import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerHojas, type Hoja } from "./xlsx.ts";
import { ARCHIVO_MUY_GRANDE, extraerDatosBrutos, HOJAS_NO_COINCIDEN, mensajeAlGuardar, NO_ES_DATOS_BRUTOS, SIN_PEDIDOS } from "./datosBrutos.ts";
import { canales, combos, cuentaComoVenta, diaSemana, ivaDe, personalYCancelados, resumirDias, tiempos, tiposDesglose, ventaPorHora } from "./pedidos.ts";

const leer = (n: string) => leerHojas(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url)));
const hojas = leer("datos-brutos-2026-09-21.xlsx");
const archivo = extraerDatosBrutos(hojas);
const { pedidos, productos } = archivo;

/** Copia de las hojas con celdas cambiadas o quitadas (valor null) en una hoja. */
function con(nombre: string, cambios: Record<string, string | null>): Hoja[] {
  return hojas.map((h) => {
    if (h.nombre.trim() !== nombre) return h;
    const celdas = new Map(h.celdas);
    for (const [ref, v] of Object.entries(cambios)) v === null ? celdas.delete(ref) : celdas.set(ref, v);
    return { nombre: h.nombre, celdas };
  });
}

test("leerHojas trae las dos hojas del archivo", () => {
  assert.deepEqual(hojas.map((h) => h.nombre.trim()), ["RawData", "OrderPositions"]);
});

test("el archivo de prueba no trae nombres de clientes", () => {
  const raw = hojas[0];
  const columna = [...raw.celdas].find(([, v]) => v === "ClientName")![0].replace("1", "");
  assert.equal([...raw.celdas.keys()].filter((r) => r.startsWith(columna) && r !== `${columna}1`).length, 0);
});

test("extraerDatosBrutos: 334 pedidos y 572 productos de Zapopan-1, del 21 al 28 de septiembre", () => {
  assert.equal(pedidos.length, 334);
  assert.equal(productos.length, 572);
  assert.deepEqual([...new Set(pedidos.map((p) => p.sucursal))], ["Zapopan-1"]);
  const fechas = [...new Set(pedidos.map((p) => p.fecha))].sort();
  assert.deepEqual([fechas[0], fechas.at(-1), fechas.length], ["2026-09-21", "2026-09-28", 8]);
});

test("un pedido normalizado", () => {
  const p = pedidos.find((x) => x.dodo_id === "11F1BBB253AC96FFAC9140E88E6966BF")!;
  assert.deepEqual(
    { ...p, cliente_id: undefined, turno_dodo: undefined },
    {
      dodo_id: "11F1BBB253AC96FFAC9140E88E6966BF", sucursal: "Zapopan-1", fecha: "2026-09-28", hora: "21:03",
      pago: "efectivo", tipo: "en_tienda", origen: "mostrador", origen_dodo: "Restaurant", para_llevar: true,
      estado: "entregado", total: 129, total_sin_descuento: 129, productos: 1, promocion: null,
      cliente_id: undefined, cliente_pedidos: null, turno_dodo: undefined, agregador: null,
      inicio_coccion: "2026-09-28T21:04:00-06:00", listo: "2026-09-28T21:10:00-06:00", entregado: "2026-09-28T21:10:00-06:00",
    },
  );
  const linea = productos.find((x) => x.pedido_id === p.dodo_id)!;
  assert.deepEqual(linea, {
    pedido_id: p.dodo_id, renglon: 1, dodo_uuid: "11F19997A22F8B4D9C579AF6B112B260", nombre: "Pepperoni Mediano",
    precio: 129, precio_sin_descuento: 129, costo_dodo: 2280, combo: null,
  });
});

test("nombres de producto como en ProductsSales", () => {
  const nombres = new Set(productos.map((x) => x.nombre));
  for (const n of ["Papas Gajo Medium", "Alitas Buffalo 10 uds", "Coca-Cola 0,6 L", "Dip Mango Habanero Dip", "Pepperoni Grande"]) assert.ok(nombres.has(n), n);
});

test("25/09 cuadra con los reportes Ventas y ProductsSales de Dodo IS", () => {
  const d = resumirDias(pedidos, productos).find((x) => x.fecha === "2026-09-25")!;
  assert.deepEqual(d.resumen, { pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97 });
  assert.deepEqual(d.desglose, [{ tipo: "restaurante", pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97 }]);
  assert.deepEqual(d.personal, { pedidos: 3, monto: 373 });
  assert.deepEqual(d.productos, { piezas: 64, suma: 7736 });
  const venta = new Set(pedidos.filter((p) => p.fecha === "2026-09-25" && cuentaComoVenta(p)).map((p) => p.dodo_id));
  const lineas = productos.filter((x) => venta.has(x.pedido_id));
  assert.equal(lineas.length, 64);
  assert.equal(lineas.reduce((s, x) => s + x.precio_sin_descuento, 0), 8832);
});

test("semana: comidas del personal y cancelados", () => {
  const dias = resumirDias(pedidos, productos);
  assert.equal(dias.length, 8);
  assert.equal(dias.reduce((s, d) => s + d.personal.pedidos, 0), 29);
  assert.equal(dias.reduce((s, d) => s + d.personal.monto, 0), 3681);
  assert.equal(dias.reduce((s, d) => s + d.cancelados.pedidos, 0), 9);
});

test("IVA por producto redondeado", () => {
  assert.equal(ivaDe([129, 95.5]), 30.96); // 17.79 + 13.17
  assert.equal(ivaDe([]), 0);
});

test("tiposDesglose: servicio y origen", () => {
  assert.deepEqual(tiposDesglose({ tipo: "entrega", origen: "app" }), ["entrega", "app"]);
  assert.deepEqual(tiposDesglose({ tipo: "en_tienda", origen: "sitio" }), ["llevadera", "sitio"]);
  assert.deepEqual(tiposDesglose({ tipo: "en_tienda", origen: "kiosco" }), ["restaurante"]);
  assert.deepEqual(tiposDesglose({ tipo: "en_tienda", origen: "mostrador", agregador: "Rappi" }), ["restaurante", "agregador"]);
});

test("venta por hora: la celda pico y el rango de horas", () => {
  const r = ventaPorHora(pedidos);
  assert.equal(r.horaMin, 11);
  assert.equal(r.horaMax, 22);
  assert.equal(r.celdas.reduce((s, c) => s + c.pedidos, 0), 296);
  assert.ok(r.pico && r.celdas.every((c) => c.total <= r.pico!.total));
  assert.equal(diaSemana("2026-09-28"), 1);
  assert.equal(diaSemana("2026-09-27"), 7);
});

test("canales de la semana", () => {
  const r = canales(pedidos);
  assert.deepEqual(r.canales.map((c) => c.canal).sort(), ["app", "entrega", "kiosco", "mostrador"]);
  assert.equal(r.canales.reduce((s, c) => s + c.pedidos, 0), 296);
  assert.ok(r.paraLlevar! > 0 && r.paraLlevar! < 1);
});

test("personal y cancelados de la semana", () => {
  const r = personalYCancelados(pedidos, productos);
  assert.equal(r.personal.pedidos, 29);
  assert.equal(r.personal.monto, 3681);
  assert.equal(r.cancelados.pedidos, 9);
  assert.equal(r.cancelados.lista.length, 9);
  assert.ok(r.cancelados.lista.every((c) => c.productos.length > 0));
  assert.equal(r.alerta, 9 / 334 > 0.03);
});

test("tiempos de cocina y entrega de la semana", () => {
  const r = tiempos(pedidos);
  assert.equal(r.medianaCocina, 11);
  assert.equal(r.medianaEntrega, 13);
  assert.equal(r.lentos, 56);
  assert.equal(r.sinTiempo, 0);
  assert.equal(r.masLentos.length, 5);
  assert.ok(r.masLentos[0].minutos >= r.masLentos[4].minutos);
});

test("combos vendidos en pedidos con venta", () => {
  const r = combos(pedidos, productos);
  assert.deepEqual(r.map((c) => [c.combo, c.vendidos, c.productos]), [
    ["El de Siempre", 8, 16], ["Solo Dodo", 7, 14], ["Trío Ganador", 4, 12], ["Supremo", 3, 6], ["Especial del Antojo", 1, 3],
  ]);
});

test("archivo equivocado o incompleto", () => {
  assert.throws(() => extraerDatosBrutos(leer("ventas-2026-09-25.xlsx")), { message: NO_ES_DATOS_BRUTOS });
  assert.throws(() => extraerDatosBrutos([hojas[0]]), { message: NO_ES_DATOS_BRUTOS });
  const sinEncabezado = con("RawData", { A1: null });
  assert.throws(() => extraerDatosBrutos(sinEncabezado), { message: NO_ES_DATOS_BRUTOS });
});

test("archivo sin pedidos", () => {
  const raw = hojas[0];
  const soloEncabezado: Hoja = { nombre: raw.nombre, celdas: new Map([...raw.celdas].filter(([r]) => /^[A-Z]+1$/.test(r))) };
  assert.throws(() => extraerDatosBrutos([soloEncabezado, hojas[1]]), { message: SIN_PEDIDOS });
});

test("hojas que no coinciden", () => {
  // Un producto de un pedido que no existe.
  assert.throws(() => extraerDatosBrutos(con("OrderPositions", { A2: "NO-EXISTE" })), { message: HOJAS_NO_COINCIDEN });
});

test("archivo de más de 92 días", () => {
  assert.throws(() => extraerDatosBrutos(con("RawData", { E2: "01.01.2026" })), /más de 92 días/);
});

test("mensajeAlGuardar: si Supabase corta por tiempo, pide importar por semanas; lo demás pasa igual", () => {
  assert.equal(mensajeAlGuardar("canceling statement due to statement timeout"), ARCHIVO_MUY_GRANDE);
  assert.match(ARCHIVO_MUY_GRANDE, /por semanas/);
  assert.equal(mensajeAlGuardar("Estos días ya se importaron: 2026-09-25."), "Estos días ya se importaron: 2026-09-25.");
});
