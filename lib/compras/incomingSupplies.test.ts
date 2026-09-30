import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerHojas, type Hoja } from "../ventas/xlsx.ts";
import { leerIncomingSupplies, NO_ES_INCOMING } from "./incomingSupplies.ts";

const archivo = leerHojas(readFileSync(new URL("./__fixtures__/incoming-supplies-2026-09-22.xlsx", import.meta.url)));
const ZAPOPAN = { id: "suc-1", nombre: "Zapopan-1" };

test("archivo real: una recepción por insumo y día con cantidad", () => {
  const r = leerIncomingSupplies(archivo, [ZAPOPAN]);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.recepciones, [
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19E428E07ED76A14AF6DA798EFC40", material: "Gajos de papa", unidad: "kg", fecha: "2026-09-24", cantidad: 13.62, precio: 58.5 },
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19E418E07ED76A14AF6DA8111DB50", material: "Papas francesas", unidad: "kg", fecha: "2026-09-24", cantidad: 10, precio: 46.5 },
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19A2E8EBB9F693A4A16E21FDBFD00", material: "Pollo", unidad: "kg", fecha: "2026-09-24", cantidad: 12, precio: 68 },
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19A748FD4D3A5DE4CA44F145562A0", material: "Salsa BBQ", unidad: "kg", fecha: "2026-09-28", cantidad: 17.2, precio: 46.77 },
  ]);
  assert.equal(r.dias.length, 7);
  assert.deepEqual(r.dias[0], { sucursal_id: "suc-1", fecha: "2026-09-22" });
  assert.deepEqual(r.dias[6], { sucursal_id: "suc-1", fecha: "2026-09-28" });
});

test("hoja de una sucursal que no existe en la app", () => {
  const r = leerIncomingSupplies(archivo, [{ id: "x", nombre: "Guadalajara-2" }]);
  assert.deepEqual(r.errores, ["La hoja \"Zapopan-1\" no corresponde a ninguna sucursal de la app."]);
  assert.deepEqual(r.recepciones, []);
});

test("un archivo que no es Incoming supplies", () => {
  const hoja: Hoja = { nombre: "Hoja1", celdas: new Map([["A1", "Razón social"], ["B1", "RFC"]]) };
  assert.deepEqual(leerIncomingSupplies([hoja], [ZAPOPAN]).errores, [NO_ES_INCOMING]);
});
