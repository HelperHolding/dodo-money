import { test } from "node:test";
import assert from "node:assert/strict";
import { esMarketing, precioDesdeRecepciones, traducirMermas, ventanaMermas, type MermaInsumoApi, type MermaProductoApi } from "./mermas.ts";

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
