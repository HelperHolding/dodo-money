import { inflateRawSync } from "node:zlib";

/** Primera hoja de un libro: su nombre y sus celdas por referencia ("A1" → texto o número). */
export type Hoja = { nombre: string; celdas: ReadonlyMap<string, string | number>; oculta?: boolean; formulas?: ReadonlyMap<string, string> };

export const NO_ES_XLSX = "El archivo no es un Excel (.xlsx) válido.";
/** Tope por archivo interno ya descomprimido: los reportes de Dodo IS pesan unos cuantos KB. */
const MAX_XML = 20 * 1024 * 1024;

/** Archivos de un ZIP por nombre, leídos del directorio central (los tamaños del encabezado local pueden venir en cero). */
function archivosZip(datos: Uint8Array): Map<string, () => string> {
  const b = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength);
  let fin = b.length - 22;
  while (fin >= 0 && b.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error(NO_ES_XLSX);
  const total = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  const archivos = new Map<string, () => string>();
  for (let i = 0; i < total; i++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new Error(NO_ES_XLSX);
    const metodo = b.readUInt16LE(p + 10);
    const comprimido = b.readUInt32LE(p + 20);
    const largoNombre = b.readUInt16LE(p + 28);
    const largoExtra = b.readUInt16LE(p + 30);
    const largoComentario = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nombre = b.toString("utf8", p + 46, p + 46 + largoNombre);
    archivos.set(nombre, () => {
      if (local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) throw new Error(NO_ES_XLSX);
      const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      const crudo = b.subarray(inicio, inicio + comprimido);
      if (metodo === 0) return crudo.toString("utf8");
      if (metodo === 8) return inflateRawSync(crudo, { maxOutputLength: MAX_XML }).toString("utf8");
      throw new Error(NO_ES_XLSX);
    });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function desescapar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e.toLowerCase()]);
}

/** Atributo de una etiqueta ya recortada: `atributo('<c r="A1" t="s">', "r")` → "A1". */
function atributo(etiqueta: string, nombre: string): string | undefined {
  return new RegExp(`\\s${nombre}="([^"]*)"`).exec(etiqueta)?.[1];
}

/** Texto de todos los <t> de un fragmento (con o sin prefijo "x:"), unido. */
function textos(xml: string): string {
  return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => desescapar(m[1])).join("");
}

/** Lee la primera hoja de un .xlsx: celdas con valor, con cadenas compartidas y en línea resueltas. */
export function leerPrimeraHoja(datos: Uint8Array): Hoja {
  return leerHojas(datos)[0];
}

/** Lee todas las hojas de un .xlsx, en el orden del libro. */
export function leerHojas(datos: Uint8Array): Hoja[] {
  try {
    const hojas = leerLibro(datos);
    if (!hojas.length) throw new Error(NO_ES_XLSX);
    return hojas;
  } catch {
    // ZIP truncado, XML roto o archivo de otro tipo: un solo mensaje entendible.
    throw new Error(NO_ES_XLSX);
  }
}

function leerLibro(datos: Uint8Array): Hoja[] {
  const archivos = archivosZip(datos);
  const leer = (ruta: string) => {
    const f = archivos.get(ruta.replace(/^\//, ""));
    if (!f) throw new Error(NO_ES_XLSX);
    return f();
  };

  const libro = leer("xl/workbook.xml");
  const relaciones = [...leer("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]);
  const compartidas = archivos.has("xl/sharedStrings.xml")
    ? [...leer("xl/sharedStrings.xml").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textos(m[1]))
    : [];

  return [...libro.matchAll(/<(?:\w+:)?sheet\s[^>]*>/g)].map(([hoja]) => {
    const nombre = desescapar(atributo(hoja, "name") ?? "");
    const idRel = atributo(hoja, "r:id");
    const rel = relaciones.find((r) => atributo(r, "Id") === idRel);
    const destino = rel && atributo(rel, "Target");
    if (!destino) throw new Error(NO_ES_XLSX);
    const rutaHoja = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;

    const celdas = new Map<string, string | number>();
    const formulas = new Map<string, string>();
    const compartidasFormula = new Map<string, { ref: string; formula: string }>();
    for (const m of leer(rutaHoja).matchAll(/<(?:\w+:)?c(\s[^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const [, attrs, cuerpo] = m;
      const ref = atributo(attrs, "r");
      if (!ref || cuerpo === undefined) continue;
      const formula = /<(?:\w+:)?f(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?f>/.exec(cuerpo)?.[1];
      if (formula !== undefined) formulas.set(ref, desescapar(formula));
      const etiquetaF = /<(?:\w+:)?f(?:\s[^>]*?)?(?:\/>|>)/.exec(cuerpo)?.[0];
      const compartida = etiquetaF && atributo(etiquetaF, "si");
      if (compartida !== undefined) {
        if (formula !== undefined) compartidasFormula.set(compartida, { ref, formula: desescapar(formula) });
        else {
          const base = compartidasFormula.get(compartida);
          if (base) formulas.set(ref, trasladarFormula(base.formula, base.ref, ref));
        }
      }
      const tipo = atributo(attrs, "t");
      if (tipo === "inlineStr") { celdas.set(ref, textos(cuerpo)); continue; }
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(cuerpo)?.[1];
      if (v === undefined) continue;
      if (tipo === "s") celdas.set(ref, compartidas[Number(v)] ?? "");
      else if (tipo === "str" || tipo === "e") celdas.set(ref, desescapar(v));
      else celdas.set(ref, Number(v));
    }
    return { nombre, celdas, formulas, oculta: /^(hidden|veryHidden)$/.test(atributo(hoja, "state") ?? "") };
  });
}

/** Fórmulas compartidas de Excel: desplaza referencias relativas, conserva las absolutas. */
function trasladarFormula(formula: string, origen: string, destino: string): string {
  const indice = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const ref = (s: string) => { const m = /^([A-Z]+)(\d+)$/.exec(s)!; return [indice(m[1]), Number(m[2])]; };
  const [co, fo] = ref(origen), [cd, fd] = ref(destino);
  const letras = (n: number) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s; };
  // Los textos entre comillas no son referencias (p. ej. SUMIF(..., ">0")).
  return formula.split(/("(?:[^"]|"")*")/).map((s, n) => n % 2 ? s : s.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)\b/g,
    (_, ac: string, c: string, af: string, f: string) => `${ac}${letras(indice(c) + (ac ? 0 : cd - co))}${af}${Number(f) + (af ? 0 : fd - fo)}`)).join("");
}

/** Número serial de Excel (sistema 1900) → "YYYY-MM-DD". */
export function fechaDeSerial(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}
