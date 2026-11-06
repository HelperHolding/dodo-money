import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCsvContactos } from "./csv.ts";

test("csv: BOM, ; o , como separador, encabezados en mayúsculas y comillas", () => {
  const r = leerCsvContactos("﻿CORREO;Nombre;Etiquetas\r\n Ana@Mail.com ;\"Ana; López\";zapopan;vip\r\nluis@mail.com;;\r\n\r\n");
  assert.equal(r.error, undefined);
  assert.deepEqual(r.filas, [{ email: "ana@mail.com", nombre: "Ana; López", etiquetas: ["zapopan"] }, { email: "luis@mail.com", nombre: null, etiquetas: [] }]);
  const c = leerCsvContactos("email,nombre,etiquetas\nx@y.com,X,\"a;b\"");
  assert.deepEqual(c.filas[0], { email: "x@y.com", nombre: "X", etiquetas: ["a", "b"] });
  assert.match(leerCsvContactos("nombre\nAna").error ?? "", /columna correo/);
});

test("csv: Excel (BOM, ;, mayúsculas, espacios/NBSP/ZWSP) importa igual que la base y sin duplicados", () => {
  const r = leerCsvContactos("﻿EMAIL;NOMBRE;ETIQUETAS\r\n ANA@Mail.COM​;Ana;VIP\r\nana@mail.com ;;Zapopan\r\n﻿luis@mail.com;Luis;\r\nLUIS@MAIL.COM;Otro;vip\r\n");
  assert.equal(r.error, undefined);
  assert.deepEqual(r.filas, [
    { email: "ana@mail.com", nombre: "Ana", etiquetas: ["vip", "zapopan"] },
    { email: "luis@mail.com", nombre: "Luis", etiquetas: ["vip"] },
  ]);
});

test("csv: acepta 'Correo electrónico' (con o sin acento, cualquier caja) como columna de correo", () => {
  for (const cab of ["Correo electrónico", "CORREO ELECTRONICO", "correo electrónico"]) {
    assert.deepEqual(leerCsvContactos(`${cab};Nombre\nA@B.com;Ana`).filas, [{ email: "a@b.com", nombre: "Ana", etiquetas: [] }], cab);
  }
});
