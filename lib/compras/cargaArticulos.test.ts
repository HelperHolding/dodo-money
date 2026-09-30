import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hoja } from "../ventas/xlsx.ts";
import { leerCargaArticulos, SIN_ARTICULOS } from "./proveedores.ts";

/** Hoja a partir de filas: la primera son los encabezados. */
function hoja(filas: (string | number | undefined)[][]): Hoja {
  const celdas = new Map<string, string | number>();
  filas.forEach((fila, r) => fila.forEach((v, c) => {
    if (v !== undefined && v !== "") celdas.set(`${String.fromCharCode(65 + c)}${r + 1}`, v);
  }));
  return { nombre: "Artículos", celdas };
}

const sinNada = { nombres: new Set<string>(), ids: new Set<string>() };
const ENC = ["Nombre", "Unidad", "Tipo", "IVA", "ID de insumo Dodo IS"];

test("lee artículos con encabezados en otro orden y etiquetas legibles", () => {
  const r = leerCargaArticulos(hoja([
    ["TIPO", "nombre", "Unidad", "Iva", "Columna rara", "ID de insumo Dodo IS"],
    ["Consumible", "Queso mozzarella", "kg", "0 %", "x", "11f19a2e8ebb9f693a4a16e21fdbfd00"],
    [],
    ["Activo fijo", "Horno", "pza", "", "", ""],
    ["otro", "Playera", "pza", "Exento"],
  ]), sinNada);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.articulos, [
    { nombre: "Queso mozzarella", unidad: "kg", tipo: "consumible", tasa_iva: "0", dodo_insumo_id: "11F19A2E8EBB9F693A4A16E21FDBFD00" },
    { nombre: "Horno", unidad: "pza", tipo: "activo_fijo", tasa_iva: "16", dodo_insumo_id: null },
    { nombre: "Playera", unidad: "pza", tipo: "otro", tasa_iva: "exento", dodo_insumo_id: null },
  ]);
});

test("IVA como número: 16, 0 y el 0.16 que guarda Excel con formato de porcentaje", () => {
  const r = leerCargaArticulos(hoja([
    ENC,
    ["A", "kg", "Consumible", 16],
    ["B", "kg", "Consumible", 0],
    ["C", "kg", "Consumible", 0.16],
    ["D", "kg", "Consumible", "16%"],
  ]), sinNada);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.articulos.map((a) => a.tasa_iva), ["16", "0", "16", "16"]);
});

test("falta una columna obligatoria", () => {
  const r = leerCargaArticulos(hoja([["Nombre", "Tipo"], ["Queso", "Consumible"]]), sinNada);
  assert.deepEqual(r.errores, ["Falta la columna \"Unidad\" en la primera fila."]);
});

test("sin renglones de datos", () => {
  assert.deepEqual(leerCargaArticulos(hoja([ENC]), sinNada).errores, [SIN_ARTICULOS]);
});

test("errores por renglón: repetidos en el archivo o ya en el catálogo, tipo e IVA inválidos; no devuelve ninguno", () => {
  const r = leerCargaArticulos(hoja([
    ENC,
    ["Queso", "kg", "Consumible", "", "11F19A2E8EBB9F693A4A16E21FDBFD00"],
    ["queso", "kg", "Consumible"],
    ["Harina", "kg", "Consumible", "", "11f19a2e8ebb9f693a4a16e21fdbfd00"],
    ["Azúcar", "kg", "Consumible"],
    ["Levadura", "kg", "Consumible", "", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
    ["Horno", "pza", "Mueble"],
    ["Sal", "kg", "Consumible", "8"],
    ["Mesa", "pza", "Activo fijo", "", "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"],
  ]), { nombres: new Set(["azúcar"]), ids: new Set(["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]) });
  assert.deepEqual(r.errores, [
    "Renglón 3: el artículo queso está repetido en el archivo (renglón 2).",
    "Renglón 4: el ID de Dodo IS 11F19A2E8EBB9F693A4A16E21FDBFD00 está repetido en el archivo (renglón 2).",
    "Renglón 5: ya hay un artículo llamado Azúcar.",
    "Renglón 6: el ID de Dodo IS AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ya está en otro artículo.",
    "Renglón 7: Tipo no reconocido: Mueble (Consumible, Activo fijo, Servicio u Otro).",
    "Renglón 8: IVA no reconocido: 8 (16, 0 o Exento).",
    "Renglón 9: Solo los consumibles llevan ID de insumo de Dodo IS.",
  ]);
  assert.equal(r.articulos.length, 0);
});
