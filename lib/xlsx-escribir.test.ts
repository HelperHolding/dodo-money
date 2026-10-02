import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { escribirXlsx } from "./xlsx-escribir.ts";
import { fechaDeSerial, leerHojas } from "./ventas/xlsx.ts";

test("escribirXlsx se vuelve a leer con las mismas hojas y celdas", () => {
  const datos = escribirXlsx([
    {
      nombre: "Resumen",
      filas: [
        ["Reporte de ventas · Coyoacán", null],
        ["Concepto <&> \"raro\"", "Valor"],
        ["Venta total", { valor: 53454.4, formato: "pesos" }],
        ["Costo", { valor: 0.3421, formato: "porcentaje" }],
        ["Pedidos", 812],
      ],
      negritas: [0, 1],
      anchos: [30, 16],
    },
    { nombre: "Por día", filas: [["Fecha", "Total"], [{ fecha: "2026-09-25" }, { valor: 1250.5, formato: "pesos" }]] },
  ]);
  const hojas = leerHojas(datos);
  assert.deepEqual(hojas.map((h) => h.nombre), ["Resumen", "Por día"]);
  const r = hojas[0].celdas;
  assert.equal(r.get("A1"), "Reporte de ventas · Coyoacán");
  assert.equal(r.has("B1"), false);
  assert.equal(r.get("A2"), "Concepto <&> \"raro\"");
  assert.equal(r.get("B3"), 53454.4);
  assert.equal(r.get("B4"), 0.3421);
  assert.equal(r.get("B5"), 812);
  const d = hojas[1].celdas;
  assert.equal(fechaDeSerial(Number(d.get("A2"))), "2026-09-25");
  assert.equal(d.get("B2"), 1250.5);
});

test("escribirXlsx: más de 26 columnas usa AA, AB…", () => {
  const fila = Array.from({ length: 28 }, (_, i) => i + 1);
  const celdas = leerHojas(escribirXlsx([{ nombre: "Ancha", filas: [fila] }]))[0].celdas;
  assert.equal(celdas.get("Z1"), 26);
  assert.equal(celdas.get("AB1"), 28);
});

test("escribirXlsx: el ZIP trae los CRC correctos (Excel rechaza los que no cuadran)", () => {
  const b = Buffer.from(escribirXlsx([{ nombre: "Hoja", filas: [["hola"]] }]));
  let p = 0, revisados = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const metodo = b.readUInt16LE(p + 8), crc = b.readUInt32LE(p + 14), tam = b.readUInt32LE(p + 18);
    const inicio = p + 30 + b.readUInt16LE(p + 26) + b.readUInt16LE(p + 28);
    const crudo = b.subarray(inicio, inicio + tam);
    const contenido = metodo === 8 ? inflateRawSync(crudo) : crudo;
    assert.equal(crc32Ref(contenido), crc);
    p = inicio + tam;
    revisados++;
  }
  assert.ok(revisados >= 6);
});

test("escribirXlsx: los formatos de número están bien escritos (Excel no abre el libro si no)", () => {
  const b = Buffer.from(escribirXlsx([{ nombre: "Hoja", filas: [[1]] }]));
  let p = 0, estilos = "";
  while (b.readUInt32LE(p) === 0x04034b50) {
    const tam = b.readUInt32LE(p + 18), ln = b.readUInt16LE(p + 26);
    const inicio = p + 30 + ln + b.readUInt16LE(p + 28);
    if (b.toString("utf8", p + 30, p + 30 + ln) === "xl/styles.xml") estilos = inflateRawSync(b.subarray(inicio, inicio + tam)).toString("utf8");
    p = inicio + tam;
  }
  assert.equal(estilos.match(/<numFmts/g)?.length, 1);
  assert.match(estilos, /<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;\$&quot;#,##0\.00"\/><numFmt numFmtId="165" formatCode="dd\/mm\/yyyy"\/><numFmt numFmtId="166" formatCode="\+0\.0&quot; pts&quot;;-0\.0&quot; pts&quot;;0\.0&quot; pts&quot;"\/><\/numFmts>/);
});

/** CRC-32 de referencia, bit por bit. */
function crc32Ref(datos: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of datos) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
