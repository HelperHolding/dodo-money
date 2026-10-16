import { deflateRawSync } from "node:zlib";

/**
 * Escribe un .xlsx mínimo (sin librerías): hojas con texto, números, pesos, porcentajes y fechas, renglones en negritas
 * y anchos de columna. Es lo justo para los reportes que se descargan; lo lee Excel, Google Sheets y lib/ventas/xlsx.ts.
 */

export type Celda =
  | string
  | number
  | null
  | { valor: number; formato: "pesos" | "porcentaje" | "puntos" | "contable"; estilo?:EstiloFila }
  | { fecha: string; estilo?:EstiloFila }
  | { texto:string; estilo?:EstiloFila }
  | { formula:string; resultado:number|string; formato?:Formato; estilo?:EstiloFila };

export type HojaXlsx = {
  nombre: string;
  filas: Celda[][];
  /** Índices (desde 0) de los renglones en negritas. */
  negritas?: number[];
  /** Ancho de cada columna en caracteres. */
  anchos?: number[];
  /** Estilo de renglones completos (índice desde 0): fondo y color de letra en hex RRGGBB y negritas. Con fondo se pinta hasta la última columna. */
  estilos?: Record<number, EstiloFila>;
  combinadas?: string[];
  inmovilizar?: number;
  ocultarCuadricula?: boolean;
  altos?: Record<number,number>;
  impresion?: {area:string;repetirFilas?:string};
};

export type EstiloFila = { fondo?: string; texto?: string; negrita?: boolean; fuente?:string;tamano?:number;ajustarTexto?:boolean };

type Formato = "general" | "pesos" | "porcentaje" | "fecha" | "puntos" | "contable";
const NUM_FMT: Record<Formato, number> = { general: 0, pesos: 164, porcentaje: 10, fecha: 165, puntos: 166, contable: 167 };
type Estilo = EstiloFila & {negrita:boolean};

