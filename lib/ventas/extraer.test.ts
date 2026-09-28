import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fechaDeSerial, leerPrimeraHoja, NO_ES_XLSX, type Hoja } from "./xlsx.ts";
import { buscarSucursal, extraerProductos, extraerVentas, limpiarTexto, necesitaConfirmacion, NO_ES_PRODUCTOS, NO_ES_VENTAS, revisarPar, SIN_DESCUENTOS, VARIOS_DIAS } from "./extraer.ts";

const fixture = (nombre: string) => leerPrimeraHoja(readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url)));
const ventas = fixture("ventas-2026-09-25.xlsx");
const productos = fixture("productos-2026-09-25.xlsx");

/** Copia de una hoja con algunas celdas cambiadas. */
const con = (h: Hoja, cambios: Record<string, string | number>): Hoja => ({ nombre: h.nombre, celdas: new Map([...h.celdas, ...Object.entries(cambios)]) });

test("lee la primera hoja de los dos archivos reales", () => {
  assert.equal(ventas.nombre, "Ventas");
  assert.equal(productos.nombre, "Precios locales");
  assert.equal(ventas.celdas.get("D2"), "Zapopan-1");
  assert.equal(ventas.celdas.get("G10"), 1066.97);
});

test("fechaDeSerial convierte el serial de Excel", () => {
  assert.equal(fechaDeSerial(46290), "2026-09-25");
  assert.equal(fechaDeSerial(46290.9083), "2026-09-25");
});

test("un archivo que no es xlsx se rechaza con un mensaje claro", () => {
  assert.throws(() => leerPrimeraHoja(new TextEncoder().encode("hola")), /no es un Excel/);
});

test("extraerVentas: resumen, desglose y m² del 25/09/2026", () => {
  const v = extraerVentas(ventas);
  assert.equal(v.sucursal, "Zapopan-1");
  assert.equal(v.fecha, "2026-09-25");
  assert.deepEqual(v.resumen, { pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97, venta_m2: 126.8 });
  assert.equal(v.desglose.length, 7);
  assert.deepEqual(v.desglose.find((d) => d.tipo === "restaurante"), { tipo: "restaurante", pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97 });
  assert.deepEqual(v.desglose.map((d) => d.tipo), ["entrega", "llevadera", "restaurante", "centro_llamadas", "sitio", "app", "agregador"]);
});

test("extraerProductos: 31 productos y nombres limpios", () => {
  const p = extraerProductos(productos);
  assert.equal(p.sucursal, "Zapopan-1");
  assert.equal(p.fecha, "2026-09-25");
  assert.equal(p.productos.length, 31);
  assert.deepEqual(p.productos[0], { dodo_id: 27, nombre: "Margarita Mediano", cantidad: 1, importe: 143.4, importe_sin_descuento: 169 });
  assert.equal(p.productos.find((x) => x.dodo_id === 200)?.nombre, "Papas Gajo Medium");
  assert.equal(p.productos.reduce((s, x) => s + x.cantidad, 0), 64);
});

test("el par del 25/09/2026 cuadra", () => {
  assert.deepEqual(revisarPar(extraerVentas(ventas), extraerProductos(productos)), { sumaProductos: 7736, diferencia: 0, cuadra: true });
});

test("archivos cruzados o equivocados se rechazan", () => {
  assert.throws(() => extraerVentas(productos), { message: NO_ES_VENTAS });
  assert.throws(() => extraerProductos(ventas), { message: NO_ES_PRODUCTOS });
});

test("un periodo de varios días se rechaza", () => {
  assert.throws(() => extraerVentas(con(ventas, { D3: "25/09/2026 12:00:00 a.m. - 26/09/2026 11:59:00 p.m." })), { message: VARIOS_DIAS });
  assert.throws(() => extraerProductos(con(productos, { B4: "25/09/2026 12:00:00 a.m.-27/09/2026 11:59:00 p.m." })), { message: VARIOS_DIAS });
  // Dos renglones de fecha en la tabla por día, aunque el periodo diga un día.
  assert.throws(() => extraerVentas(con(ventas, { A20: "Zapopan-1", B20: 46291, A21: "Zapopan-1", B21: "Total" })), { message: VARIOS_DIAS });
});

test("reporte de productos sin descuentos se rechaza", () => {
  assert.throws(() => extraerProductos(con(productos, { B9: "Sin descuentos" })), { message: SIN_DESCUENTOS });
});

test("un producto repetido se suma en un renglón", () => {
  const p = extraerProductos(con(productos, { A60: 46290.5, B60: 27, C60: "Margarita  Mediano", D60: 2, E60: 300, F60: 338 }));
  assert.equal(p.productos.length, 31);
  assert.deepEqual(p.productos.find((x) => x.dodo_id === 27), { dodo_id: 27, nombre: "Margarita Mediano", cantidad: 3, importe: 443.4, importe_sin_descuento: 507 });
});

test("revisarPar: sucursal o fecha distinta y descuadre", () => {
  const v = extraerVentas(ventas);
  const p = extraerProductos(productos);
  assert.throws(() => revisarPar(v, { ...p, sucursal: "Zapopan-2" }), /Ventas es de Zapopan-1 y el de Productos de Zapopan-2/);
  assert.throws(() => revisarPar(v, { ...p, fecha: "2026-09-26" }), /del 25 de septiembre y el de Productos del 26 de septiembre/);
  const r = revisarPar({ ...v, resumen: { ...v.resumen, total: 7856 } }, p);
  assert.deepEqual(r, { sumaProductos: 7736, diferencia: 120, cuadra: false });
});

test("limpiarTexto quita espacios dobles y sobrantes", () => {
  assert.equal(limpiarTexto("  Papas Gajo  Medium "), "Papas Gajo Medium");
});

test("un xlsx truncado o dañado se rechaza con el mismo mensaje", () => {
  const datos = readFileSync(new URL("./__fixtures__/ventas-2026-09-25.xlsx", import.meta.url));
  assert.throws(() => leerPrimeraHoja(datos.subarray(0, 3000)), { message: NO_ES_XLSX });
  const roto = Buffer.from(datos);
  roto.fill(0, 200, 1200);
  assert.throws(() => leerPrimeraHoja(roto), { message: NO_ES_XLSX });
});

test("un día sin ventas trae productos vacíos y cuadra en cero", () => {
  const celdas = new Map([...productos.celdas].filter(([ref]) => Number(ref.replace(/^[A-Z]+/, "")) <= 12));
  const p = extraerProductos({ nombre: productos.nombre, celdas });
  assert.deepEqual(p.productos, []);
  const v = extraerVentas(ventas);
  assert.deepEqual(revisarPar({ ...v, resumen: { ...v.resumen, total: 0 } }, p), { sumaProductos: 0, diferencia: 0, cuadra: true });
});

test("buscarSucursal ignora mayúsculas y espacios repetidos, no guiones", () => {
  const sucursales = [{ id: "1", nombre: "Zapopan-1" }, { id: "2", nombre: "Guadalajara Centro" }];
  assert.equal(buscarSucursal("zapopan-1", sucursales)?.id, "1");
  assert.equal(buscarSucursal(" Guadalajara  centro ", sucursales)?.id, "2");
  assert.equal(buscarSucursal("Zapopan 1", sucursales), null);
});

test("necesitaConfirmacion", () => {
  assert.equal(necesitaConfirmacion({ cuadra: true, yaImportado: false }), false);
  assert.equal(necesitaConfirmacion({ cuadra: false, yaImportado: false }), true);
  assert.equal(necesitaConfirmacion({ cuadra: true, yaImportado: true }), true);
});
