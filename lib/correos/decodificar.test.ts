import { test } from "node:test";
import assert from "node:assert/strict";
import { decodificarCsv } from "./decodificar.ts";
import { leerCsvContactos } from "./csv.ts";

test("decodificarCsv: Windows-1252 de Excel y UTF-8 con BOM", () => {
  const cp1252 = Uint8Array.from([..."Correo electr"].map((c) => c.charCodeAt(0)).concat(0xf3), (b) => b);
  const bytes = Uint8Array.from([...cp1252, ...Buffer.from("nico;Nombre\r\nana@x.mx;Pe"), 0xf1, ...Buffer.from("a")]);
  const t = decodificarCsv(bytes);
  assert.equal(t, "Correo electrónico;Nombre\r\nana@x.mx;Peña");
  assert.deepEqual(leerCsvContactos(t).filas, [{ email: "ana@x.mx", nombre: "Peña", etiquetas: [] }]);
  const u = decodificarCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("correo;nombre\nb@x.mx;Peña")]));
  assert.equal(leerCsvContactos(u).filas[0].nombre, "Peña");
});
