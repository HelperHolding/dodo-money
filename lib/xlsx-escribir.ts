import { deflateRawSync } from "node:zlib";

/**
 * Escribe un .xlsx mínimo (sin librerías): hojas con texto, números, pesos, porcentajes y fechas, renglones en negritas
 * y anchos de columna. Es lo justo para los reportes que se descargan; lo lee Excel, Google Sheets y lib/ventas/xlsx.ts.
 */

export type Celda =
  | string
  | number
  | null
  | { valor: number; formato: "pesos" | "porcentaje" | "puntos" }
  | { fecha: string };

export type HojaXlsx = {
  nombre: string;
  filas: Celda[][];
  /** Índices (desde 0) de los renglones en negritas. */
  negritas?: number[];
  /** Ancho de cada columna en caracteres. */
  anchos?: number[];
};

// Estilos: cada formato tiene dos variantes, normal y en negritas → índice = formato × 2 + (negritas ? 1 : 0).
const FORMATOS = ["general", "pesos", "porcentaje", "fecha", "puntos"] as const;
const NUM_FMT: Record<(typeof FORMATOS)[number], number> = { general: 0, pesos: 164, porcentaje: 10, fecha: 165, puntos: 166 };

const escapar = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
    // Caracteres de control que no caben en XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function columna(i: number): string {
  let n = i + 1, letras = "";
  while (n > 0) { const r = (n - 1) % 26; letras = String.fromCharCode(65 + r) + letras; n = Math.floor((n - 1) / 26); }
  return letras;
}

/** "YYYY-MM-DD" → número de serie de Excel (sistema 1900). */
const serial = (fecha: string) => (Date.parse(`${fecha}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;

function celdaXml(ref: string, c: Celda, negrita: boolean): string {
  if (c === null || c === "") return "";
  const estilo = (f: (typeof FORMATOS)[number]) => FORMATOS.indexOf(f) * 2 + (negrita ? 1 : 0);
  const s = (f: (typeof FORMATOS)[number]) => { const i = estilo(f); return i ? ` s="${i}"` : ""; };
  if (typeof c === "string") return `<c r="${ref}" t="inlineStr"${s("general")}><is><t xml:space="preserve">${escapar(c)}</t></is></c>`;
  if (typeof c === "number") return Number.isFinite(c) ? `<c r="${ref}"${s("general")}><v>${c}</v></c>` : "";
  if ("fecha" in c) return `<c r="${ref}"${s("fecha")}><v>${serial(c.fecha)}</v></c>`;
  return Number.isFinite(c.valor) ? `<c r="${ref}"${s(c.formato)}><v>${c.valor}</v></c>` : "";
}

function hojaXml(h: HojaXlsx): string {
  const negritas = new Set(h.negritas ?? []);
  const cols = h.anchos?.length
    ? `<cols>${h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const filas = h.filas.map((fila, r) =>
    `<row r="${r + 1}">${fila.map((c, i) => celdaXml(`${columna(i)}${r + 1}`, c, negritas.has(r))).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${filas}</sheetData></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="+0.0&quot; pts&quot;;-0.0&quot; pts&quot;;0.0&quot; pts&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${FORMATOS.length * 2}">${FORMATOS.map((f) => [0, 1].map((b) =>
  `<xf numFmtId="${NUM_FMT[f]}" fontId="${b}" fillId="0" borderId="0" xfId="0"${NUM_FMT[f] ? ' applyNumberFormat="1"' : ""}${b ? ' applyFont="1"' : ""}/>`).join("")).join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Excel no acepta en el nombre de hoja \ / ? * [ ] : ni más de 31 caracteres. */
const nombreHoja = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Hoja";

export function escribirXlsx(hojas: readonly HojaXlsx[]): Uint8Array {
  const archivos: [string, string][] = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${hojas.map((h, i) => `<sheet name="${escapar(nombreHoja(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ["xl/styles.xml", ESTILOS],
    ...hojas.map((h, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)]),
  ];
  return zip(archivos.map(([nombre, texto]) => [nombre, Buffer.from(texto, "utf8")]));
}

// ─── ZIP (deflate) ──────────────────────────────────────────────────────────

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(datos: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of datos) crc = TABLA_CRC[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(archivos: readonly [string, Buffer][]): Uint8Array {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of archivos) {
    const n = Buffer.from(nombre, "utf8");
    const comprimido = deflateRawSync(contenido);
    const crc = crc32(contenido);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // versión necesaria
    local.writeUInt16LE(0x0800, 6);      // nombres en UTF-8
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt32LE(0x00210000, 10); // hora y fecha fijas (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(contenido.length, 22);
    local.writeUInt16LE(n.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, n, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0x00210000, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(contenido.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, n);
    desplazamiento += local.length + n.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return new Uint8Array(Buffer.concat([...locales, directorio, fin]));
}
