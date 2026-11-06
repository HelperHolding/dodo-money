import { test } from "node:test";
import assert from "node:assert/strict";
import { csvDestinatarios } from "./csvSalida.ts";
const envio = (id: string, email: string, detalle: string | null) => ({ id, email, es_prueba: false, estado: "problema" as const, enviado_en: null, detalle });
test("csv salida: BOM, encabezados, comillas y sin pruebas", () => {
  const c = csvDestinatarios(
    [{ id: "a", email: "a@m.com", es_prueba: false, estado: "aceptado", enviado_en: "2026-11-07T18:00:00Z", detalle: 'dijo "ok"' }, { id: "p", email: "p@m.com", es_prueba: true, estado: "aceptado", enviado_en: null, detalle: null }],
    { a: { abrio: "2026-11-07T18:05:00Z", clic: null } });
  assert.equal(c, '﻿correo,estado,enviado,abrio,clic,detalle\r\na@m.com,aceptado,2026-11-07T18:00:00Z,2026-11-07T18:05:00Z,,"dijo ""ok"""\r\n');
});
test("csv salida: neutraliza fórmulas de hoja de cálculo", () => {
  const c = csvDestinatarios([
    envio("a", "x@m.com", '=HYPERLINK("http://x")'), envio("b", "y@m.com", "+1"), envio("c", "z@m.com", "-2"),
    envio("d", "w@m.com", "@cmd"), envio("e", "v@m.com", "\tmalo"), envio("f", "u@m.com", "\rmalo"),
  ], {});
  assert.equal(c, [
    "﻿correo,estado,enviado,abrio,clic,detalle",
    `x@m.com,problema,,,,"'=HYPERLINK(""http://x"")"`,
    "y@m.com,problema,,,,'+1", "z@m.com,problema,,,,'-2", "w@m.com,problema,,,,'@cmd",
    "v@m.com,problema,,,,'\tmalo", `u@m.com,problema,,,,"'\rmalo"`, "",
  ].join("\r\n"));
});
