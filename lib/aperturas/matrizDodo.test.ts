import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, unzipSync, zipSync } from "fflate";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { codigoDeItem, leerMatriz, matrizDeCodigo, normalizarCodigo } from "./matrizDodo.ts";

const textos = [
  "Артикул\nArticle No.", // 0
  "Фотография\nPicture", // 1
  "Наличие согласованной замены", // 2
  "D.15.2-01", // 3
  "Samsung QM32C", // 4
  "С .50.0-01", // 5 (С cirílica y espacio)
  "E.40.0-01", // 6
  "Nota", // 7
  "D.15.2-01", // 8 (duplicado sin foto)
  "Info", // 9
  "X.1", // 10 (duplicado: primero sin foto, luego con foto)
];
const c = (ref: string, i: number) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
const hoja1 = `<worksheet><sheetData>
<row r="1">${c("A1", 0)}${c("B1", 1)}${c("C1", 2)}</row>
<row r="3">${c("A3", 3)}${c("C3", 4)}</row>
<row r="4">${c("A4", 5)}</row>
<row r="5">${c("A5", 6)}</row>
<row r="6">${c("A6", 8)}</row>
<row r="7">${c("A7", 10)}</row>
<row r="8">${c("A8", 10)}</row>
</sheetData><drawing r:id="rId1"/></worksheet>`;
const hoja2 = `<worksheet><sheetData><row r="1">${c("A1", 9)}</row></sheetData></worksheet>`;

const ancla = (col: number, row: number, rid: string, tipo = "oneCellAnchor") =>
  `<xdr:${tipo}><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
  `<xdr:pic><xdr:blipFill><a:blip r:embed="${rid}"/></xdr:blipFill></xdr:pic></xdr:${tipo}>`;
const drawing = `<xdr:wsDr>${ancla(1, 0, "rId1")}${ancla(1, 2, "rId2")}${ancla(1, 3, "rId3", "twoCellAnchor")}${ancla(3, 4, "rId4")}${ancla(1, 7, "rId5")}</xdr:wsDr>`;

const rel = (id: string, destino: string) => `<Relationship Id="${id}" Type="x" Target="${destino}"/>`;
const unzip = unzipSync;
const xlsx = zipSync({
  "xl/workbook.xml": strToU8(`<workbook><sheets><sheet name="Equipo" sheetId="1" r:id="rId1"/><sheet name="Info" sheetId="2" r:id="rId2"/></sheets></workbook>`),
  "xl/_rels/workbook.xml.rels": strToU8(`<Relationships>${rel("rId1", "worksheets/sheet1.xml")}${rel("rId2", "worksheets/sheet2.xml")}</Relationships>`),
  "xl/sharedStrings.xml": strToU8(`<sst>${textos.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`),
  "xl/worksheets/sheet1.xml": strToU8(hoja1),
  "xl/worksheets/sheet2.xml": strToU8(hoja2),
  "xl/worksheets/_rels/sheet1.xml.rels": strToU8(`<Relationships>${rel("rId1", "../drawings/drawing1.xml")}</Relationships>`),
  "xl/drawings/drawing1.xml": strToU8(drawing),
  "xl/drawings/_rels/drawing1.xml.rels": strToU8(
    `<Relationships>${rel("rId1", "../media/header.png")}${rel("rId2", "../media/image2.png")}${rel("rId3", "../media/image3.png")}${rel("rId4", "../media/otra.png")}${rel("rId5", "../media/image5.png")}</Relationships>`,
  ),
});

test("normalizarCodigo: cirílica y espacios", () => {
  assert.equal(normalizarCodigo("С .50.0-01"), "C.50.0-01");
  assert.equal(normalizarCodigo(" D.15.2-01 "), "D.15.2-01");
});

test("matrizDeCodigo por prefijo", () => {
  assert.equal(matrizDeCodigo("D.15.2-01"), "digital");
  assert.equal(matrizDeCodigo("FN.DXB.00_DC.1.1.1"), "mobiliario");
  assert.equal(matrizDeCodigo("F.1.2"), "mobiliario");
  assert.equal(matrizDeCodigo("FOK.3"), "mobiliario");
  assert.equal(matrizDeCodigo("N.10.0-01"), "neutral");
  assert.equal(matrizDeCodigo("E.40.0-01"), "proceso");
  assert.equal(matrizDeCodigo("Inv.5"), "herramientas");
  assert.equal(matrizDeCodigo("ZZ.1"), null);
  assert.equal(matrizDeCodigo("C.50.0-01"), null);
});

test("codigoDeItem: normaliza; null si no es texto, vacío o -", () => {
  assert.equal(codigoDeItem({ codigo: "С .50.0-01" }), "C.50.0-01");
  assert.equal(codigoDeItem({ codigo: "-" }), null);
  assert.equal(codigoDeItem({ codigo: "  " }), null);
  assert.equal(codigoDeItem({ codigo: 12 }), null);
  assert.equal(codigoDeItem({}), null);
});

test("leerMatriz: liga fotos por renglón y columna, sustituto y hojas sin código", () => {
  const { entradas, hojasSinCodigo } = leerMatriz(unzip(xlsx));
  assert.deepEqual(hojasSinCodigo, ["Info"]);
  // la imagen del renglón del encabezado (rId1) no se liga a nada
  assert.deepEqual(entradas.get("D.15.2-01"), { foto: "xl/media/image2.png", sustituto: "Samsung QM32C", hoja: "Equipo" });
  // twoCellAnchor, y la C cirílica con espacio queda normalizada
  assert.equal(entradas.get("C.50.0-01")?.foto, "xl/media/image3.png");
  // imagen anclada en una columna que no es la de foto: no se liga
  assert.deepEqual(entradas.get("E.40.0-01"), { foto: null, sustituto: null, hoja: "Equipo" });
  assert.equal(entradas.size, 4);
  assert.ok(![...entradas.values()].some((e) => e.foto === "xl/media/header.png" || e.foto === "xl/media/otra.png"));
});

test("leerMatriz: duplicado, gana la primera entrada con foto", () => {
  const { entradas } = leerMatriz(unzip(xlsx));
  // D.15.2-01: renglón 3 con foto y renglón 6 sin foto
  assert.equal(entradas.get("D.15.2-01")?.foto, "xl/media/image2.png");
  // X.1: renglón 7 sin foto, renglón 8 con foto
  assert.equal(entradas.get("X.1")?.foto, "xl/media/image5.png");
});
