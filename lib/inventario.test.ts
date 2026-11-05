import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorCategoria, cantidadTexto, cantidadValida, filtrarExistencias, ordenarArticulos, porAcabarse, traducirExistencias,
  type ExistenciaApi,
} from "./inventario.ts";

const U1 = "11f187558e757f53b0570d952420b810", U2 = "fe2fb5ee39b3865d11f0d67bada55b89";
const base: ExistenciaApi = {
  id: "2a69836ab8f583ec11ed90098ae24dff", name: "Queso mozzarella", unitId: U1, categoryName: "Ingredient", quantity: 12.3456,
  measurementUnit: "Kilogram", balanceInMoney: 1234.567, currency: "MXN", avgWeekdayExpense: 3, avgWeekendExpense: 10,
  daysUntilBalanceRunsOut: 2, calculatedAt: "2026-11-05T10:15:00.00000", isConfirmed: false,
};
const suc = new Map([[U1.toUpperCase(), "s1"]]);

test("existencias: traduce unidades, categoría, consumo y redondeos; ignora unidades ajenas", () => {
  const [e, ...resto] = traducirExistencias([base, { ...base, unitId: U2 }], suc);
  assert.equal(resto.length, 0);
  assert.deepEqual(e, {
    insumoId: "2A69836AB8F583EC11ED90098AE24DFF", nombre: "Queso mozzarella", sucursalId: "s1", categoria: "Ingredient",
    cantidad: 12.346, unidad: "kg", valor: 1234.57, consumoDia: 5, dias: 2, calculado: "2026-11-05T10:15", confirmado: false,
  });
});

test("existencias: categoría desconocida va a Otros y se ordena por nombre", () => {
  const l = traducirExistencias([{ ...base, name: "Zanahoria", categoryName: "Nueva" }, { ...base, name: "Aceite", measurementUnit: "Liter", categoryName: "Packing" }], suc);
  assert.deepEqual(l.map((e) => [e.nombre, e.categoria, e.unidad]), [["Aceite", "Packing", "l"], ["Zanahoria", "Otro", "kg"]]);
  assert.deepEqual(agruparPorCategoria(l).map((g) => g.nombre), ["Empaque", "Otros"]);
});

test("existencias: por acabarse solo si se consume y quedan pocos días", () => {
  assert.equal(porAcabarse({ dias: 2, consumoDia: 1 }), true);
  assert.equal(porAcabarse({ dias: 3, consumoDia: 1 }), false);
  assert.equal(porAcabarse({ dias: 0, consumoDia: 0 }), false);
});

test("existencias: filtros por sucursal, categoría, texto y alerta", () => {
  const l = traducirExistencias([base, { ...base, id: "a".repeat(32), name: "Caja 30", categoryName: "Packing", daysUntilBalanceRunsOut: 9 }], suc);
  assert.equal(filtrarExistencias(l, { q: "caja" }).length, 1);
  assert.equal(filtrarExistencias(l, { categoria: "Ingredient" }).length, 1);
  assert.equal(filtrarExistencias(l, { alerta: true })[0].nombre, "Queso mozzarella");
  assert.equal(filtrarExistencias(l, { sucursal: "otra" }).length, 0);
  assert.equal(agruparPorCategoria(l)[0].valor, 1234.57);
});

test("inventario: cantidad capturada y texto", () => {
  assert.equal(cantidadValida(" 17 "), 17);
  assert.equal(cantidadValida("0"), 0);
  for (const t of ["-1", "1.5", "", "abc", "100001"]) assert.equal(cantidadValida(t), null);
  assert.equal(cantidadTexto(12.5, "kg"), "12.5 kg");
  assert.equal(cantidadTexto(3, ""), "3");
});

test("inventario: uniformes ordenados por prenda y talla", () => {
  const l = ordenarArticulos([
    { sku: "DOD-UNI-011", nombre: "PLAYERA GRIS CUELLO MAO XG DODO" }, { sku: "DOD-UNI-001", nombre: "MANDIL DODO" },
    { sku: "DOD-UNI-008", nombre: "PLAYERA GRIS CUELLO MAO CH DODO" }, { sku: "DOD-UNI-010", nombre: "PLAYERA GRIS CUELLO MAO G DODO" },
  ]);
  assert.deepEqual(l.map((a) => a.sku), ["DOD-UNI-001", "DOD-UNI-008", "DOD-UNI-010", "DOD-UNI-011"]);
});
