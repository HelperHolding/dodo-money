import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hoja } from "../ventas/xlsx.ts";
import { leerCargaProveedores, SIN_RENGLONES } from "./proveedores.ts";

/** Hoja a partir de filas: la primera son los encabezados. */
function hoja(filas: (string | number | undefined)[][]): Hoja {
  const celdas = new Map<string, string | number>();
  filas.forEach((fila, r) => fila.forEach((v, c) => {
    if (v !== undefined && v !== "") celdas.set(`${String.fromCharCode(65 + c)}${r + 1}`, v);
  }));
  return { nombre: "Proveedores", celdas };
}

const ENC = ["Razón social", "RFC", "Régimen fiscal", "CLABE", "Días de crédito", "Categorías"];

test("lee proveedores con encabezados en cualquier orden, mayúsculas y acentos", () => {
  const r = leerCargaProveedores(hoja([
    ["RFC", "RÉGIMEN FISCAL", "razon social", "Columna rara", "Dias de credito"],
    ["lba-010203-ab1", "601", "Lácteos del Bajío", "x", 30],
    [],
    ["GOMJ800101AB2", "626 - RESICO", "Juan Gómez", "", ""],
  ]), new Set());
  assert.deepEqual(r.errores, []);
  assert.equal(r.proveedores.length, 2);
  assert.equal(r.proveedores[0].rfc, "LBA010203AB1");
  assert.equal(r.proveedores[0].dias_credito, 30);
  assert.equal(r.proveedores[1].regimen_fiscal, "626");
  assert.equal(r.proveedores[1].dias_credito, 0);
});

test("falta un encabezado obligatorio", () => {
  const r = leerCargaProveedores(hoja([["Razón social", "RFC"], ["X", "LBA010203AB1"]]), new Set());
  assert.deepEqual(r.errores, ["Falta la columna \"Régimen fiscal\" en la primera fila."]);
  assert.equal(r.proveedores.length, 0);
});

test("sin renglones de datos", () => {
  assert.deepEqual(leerCargaProveedores(hoja([ENC]), new Set()).errores, [SIN_RENGLONES]);
});

test("errores por renglón: inválido, repetido en el archivo y ya existente; no devuelve ninguno", () => {
  const r = leerCargaProveedores(hoja([
    ENC,
    ["A", "LBA010203AB1", "601"],
    ["B", "lba010203ab1", "601"],
    ["C", "EXI010203AB1", "601"],
    ["D", "MAL", "601"],
  ]), new Set(["EXI010203AB1"]));
  assert.deepEqual(r.errores, [
    "Renglón 3: el RFC LBA010203AB1 está repetido en el archivo (renglón 2).",
    "Renglón 4: el RFC EXI010203AB1 ya está en la cartera.",
    "Renglón 5: El RFC MAL no es válido (12 caracteres para empresa, 13 para persona física).",
  ]);
  assert.equal(r.proveedores.length, 0);
});

test("CLABE que Excel convirtió en número se rechaza pidiendo formato texto", () => {
  const r = leerCargaProveedores(hoja([ENC, ["A", "LBA010203AB1", "601", 32180000118359720]]), new Set());
  assert.deepEqual(r.errores, ["Renglón 2: la CLABE llegó como número y Excel pudo cambiarla; dale formato de texto a esa columna."]);
});
