import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { ES_IMAGEN, leerConstancia as leer, NO_ES_CONSTANCIA, NO_ES_PDF, regimenPropuesto } from "./constancia.ts";
import { REGIMENES } from "./proveedores.ts";

const leerConstancia = (datos: Uint8Array) => leer(datos, REGIMENES);

/**
 * Constancia de mentira con la estructura de las del SAT (Oracle XML Publisher): cada página es un flujo
 * comprimido con "1 0 0 1 x y Tm" y "(texto)Tj", en Helvetica (WinAnsi). Los datos son ficticios.
 */
type Texto = [x: number, y: number, t: string];
function pdfFalso(paginas: Texto[][], { comprimir = true, imagen = false } = {}): Uint8Array {
  const latin1 = (s: string) => Buffer.from(s, "latin1");
  const escapar = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const partes: Buffer[] = [Buffer.from("%PDF-1.4\n%âãÏÓ\n", "latin1")];
  let n = 1;
  const objeto = (cuerpo: Buffer) => {
    const datos = comprimir ? deflateSync(cuerpo) : cuerpo;
    partes.push(Buffer.from(`${n++} 0 obj\n<< /Length ${datos.length}${comprimir ? " /Filter /FlateDecode" : ""} >>\nstream\r\n`, "latin1"), datos, Buffer.from("\r\nendstream\nendobj\n", "latin1"));
  };
  if (imagen) objeto(Buffer.alloc(4000, 0xff)); // una "foto" de la página: bytes sin texto
  for (const textos of paginas) {
    const lineas = ["0.0 0.0 0.0 rg", "BT", "/F0 8.0 Tf"];
    for (const [x, y, t] of textos) lineas.push(`1 0 0 1 ${x} ${y} Tm`, `(${escapar(t)})Tj`);
    lineas.push("ET", "q 549.999 0 0 63.167 30.0 62.832 cm /Im0 Do Q");
    objeto(Buffer.concat(lineas.map((l) => Buffer.concat([latin1(l), Buffer.from("\r\n")]))));
  }
  partes.push(Buffer.from("trailer\n<< >>\n%%EOF\n", "latin1"));
  return new Uint8Array(Buffer.concat(partes));
}

const moral: Texto[][] = [[
  [69, 692, "CÉDULA DE IDENTIFICACIÓN FISCAL "],
  [334, 636, "CONSTANCIA DE SITUACIÓN FISCAL"],
  [43, 440, "RFC:"], [236, 440, "CDE210510AB1"],
  [43, 418, "Denominación/Razón"], [126, 418, "Social:"], [236, 418, "COMERCIALIZADORA"], [320, 418, "DEMO"],
  [43, 396, "Régimen"], [79, 396, "Capital:"], [236, 396, "SOCIEDAD ANONIMA DE CAPITAL VARIABLE"],
  [43, 374, "Nombre"], [75, 374, "Comercial:"], [236, 374, "DEMO"], [269, 374, "FOODS"],
  [43, 254, "Código"], [73, 254, "Postal:"], [99, 254, "53370"], [311, 254, "Tipo de Vialidad:"], [378, 254, "CALLE"],
], [
  [272, 600, "Regímenes:"],
  [214, 581, "Régimen"], [440, 581, "Fecha Inicio"], [516, 581, "Fecha Fin"],
  [38, 569, "Régimen General de Ley Personas Morales"], [449, 569, "10/05/2021"],
  [268, 528, "Obligaciones:"],
  [38, 497, "Pago definitivo mensual de IVA."], [449, 497, "10/05/2021"],
  [162, 263, "||2026/08/03 13:24:08|CDE210510AB1|CONSTANCIA DE SITUACIÓN"], [48, 263, "Cadena Original Sello:"],
]];

