import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaFacturasClientes } from "./excel.ts";

const F = (estado: string, total: number) => ({ creada: "2026-11-04T23:40:00Z", fecha: "2026-11-03", pedido_id: "A", rfc: "XYZ010101AB1", nombre: "C", subtotal: 330.17, iva: 52.83, total, uuid: "U", estado, serie: "F", folio: 1 });

test("una fila por factura y totales solo de timbradas", () => {
  const h = hojaFacturasClientes([F("timbrada", 383), F("cancelada", 100), F("timbrada", 116)], "2026-11");
  assert.equal(h.nombre, "Facturas 2026-11");
  assert.deepEqual(h.filas[0], ["Fecha", "Fecha del ticket", "Ticket", "RFC", "Nombre", "Subtotal", "IVA", "Total", "Folio fiscal (UUID)", "Serie y folio", "Estado"]);
  assert.equal(h.filas.length, 5);
  const ultima = h.filas[4];
  assert.equal(ultima[0], "Total timbrado");
  assert.deepEqual(ultima[7], { valor: 499, formato: "pesos" });
});

test("fecha del ticket aparte y estado error como Sin timbrar", () => {
  const h = hojaFacturasClientes([F("error", 1)], "2026-11");
  assert.deepEqual(h.filas[1][1], { fecha: "2026-11-03" });
  assert.equal(h.filas[1][10], "Sin timbrar");
});

test("fecha en hora de México", () => {
  const h = hojaFacturasClientes([{ ...F("timbrada", 1), creada: "2026-11-01T05:30:00Z" }], "2026-10");
  assert.deepEqual(h.filas[1][0], { fecha: "2026-10-31" });
});
