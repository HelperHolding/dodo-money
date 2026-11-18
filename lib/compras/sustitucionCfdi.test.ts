import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoComplementos, avisoRelacion, diferenciasImportes, MAX_ARCHIVO, revisarArchivos } from "./sustitucionCfdi.ts";

test("sustitución CFDI: mismos importes no muestran diferencias; un cambio de total sí", () => {
  const reg = { subtotal: 751, descuento: 0, iva: 0, retencion_iva: 0, retencion_isr: 0, retenciones: 0, total: 751 };
  assert.deepEqual(diferenciasImportes(reg, { ...reg, total: 751.004 }), []);
  assert.deepEqual(diferenciasImportes(reg, { ...reg, subtotal: 600, total: 600 }).map((d) => [d.campo, d.diferencia]), [["subtotal", -151], ["total", -151]]);
  assert.deepEqual(diferenciasImportes({ total: "604.00" }, { total: 604 }).filter((d) => d.campo === "total"), []);
});

test("sustitución CFDI: XML obligatorio y PDF opcional, ambos hasta 4 MB", () => {
  assert.match(revisarArchivos(null, null)!, /XML/);
  assert.match(revisarArchivos({ name: "Folio3088.pdf", size: 10 }, null)!, /XML/);
  assert.match(revisarArchivos({ name: "Folio3088.xml", size: MAX_ARCHIVO + 1 }, null)!, /4 MB/);
  assert.equal(revisarArchivos({ name: "Folio3088.XML", size: 5056 }, null), null);
  assert.equal(revisarArchivos({ name: "Folio3088.xml", size: 5056 }, { name: "Folio3088.pdf", size: 324609 }), null);
  assert.match(revisarArchivos({ name: "Folio3088.xml", size: 5056 }, { name: "Folio3088.png", size: 10 })!, /PDF/);
  assert.match(revisarArchivos({ name: "a.xml", size: 3 * 1024 * 1024 }, { name: "a.pdf", size: 2 * 1024 * 1024 })!, /juntos/);
});

test("sustitución CFDI: avisos de complementos y de CFDI relacionado", () => {
  assert.match(avisoComplementos({ cantidad: 2, monto: 100 }, "PPD")!, /2 complementos.*REP del UUID nuevo/);
  assert.match(avisoComplementos({ cantidad: 0, monto: 0 }, "PPD")!, /PPD/);
  assert.equal(avisoComplementos(null, "PUE"), null);
  assert.match(avisoRelacion("AAA", [])!, /cancelado/);
  assert.equal(avisoRelacion("aaa", ["AAA"]), null);
  assert.match(avisoRelacion("AAA", ["BBB"])!, /otros CFDI/);
});
