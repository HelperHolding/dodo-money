import { test } from "node:test";
import assert from "node:assert/strict";
import { esRegalado, separarRegalados } from "./regalados.ts";

const S = "suc-1";
const venta = (dodo_id: number, nombre: string, cantidad: number, importe: number, importe_sin_descuento: number, fecha = "2026-11-10") =>
  ({ sucursal_id: S, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento });
const pedido = (dodo_id: string, total: number, total_sin_descuento: number, promocion: string | null = "Promo 100%", fecha = "2026-11-10") =>
  ({ dodo_id, sucursal_id: S, fecha, hora: "13:05", total, total_sin_descuento, promocion });
const pieza = (pedido_id: string, dodo_id: number, nombre: string, precio_sin_descuento: number) =>
  ({ pedido_id, dodo_id, nombre, precio: 0, precio_sin_descuento });

test("regalado: total en $0 con precio de lista; un descuento parcial o un pedido sin precio no lo son", () => {
  assert.equal(esRegalado(pedido("A", 0, 2865)), true);
  assert.equal(esRegalado(pedido("B", 100, 2865)), false);
  assert.equal(esRegalado(pedido("C", 0, 0)), false);
});

test("las piezas regaladas salen de la venta por producto y quedan aparte, agrupadas por producto", () => {
  const ventas = [venta(1, "Pepperoni", 10, 1600, 1900), venta(2, "Hawaiana", 3, 0, 573), venta(3, "Coca", 4, 236, 236)];
  const pedidos = [pedido("A", 0, 955), pedido("B", 150, 191, "Pepperoni a 119")];
  const piezas = [pieza("A", 1, "Pepperoni", 191), pieza("A", 1, "Pepperoni", 191), pieza("A", 2, "Hawaiana", 191),
    pieza("A", 2, "Hawaiana", 191), pieza("A", 2, "Hawaiana", 191), pieza("B", 1, "Pepperoni", 191)];
  const r = separarRegalados(ventas, pedidos, piezas);
  assert.deepEqual(r.ventas, [venta(1, "Pepperoni", 8, 1600, 1518), venta(3, "Coca", 4, 236, 236)]);
  assert.deepEqual(r.regalados.map((p) => [p.dodo_id, p.piezas, p.precioLista, p.promocion]), [["A", 5, 955, "Promo 100%"]]);
  assert.deepEqual(r.regalados[0].renglones, [venta(1, "Pepperoni", 2, 0, 382), venta(2, "Hawaiana", 3, 0, 573)]);
});

test("sin pedidos regalados la venta queda igual", () => {
  const ventas = [venta(1, "Pepperoni", 2, 300, 382)];
  const r = separarRegalados(ventas, [pedido("B", 150, 191)], [pieza("B", 1, "Pepperoni", 191)]);
  assert.deepEqual(r.ventas, ventas);
  assert.deepEqual(r.regalados, []);
});

test("si la venta del día no alcanza a cubrir las piezas del pedido, el pedido no se separa", () => {
  // Día importado por otra fuente (Excel de productos) que no trae ese producto: no se puede restar sin inventar venta negativa.
  const ventas = [venta(1, "Pepperoni", 1, 0, 191)];
  const r = separarRegalados(ventas, [pedido("A", 0, 382)], [pieza("A", 1, "Pepperoni", 191), pieza("A", 1, "Pepperoni", 191)]);
  assert.deepEqual(r.ventas, ventas);
  assert.deepEqual(r.regalados, []);
  assert.deepEqual(r.sinCuadrar, ["A"]);
});
