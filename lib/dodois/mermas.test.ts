import { test } from "node:test";
import assert from "node:assert/strict";
import { costoDesdeCatalogo, esMarketing, precioDesdeRecepciones, precioMasaBOM, traducirMermas, ventanaMermas, type MermaInsumoApi, type MermaProductoApi } from "./mermas.ts";

// BOM mínimo: la masa cuesta por kg y cada receta pide una bola con su peso en gramos (como UC Mexico).
const material = (nombre: string, gramos: number) => ({ nombre, cantidad: gramos, unidad: "g" as const, precio: 14.56, importe: null, porciones: null, medida: `${gramos} × Gram`, referencia: "" });
const receta = (nombre: string, materiales: ReturnType<typeof material>[]) => ({ clave: nombre, nombre, hoja: "h", referencia: "", categoria: "pizza" as const, tamano: null, precioVenta: null, costo: null, materiales, avisos: [] });
const insumoBOM = (nombre: string, precio: number | null, unidad: "kg" | "pieza" | null = "kg") => ({ nombre, precio, unidad, medida: "", merma: null, referencia: "", avisos: [] });
const versionBOM = (vigente_desde: string, precioMasa = 14.56) => ({
  id: vigente_desde, vigente_desde, archivo: "UC Mexico.xlsx", actualizado_en: vigente_desde,
  modelo: {
    insumos: [insumoBOM("Dough 25 (Masa 25)", precioMasa), insumoBOM("Dough 35 (Masa 35)", precioMasa), insumoBOM("Dough 30 (Masa 30)", precioMasa), insumoBOM("Chimichurri", 113.71)],
    recetas: [
      receta("Pepperoni 25", [material("Dough 25 (Masa 25)", 235), material("Chimichurri", 20)]),
      receta("Rolls", [material("Dough 25 (Masa 25)", 235)]),
      receta("Pepperoni 35", [material("Dough 35 (Masa 35)", 460)]),
      // Dos pesos distintos para la misma masa: no se adivina cuál es.
      receta("Margherita 30", [material("Dough 30 (Masa 30)", 345)]), receta("Otra 30", [material("Dough 30 (Masa 30)", 330)]),
    ],
    preparaciones: [], avisos: [],
  },
});

test("masa por pieza: peso de la bola en el BOM × precio por kg de la versión vigente", () => {
  const precio = precioMasaBOM([versionBOM("2026-10-01"), versionBOM("2026-11-20", 20)]);
  assert.equal(precio("Masa 25", "Quantity", "2026-11-18"), 3.4216); // 0.235 kg × $14.56
  assert.equal(precio("Masa 35", "Quantity", "2026-11-18"), 6.6976);
  assert.equal(precio("Masa 35", "Quantity", "2026-11-22"), 9.2); // versión del 20-nov
  assert.equal(precio("Masa 30", "Quantity", "2026-11-18"), null); // peso ambiguo
  assert.equal(precio("Chimichurri", "Kilogram", "2026-11-18"), null); // solo masas
  assert.equal(precio("Masa 25", "Kilogram", "2026-11-18"), null); // solo bajas por pieza
  assert.equal(precio("Masa 25", "Quantity", "2026-09-30"), null); // sin versión vigente
});

test("mermas API: la masa sin precio de recepción toma el precio por pieza del BOM", () => {
  const masa25: MermaInsumoApi = { unitId: "11f187558e757f53b0570d952420b810", writtenOffAtLocal: "2026-11-18T22:00:00", reason: "Expired",
    stockItemId: "11f1956cbf1369fb0acc2ceb65811140", stockItemName: "Masa 25", quantity: 24, measurementUnit: "Quantity" };
  const r = traducirMermas({ sucursalId: "s", unitId: masa25.unitId, desde: "2026-11-18", hasta: "2026-11-18", productos: [], insumos: [masa25],
    precio: () => null, precioRespaldo: precioMasaBOM([versionBOM("2026-10-01")]) });
  assert.deepEqual([r.filas[0].costo, r.filas[0].sin_costo], [82.12, false]); // 24 × $3.4216
  const sinBOM = traducirMermas({ sucursalId: "s", unitId: masa25.unitId, desde: "2026-11-18", hasta: "2026-11-18", productos: [], insumos: [masa25], precio: () => null });
  assert.deepEqual([sinBOM.filas[0].costo, sinBOM.filas[0].sin_costo], [0, true]);
});

const UNIDAD = "11f187558e757f53b0570d952420b810";
const MASA = "11f1956cbf1369fb0acc2ceb65811140", SALSA = "11f1956ebe2fa94298e49ab1e6fe1b30", MOZZA = "11f187589c9da51d27da591f2ff6a0c0";