/** Estilos del libro: el 0 es el normal; los demás se agregan según se usen (formato, negritas, fondo, color de letra). */
class Estilos {
  private claves = ["general|0|||Calibri|11|0"];
  indice(formato: Formato, e: Estilo): number {
    const clave = `${formato}|${e.negrita ? 1 : 0}|${e.fondo ?? ""}|${e.texto ?? ""}|${e.fuente??'Calibri'}|${e.tamano??11}|${e.ajustarTexto?1:0}`;
    let i = this.claves.indexOf(clave);
    if (i < 0) { i = this.claves.length; this.claves.push(clave); }
    return i;
  }
  xml(): string {
    const partes = this.claves.map((c) => { const [formato, b, fondo, texto,fuente,tamano,ajustar] = c.split("|"); return { formato: formato as Formato, negrita: b === "1", fondo, texto,fuente,tamano,ajustar }; });
    const fuentes = [...new Set(["0||Calibri|11", "1||Calibri|11", ...partes.map((p) => `${p.negrita ? 1 : 0}|${p.texto}|${p.fuente}|${p.tamano}`)])];
    const fondos = [...new Set(partes.map((p) => p.fondo).filter(Boolean))];
    const fuente = (f: string) => {
      const [b, color,nombre,tamano] = f.split("|");
      return `<font>${b === "1" ? "<b/>" : ""}<sz val="${tamano}"/>${color ? `<color rgb="FF${color}"/>` : ""}<name val="${escapar(nombre)}"/></font>`;
    };
    const xf = (p: (typeof partes)[number]) => {
      const fontId = fuentes.indexOf(`${p.negrita ? 1 : 0}|${p.texto}|${p.fuente}|${p.tamano}`), fillId = p.fondo ? fondos.indexOf(p.fondo) + 2 : 0, num = NUM_FMT[p.formato];
      const base=`<xf numFmtId="${num}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${num ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}`;
      return p.ajustar==='1'?`${base} applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>`:`${base}/>`;
    };
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="+0.0&quot; pts&quot;;-0.0&quot; pts&quot;;0.0&quot; pts&quot;"/><numFmt numFmtId="167" formatCode="_(&quot;$&quot;* #,##0.00_);_(&quot;$&quot;* \\(#,##0.00\\);_(&quot;$&quot;* &quot;-&quot;??_);_(@_)"/></numFmts>
<fonts count="${fuentes.length}">${fuentes.map(fuente).join("")}</fonts>
<fills count="${fondos.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fondos.map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${partes.length}">${partes.map(xf).join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }
}

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

function celdaXml(ref: string, c: Celda, e: Estilo, estilos: Estilos): string {
  if(c!==null&&typeof c==='object'&&c.estilo)e={...e,...c.estilo};
  const s = (f: Formato) => { const i = estilos.indice(f, e); return i ? ` s="${i}"` : ""; };
  if (c === null || c === "") return e.fondo ? `<c r="${ref}"${s("general")}/>` : "";
  if (typeof c === "string") return `<c r="${ref}" t="inlineStr"${s("general")}><is><t xml:space="preserve">${escapar(c)}</t></is></c>`;
  if (typeof c === "number") return Number.isFinite(c) ? `<c r="${ref}"${s("general")}><v>${c}</v></c>` : "";
  if('texto' in c)return `<c r="${ref}" t="inlineStr"${s('general')}><is><t xml:space="preserve">${escapar(c.texto)}</t></is></c>`;
  if('formula' in c){
    if(typeof c.resultado==='number'&&!Number.isFinite(c.resultado))throw Error('Resultado de fórmula no finito.');
    return `<c r="${ref}"${typeof c.resultado==='string'?' t="str"':''}${s(c.formato??'general')}><f>${escapar(c.formula.replace(/^=/,''))}</f><v>${escapar(String(c.resultado))}</v></c>`;
  }
  if ("fecha" in c) return `<c r="${ref}"${s("fecha")}><v>${serial(c.fecha)}</v></c>`;
  return Number.isFinite(c.valor) ? `<c r="${ref}"${s(c.formato)}><v>${c.valor}</v></c>` : "";
}

function hojaXml(h: HojaXlsx, estilos: Estilos): string {
  const negritas = new Set(h.negritas ?? []);
  const ancho = Math.max(h.anchos?.length ?? 0, ...h.filas.map((f) => f.length));
  const cols = h.anchos?.length
    ? `<cols>${h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const filas = h.filas.map((fila, r) => {
    const x = h.estilos?.[r];
    const e: Estilo = { ...x,negrita: x?.negrita ?? negritas.has(r) };
    const celdas = e.fondo ? Array.from({ length: ancho }, (_, i) => fila[i] ?? null) : fila;
    return `<row r="${r + 1}"${h.altos?.[r]?` ht="${h.altos[r]}" customHeight="1"`:''}>${celdas.map((c, i) => celdaXml(`${columna(i)}${r + 1}`, c, e, estilos)).join("")}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${h.impresion?'<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>':''}<sheetViews><sheetView workbookViewId="0"${h.ocultarCuadricula?' showGridLines="0"':''}>${h.inmovilizar?`<pane ySplit="${h.inmovilizar}" topLeftCell="A${h.inmovilizar+1}" activePane="bottomLeft" state="frozen"/>`:''}</sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData>${h.combinadas?.length?`<mergeCells count="${h.combinadas.length}">${h.combinadas.map(r=>`<mergeCell ref="${escapar(r)}"/>`).join('')}</mergeCells>`:''}${h.impresion?'<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>':''}</worksheet>`;
}

/** Excel no acepta en el nombre de hoja \ / ? * [ ] : ni más de 31 caracteres. */
const nombreHoja = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Hoja";

export function escribirXlsx(hojas: readonly HojaXlsx[],opciones:{nombres?:Record<string,string>}={}): Uint8Array {
  const estilos = new Estilos();
  const hojasXml = hojas.map((h) => hojaXml(h, estilos));
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
<definedNames>${Object.entries(opciones.nombres??{}).map(([n,r])=>`<definedName name="${escapar(n)}">${escapar(r)}</definedName>`).join('')}${hojas.map((h,i)=>h.impresion?`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${escapar(nombreHoja(h.nombre).replace(/'/g,"''"))}'!${h.impresion.area}</definedName>${h.impresion.repetirFilas?`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${escapar(nombreHoja(h.nombre).replace(/'/g,"''"))}'!${h.impresion.repetirFilas}</definedName>`:''}`:'').join('')}</definedNames>
<calcPr calcMode="auto" fullCalcOnLoad="1"/>
</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ["xl/styles.xml", estilos.xml()],
    ...hojasXml.map((x, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, x]),
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
