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
  assert.match(estilos, /<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;\$&quot;#,##0\.00"\/><numFmt numFmtId="165" formatCode="dd\/mm\/yyyy"\/><numFmt numFmtId="166" formatCode="\+0\.0&quot; pts&quot;;-0\.0&quot; pts&quot;;0\.0&quot; pts&quot;"\/><numFmt numFmtId="167" /);
  assert.ok(estilos.includes(`<numFmt numFmtId="167" formatCode="_(&quot;$&quot;* #,##0.00_);_(&quot;$&quot;* \\(#,##0.00\\);_(&quot;$&quot;* &quot;-&quot;??_);_(@_)"/>`));
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

/** Un archivo del ZIP, ya inflado. */
function parte(b: Buffer, nombre: string): string {
  let p = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const tam = b.readUInt32LE(p + 18), ln = b.readUInt16LE(p + 26);
    const inicio = p + 30 + ln + b.readUInt16LE(p + 28);
    if (b.toString("utf8", p + 30, p + 30 + ln) === nombre) return inflateRawSync(b.subarray(inicio, inicio + tam)).toString("utf8");
    p = inicio + tam;
  }
  return "";
}

test("escribirXlsx: renglones con fondo, color de letra y formato contable", () => {
  const b = Buffer.from(escribirXlsx([{
    nombre: "P&L",
    filas: [["VENTA"], ["Venta neta", { valor: -10, formato: "contable" }], ["EBITDA", { valor: 5, formato: "contable" }, null]],
    anchos: [20, 14, 14],
    estilos: { 0: { fondo: "BDD7EE", negrita: true }, 2: { fondo: "7F7F7F", texto: "FFFFFF", negrita: true } },
  }]));
  const estilos = parte(b, "xl/styles.xml"), hoja = parte(b, "xl/worksheets/sheet1.xml");
  assert.ok(estilos.includes('<fgColor rgb="FFBDD7EE"/>'));
  assert.ok(estilos.includes('<fgColor rgb="FF7F7F7F"/>'));
  assert.ok(estilos.includes('<color rgb="FFFFFFFF"/>'));
  // La banda llega a la última columna aunque el renglón traiga menos celdas; un renglón sin estilo no se rellena.
  assert.match(hoja, /<c r="C1" s="\d+"\/>/);
  assert.match(hoja, /<c r="C3" s="\d+"\/>/);
  assert.doesNotMatch(hoja, /r="C2"/);
  assert.match(hoja, /<c r="B2" s="\d+"><v>-10<\/v><\/c>/);
  assert.equal(leerHojas(new Uint8Array(b))[0].celdas.get("B2"), -10);
});


test('escribirXlsx: fórmulas con caché, entradas editables y formato de la corrida',()=>{
 const bytes=escribirXlsx([{nombre:'Resumen',filas:[['Corrida'],[{fecha:'2026-10-15'},{texto:'',estilo:{fondo:'FFF2CC',texto:'0000FF'}}],[{formula:'SUM(1,2)',resultado:3,formato:'pesos'},{formula:'IF(COUNT(B2)=0,"",B2-A3)',resultado:''}]],estilos:{0:{fuente:'Arial',tamano:10,fondo:'1A1A1A',texto:'FFFFFF',negrita:true,ajustarTexto:true}},combinadas:['A1:B1'],inmovilizar:1,ocultarCuadricula:true,altos:{0:25},impresion:{area:'$A$1:$B$3',repetirFilas:'$1:$1'}}],{nombres:{FECHA_CORRIDA:"'Resumen'!$A$2"}});
 const hoja=parte(Buffer.from(bytes),'xl/worksheets/sheet1.xml'),libro=parte(Buffer.from(bytes),'xl/workbook.xml');
 assert.match(hoja,/<f>SUM\(1,2\)<\/f><v>3<\/v>/);assert.match(hoja,/<mergeCell ref="A1:B1"/);assert.match(hoja,/state="frozen"/);assert.match(hoja,/showGridLines="0"/);assert.match(hoja,/ht="25"/);assert.match(libro,/name="FECHA_CORRIDA"/);assert.match(libro,/_xlnm.Print_Titles/);assert.match(libro,/fullCalcOnLoad="1"/);
 const c=leerHojas(bytes)[0].celdas;assert.equal(c.get('A3'),3);assert.equal(c.get('B3'),'');
});

test('escribirXlsx: texto ajeno se conserva como texto, no se ejecuta como fórmula',()=>{
 const bytes=escribirXlsx([{nombre:'Datos',filas:[['=HYPERLINK("https://example.invalid","factura")','<script> & proveedor']]}]);
 const hoja=parte(Buffer.from(bytes),'xl/worksheets/sheet1.xml');assert.ok(!hoja.includes('<f>'));assert.match(hoja,/inlineStr/);assert.equal(leerHojas(bytes)[0].celdas.get('B1'),'<script> & proveedor');
});
