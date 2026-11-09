import { test } from "node:test";
import assert from "node:assert/strict";
import { documentosDuplicados, type DocumentoCuenta } from "./duplicados.ts";

const doc = (documento: string, cuentas: (string | null)[], extra: Partial<DocumentoCuenta> = {}): DocumentoCuenta =>
  ({ id: documento, documento, proveedorId: "p1", proveedor: "ARRENDADOR", estado: "pagada", tipo: "ingreso", cuentas, ...extra });

test("tres documentos de renta del mismo proveedor: un grupo con los tres", () => {
  const g = documentosDuplicados([
    doc("Renta y Agua Octubre", ["renta", "servicios"]), doc("RA-675", ["renta", "renta"]), doc("RA-676", ["renta"]),
  ]);
  assert.deepEqual(g, [{ cuenta: "renta", proveedor: "ARRENDADOR", documentos: ["Renta y Agua Octubre", "RA-675", "RA-676"] }]);
});

test("cuentas distintas, otro proveedor o un solo documento: sin aviso", () => {
  assert.deepEqual(documentosDuplicados([doc("A", ["renta"]), doc("B", ["servicios"])]), []);
  assert.deepEqual(documentosDuplicados([doc("A", ["renta"]), doc("B", ["renta"], { proveedorId: "p2" })]), []);
  assert.deepEqual(documentosDuplicados([doc("A", ["renta", "renta"])]), []);
});

test("no cuentan canceladas, notas de crédito, insumos, inversiones ni conceptos sin cuenta", () => {
  assert.deepEqual(documentosDuplicados([doc("A", ["renta"]), doc("B", ["renta"], { estado: "cancelada" })]), []);
  assert.deepEqual(documentosDuplicados([doc("A", ["renta"]), doc("NC", ["renta"], { tipo: "egreso" })]), []);
  assert.deepEqual(documentosDuplicados([doc("A", ["insumos"]), doc("B", ["insumos"])]), []);
  assert.deepEqual(documentosDuplicados([doc("A", ["inversiones"]), doc("B", ["inversiones"])]), []);
  assert.deepEqual(documentosDuplicados([doc("A", [null]), doc("B", [null])]), []);
});

test("sin proveedor registrado se agrupa por nombre del emisor", () => {
  const g = documentosDuplicados([doc("A", ["servicios"], { proveedorId: null, proveedor: "CFE" }), doc("B", ["servicios"], { proveedorId: null, proveedor: "CFE" })]);
  assert.deepEqual(g.map((x) => x.documentos), [["A", "B"]]);
});