const fisica: Texto[][] = [[
  [339, 636, "CONSTANCIA DE SITUACIÓN FISCAL"],
  [322, 581, "GUADALAJARA , JALISCO A 12 DE JUNIO DE 2026"],
  [36, 479, "RFC:"], [236, 479, "PEGJ800101AB2"],
  [36, 457, "CURP:"], [236, 457, "PEGJ800101HJCRNN09"],
  [36, 435, "Nombre"], [68, 435, "(s):"], [236, 435, "JUAN"], [270, 435, "CARLOS"],
  [36, 413, "Primer"], [63, 413, "Apellido:"], [236, 413, "PÉREZ"],
  [36, 391, "Segundo"], [72, 391, "Apellido:"], [236, 391, "GÓMEZ"],
  [36, 304, "Nombre"], [68, 304, "Comercial:"],
  [36, 249, "Código"], [66, 249, "Postal:"], [92, 249, "44530"],
], [
  [31, 544, "Regímenes:"],
  [214, 525, "Régimen"], [446, 525, "Fecha Inicio"], [522, 525, "Fecha Fin"],
  [31, 513, "Régimen de Incorporación Fiscal"], [455, 513, "01/01/2015"], [530, 513, "31/12/2021"],
  [31, 491, "Régimen de las Personas Físicas con Actividades Empresariales y"], [455, 491, "01/01/2022"],
  [31, 482, "Profesionales"],
  [31, 469, "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas."], [455, 469, "01/05/2025"],
  [31, 451, "Obligaciones:"],
]];

test("constancia de persona moral: RFC, razón social, comercial, CP, régimen y fecha de la cadena original", () => {
  const r = leerConstancia(pdfFalso(moral));
  assert.ok("datos" in r, JSON.stringify(r));
  assert.deepEqual(r.datos, {
    tipo: "moral", rfc: "CDE210510AB1", razon_social: "COMERCIALIZADORA DEMO", nombre_comercial: "DEMO FOODS",
    codigo_postal: "53370", fecha_emision: "2026-08-03",
    regimenes: [{ codigo: "601", nombre: "Régimen General de Ley Personas Morales", inicio: "2021-05-10", fin: null }],
  });
  assert.equal(regimenPropuesto(r.datos), "601");
});

test("constancia de persona física: nombre y apellidos, varios regímenes (uno en dos renglones, otro ya terminado)", () => {
  const r = leerConstancia(pdfFalso(fisica));
  assert.ok("datos" in r, JSON.stringify(r));
  assert.equal(r.datos.tipo, "fisica");
  assert.equal(r.datos.rfc, "PEGJ800101AB2");
  assert.equal(r.datos.razon_social, "JUAN CARLOS PÉREZ GÓMEZ");
  assert.equal(r.datos.nombre_comercial, null);
  assert.equal(r.datos.codigo_postal, "44530");
  // Sin cadena original: la fecha sale de "Lugar y Fecha de Emisión".
  assert.equal(r.datos.fecha_emision, "2026-06-12");
  assert.deepEqual(r.datos.regimenes.map((x) => [x.codigo, x.inicio, x.fin]), [
    ["621", "2015-01-01", "2021-12-31"],
    ["612", "2022-01-01", null],
    ["625", "2025-05-01", null],
  ]);
  assert.equal(r.datos.regimenes[1].nombre, "Régimen de las Personas Físicas con Actividades Empresariales y Profesionales");
  // El propuesto es el primero vigente, en el orden en que los lista el SAT.
  assert.equal(regimenPropuesto(r.datos), "612");
});

test("un régimen que no está en el catálogo queda sin código; flujos sin comprimir también se leen", () => {
  const pag = structuredClone(moral);
  pag[1][4] = [38, 569, "Régimen Inventado por el SAT"];
  const r = leerConstancia(pdfFalso(pag, { comprimir: false }));
  assert.ok("datos" in r);
  assert.deepEqual(r.datos.regimenes[0], { codigo: null, nombre: "Régimen Inventado por el SAT", inicio: "2021-05-10", fin: null });
  assert.equal(regimenPropuesto(r.datos), null);
});

test("errores claros: imagen, no es constancia, no es PDF", () => {
  assert.deepEqual(leerConstancia(pdfFalso([], { imagen: true })), { error: ES_IMAGEN });
  assert.deepEqual(leerConstancia(pdfFalso([[[100, 700, "FACTURA ELECTRÓNICA"], [100, 680, "RFC: CDE210510AB1"]]])), { error: NO_ES_CONSTANCIA });
  assert.deepEqual(leerConstancia(new TextEncoder().encode("hola, no soy un PDF")), { error: NO_ES_PDF });
});