// Muestras reales de /accounting/write-offs/products y /stock-items de Zapopan-1 (octubre y noviembre 2026).
const pepperoni: MermaProductoApi = {
  writeOffListId: "01a14d716cca70b1892c48e9c876ed86", unitId: UNIDAD, unitName: "Zapopan-1", writtenOffAtLocal: "2026-10-17T23:16:00",
  reason: "Expired", productId: "11f19a7cb994633d4155f5f686085030", productName: "Doble Pepperoni Grande", quantity: 2, pricePerPiece: 239,
  stockItems: [
    { id: MASA, name: "Masa 35", quantity: 2, measurementUnit: "Quantity" },
    { id: SALSA, name: "Salsa para pizza", quantity: 0.179, measurementUnit: "Kilogram" },
    { id: MOZZA, name: "Mozzarella", quantity: 0.322, measurementUnit: "Kilogram" },
  ],
  writtenOffAt: "2026-10-17T23:16:00",
};
const masaVencida: MermaInsumoApi = {
  unitId: UNIDAD, unitName: "Zapopan-1", writtenOffAtLocal: "2026-10-17T23:16:00", reason: "Expired",
  stockItemId: MASA, stockItemName: "Masa 35", quantity: 5, measurementUnit: "Quantity", writtenOffAt: "2026-10-17T23:16:00",
};
const PRECIOS: Record<string, number> = { [MASA.toUpperCase()]: 7.5, [SALSA.toUpperCase()]: 60, [MOZZA.toUpperCase()]: 158.33 };
const precio = (id: string) => PRECIOS[id.toUpperCase()] ?? null;
const base = { sucursalId: "s", unitId: UNIDAD, desde: "2026-10-16", hasta: "2026-10-18", precio };

test("mermas API: cada día del rango queda completo aunque no tenga bajas", () => {
  const r = traducirMermas({ ...base, productos: [], insumos: [] });
  assert.deepEqual(r.dias, ["2026-10-16", "2026-10-17", "2026-10-18"].map((fecha) => ({ sucursal_id: "s", fecha, productos_completos: true })));
  assert.deepEqual(r.filas, []);
});

test("mermas API: producto con costo de su receta real (cantidades ya totales) y clave por nombre como el Excel", () => {
  const [p] = traducirMermas({ ...base, productos: [pepperoni], insumos: [] }).filas;
  assert.deepEqual(p, {
    sucursal_id: "s", fecha: "2026-10-17", tipo: "producto", clave: "doble pepperoni grande", nombre: "Doble Pepperoni Grande",
    unidad: "piezas", categoria: "Producto terminado", cantidad: 2,
    // 2 × 7.5 + 0.179 × 60 + 0.322 × 158.33 = 15 + 10.74 + 50.98
    costo: 76.72, sin_costo: false,
  });
});

test("mermas API: insumo suelto con su precio de recepción; las bajas del mismo insumo y día se suman", () => {
  const filas = traducirMermas({ ...base, productos: [], insumos: [masaVencida, { ...masaVencida, quantity: 1, reason: "Defected" }] }).filas;
  assert.equal(filas.length, 1);
  assert.deepEqual(filas[0], {
    sucursal_id: "s", fecha: "2026-10-17", tipo: "insumo", clave: MASA.toUpperCase(), nombre: "Masa 35", unidad: "pza",
    categoria: "Insumo", cantidad: 6, costo: 45, sin_costo: false,
  });
});

test("mermas API: sin precio de algún insumo queda sin costo (pendiente), no en cero", () => {
  const sinPrecio = { ...base, precio: (id: string) => (id.toUpperCase() === MOZZA.toUpperCase() ? null : precio(id)) };
  const r = traducirMermas({ ...sinPrecio, productos: [pepperoni], insumos: [{ ...masaVencida, stockItemId: MOZZA, stockItemName: "Mozzarella", measurementUnit: "Kilogram", quantity: 0.5 }] });
  assert.ok(r.filas.every((f) => f.sin_costo));
});

// Costo teórico del catálogo (receta + periférico, sin IVA) por pieza: el mismo que usa el P&L para Alimento.
const catalogo = costoDesdeCatalogo(
  [{ dodo_uuid: pepperoni.productId.toUpperCase(), dodo_id: 81 }],
  [{ dodo_id: 81, costo: 52.4, vigente_desde: "2026-10-01" }, { dodo_id: 81, costo: 55, vigente_desde: "2026-10-18" }],
);

test("mermas API: si falta el precio de algún insumo, el producto toma el costo del catálogo vigente a la fecha", () => {
  const sinPrecio = { ...base, precio: (id: string) => (id.toUpperCase() === MASA.toUpperCase() ? null : precio(id)), costoProducto: catalogo };
  const [p] = traducirMermas({ ...sinPrecio, productos: [pepperoni], insumos: [] }).filas;
  // 2 piezas × $52.40 (vigente el 17-oct; el de $55 entra el 18-oct).
  assert.equal(p.costo, 104.8);
  assert.equal(p.sin_costo, false);
  const mkt = traducirMermas({ ...sinPrecio, productos: [{ ...pepperoni, reason: "Marketing", quantity: 1, writtenOffAtLocal: "2026-10-18T12:00:00" }], insumos: [] }).filas[0];
  assert.deepEqual([mkt.clave, mkt.costo, mkt.sin_costo], ["marketing:doble pepperoni grande", 55, false]);
});

test("mermas API: con todos los precios de recepción no usa el catálogo; sin catálogo ni precio queda pendiente", () => {
  const [conPrecios] = traducirMermas({ ...base, costoProducto: catalogo, productos: [pepperoni], insumos: [] }).filas;
  assert.equal(conPrecios.costo, 76.72);
  const sinNada = { ...base, precio: () => null, costoProducto: costoDesdeCatalogo([], []) };
  const [p] = traducirMermas({ ...sinNada, productos: [pepperoni], insumos: [] }).filas;
  assert.deepEqual([p.costo, p.sin_costo], [0, true]);
  // Antes de que exista un costo vigente tampoco se inventa.
  assert.equal(catalogo(pepperoni.productId, "2026-09-30"), null);
  assert.equal(catalogo("otro", "2026-10-17"), null);
});

test("mermas API: razón Marketing va aparte (clave marketing:) para que el P&L la mande a Marketing", () => {
  const filas = traducirMermas({ ...base, productos: [pepperoni, { ...pepperoni, reason: "Marketing", quantity: 1, stockItems: [{ id: MASA, name: "Masa 35", quantity: 1, measurementUnit: "Quantity" }] }], insumos: [] }).filas;
  const mkt = filas.find((f) => esMarketing(f.clave))!;
  assert.equal(filas.length, 2);
  assert.equal(mkt.clave, "marketing:doble pepperoni grande");
  assert.equal(mkt.categoria, "Marketing");
  assert.equal(mkt.costo, 7.5);
  assert.ok(!esMarketing(filas.find((f) => f !== mkt)!.clave));
});

test("mermas API: ignora otras unidades, fechas fuera del rango y cantidades en cero", () => {
  const r = traducirMermas({
    ...base,
    productos: [{ ...pepperoni, unitId: "otra" }, { ...pepperoni, writtenOffAtLocal: "2026-10-19T01:00:00" }, { ...pepperoni, quantity: 0 }],
    insumos: [{ ...masaVencida, writtenOffAtLocal: "2026-10-15T23:00:00" }, { ...masaVencida, quantity: 0 }],
  });
  assert.deepEqual(r.filas, []);
});

test("precio de recepción: el último recibido hasta esa fecha en la sucursal; si no hay, el último de cualquier sucursal", () => {
  const precioDe = precioDesdeRecepciones([
    { sucursal_id: "s", dodo_insumo_id: MASA.toUpperCase(), fecha: "2026-10-01", precio: 7 },
    { sucursal_id: "s", dodo_insumo_id: MASA.toUpperCase(), fecha: "2026-10-10", precio: 7.5 },
    { sucursal_id: "s", dodo_insumo_id: MASA.toUpperCase(), fecha: "2026-10-20", precio: 8 },
    { sucursal_id: "otra", dodo_insumo_id: SALSA.toUpperCase(), fecha: "2026-10-05", precio: 60 },
  ], "s");
  assert.equal(precioDe(MASA, "2026-10-17"), 7.5);
  assert.equal(precioDe(MASA.toLowerCase(), "2026-10-25"), 8);
  // Antes de la primera recepción usa la primera conocida.
  assert.equal(precioDe(MASA, "2026-09-30"), 7);
  assert.equal(precioDe(SALSA, "2026-10-17"), 60);
  assert.equal(precioDe("no-existe", "2026-10-17"), null);
});

test("ventana de mermas: cron últimos 3 días hasta hoy; a mano el rango pedido, máximo 31 días", () => {
  assert.deepEqual(ventanaMermas("2026-11-17"), { desde: "2026-11-15", hasta: "2026-11-17" });
  assert.deepEqual(ventanaMermas("2026-11-17", "2026-11-01", "2026-11-16"), { desde: "2026-11-01", hasta: "2026-11-16" });
  assert.deepEqual(ventanaMermas("2026-11-17", "2026-11-10", "2026-11-30"), { desde: "2026-11-10", hasta: "2026-11-17" });
  assert.equal(ventanaMermas("2026-11-17", "2026-09-01", "2026-11-16"), null);
  assert.equal(ventanaMermas("2026-11-17", "2026-11-16", "2026-11-10"), null);
});
