// Lectura de las matrices de Dodo (.xlsx): foto y sustituto por código.
// Lógica pura: sin APIs de Node ni del DOM; el zip llega ya abierto con unzipSync de fflate.
import { strFromU8 } from "fflate";

export type Matriz = "digital" | "mobiliario" | "neutral" | "proceso" | "herramientas";
export type EntradaMatriz = { foto: string | null; sustituto: string | null; hoja: string };

const PREFIJOS: Record<string, Matriz> = {
  d: "digital",
  f: "mobiliario",
  fn: "mobiliario",
  fok: "mobiliario",
  n: "neutral",
  e: "proceso",
  inv: "herramientas",
};

// Letras cirílicas que se ven igual que las latinas.
const CIRILICAS: Record<string, string> = {
  "С": "C", "с": "c", "Е": "E", "е": "e", "О": "O", "о": "o", "Р": "P", "р": "p",
  "А": "A", "а": "a", "Н": "H", "К": "K", "М": "M", "Т": "T", "Х": "X", "х": "x", "В": "B",
};

export function normalizarCodigo(c: string): string {
  return c.replace(/[Ѐ-ӿ]/g, (ch) => CIRILICAS[ch] ?? ch).toUpperCase().replace(/\s+/g, "");
}

export function matrizDeCodigo(c: string): Matriz | null {
  const pref = /^[A-Za-z]+/.exec(normalizarCodigo(c))?.[0].toLowerCase();
  return (pref && PREFIJOS[pref]) || null;
}

export function codigoDeItem(original: Record<string, unknown>): string | null {
  const c = original?.codigo;
  if (typeof c !== "string") return null;
  const n = normalizarCodigo(c);
  return n === "" || n === "-" ? null : n;
}

const decodificar = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const texto = (archivos: Record<string, Uint8Array>, ruta: string): string | null => {
  const b = archivos[ruta];
  return b ? strFromU8(b) : null;
};

const atributo = (tag: string, nombre: string): string | null => {
  const m = new RegExp(`(?:^|[\\s:])${nombre}="([^"]*)"`).exec(tag);
  return m ? decodificar(m[1]) : null;
};

// Une un destino relativo de un .rels con la carpeta del archivo que lo declara.
function resolver(carpeta: string, destino: string): string {
  if (destino.startsWith("/")) return destino.slice(1);
  const partes = carpeta.split("/").filter(Boolean);
  for (const p of destino.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== "." && p !== "") partes.push(p);
  }
  return partes.join("/");
}

function relaciones(archivos: Record<string, Uint8Array>, rutaRels: string, carpeta: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const xml = texto(archivos, rutaRels);
  if (!xml) return mapa;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], "Id");
    const destino = atributo(m[0], "Target");
    if (id && destino) mapa.set(id, resolver(carpeta, destino));
  }
  return mapa;
}

const textoDe = (xml: string) =>
  decodificar([...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => m[1]).join(""));

function cadenasCompartidas(archivos: Record<string, Uint8Array>): string[] {
  const xml = texto(archivos, "xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textoDe(m[1]));
}

const colAIndice = (letras: string) => [...letras].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

type Hoja = { filas: Map<number, Map<number, string>> };

function leerHoja(xml: string, compartidas: string[]): Hoja {
  const filas = new Map<number, Map<number, string>>();
  for (const f of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(atributo(f[1], "r"));
    if (!r || !f[2]) continue;
    const celdas = new Map<number, string>();
    for (const c of f[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /^([A-Z]+)\d+$/.exec(atributo(c[1], "r") ?? "");
      if (!ref || !c[2]) continue;
      const tipo = atributo(c[1], "t");
      let valor: string | null = null;
      if (tipo === "inlineStr") valor = textoDe(c[2]);
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1];
        if (v !== undefined) valor = tipo === "s" ? (compartidas[Number(v)] ?? null) : decodificar(v);
      }
      if (valor !== null && valor.trim() !== "") celdas.set(colAIndice(ref[1]), valor);
    }
    filas.set(r, celdas);
  }
  return { filas };
}

type Encabezado = { fila: number; codigo: number; foto: number | null; sustituto: number | null };

function buscarEncabezado(hoja: Hoja): Encabezado | null {
  for (let fila = 1; fila <= 10; fila++) {
    const celdas = hoja.filas.get(fila);
    if (!celdas) continue;
    let codigo: number | null = null;
    let foto: number | null = null;
    let sustituto: number | null = null;
    for (const [col, t] of [...celdas].sort((a, b) => a[0] - b[0])) {
      if (t.length > 80) continue; // texto largo de instrucciones, no un encabezado
      if (codigo === null && /article\s*no|item\s*#|артикул/i.test(t)) codigo = col;
      else if (foto === null && /picture|фотография|изображение/i.test(t)) foto = col;
      else if (sustituto === null && /замен|substitut/i.test(t)) sustituto = col;
    }
    if (codigo !== null) return { fila, codigo, foto, sustituto };
  }
  return null;
}

// Imágenes del drawing de una hoja: "fila,col" (base 0) → ruta de la imagen en el zip.
function imagenesDe(archivos: Record<string, Uint8Array>, rutaDrawing: string): Map<string, string> {
  const salida = new Map<string, string>();
  const xml = texto(archivos, rutaDrawing);
  if (!xml) return salida;
  const carpeta = rutaDrawing.slice(0, rutaDrawing.lastIndexOf("/"));
  const nombre = rutaDrawing.slice(rutaDrawing.lastIndexOf("/") + 1);
  const rels = relaciones(archivos, `${carpeta}/_rels/${nombre}.rels`, carpeta);
  for (const a of xml.matchAll(/<(?:\w+:)?(oneCellAnchor|twoCellAnchor)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/g)) {
    const from = /<(?:\w+:)?from\b[^>]*>([\s\S]*?)<\/(?:\w+:)?from>/.exec(a[2])?.[1];
    const col = from && /<(?:\w+:)?col\b[^>]*>(\d+)</.exec(from)?.[1];
    const row = from && /<(?:\w+:)?row\b[^>]*>(\d+)</.exec(from)?.[1];
    const blip = /<(?:\w+:)?blip\b[^>]*>/.exec(a[2])?.[0];
    const rid = blip && atributo(blip, "embed");
    const ruta = rid ? rels.get(rid) : undefined;
    if (col && row && ruta) {
      const clave = `${row},${col}`;
      if (!salida.has(clave)) salida.set(clave, ruta);
    }
  }
  return salida;
}

export function leerMatriz(archivos: Record<string, Uint8Array>): {
  entradas: Map<string, EntradaMatriz>;
  hojasSinCodigo: string[];
} {
  const entradas = new Map<string, EntradaMatriz>();
  const hojasSinCodigo: string[] = [];
  const libro = texto(archivos, "xl/workbook.xml");
  if (!libro) return { entradas, hojasSinCodigo };
  const relLibro = relaciones(archivos, "xl/_rels/workbook.xml.rels", "xl");
  const compartidas = cadenasCompartidas(archivos);

  for (const s of libro.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const nombre = atributo(s[0], "name");
    const rid = atributo(s[0], "id");
    const ruta = rid ? relLibro.get(rid) : undefined;
    const xmlHoja = ruta ? texto(archivos, ruta) : null;
    if (nombre === null || !ruta || xmlHoja === null) continue;

    const hoja = leerHoja(xmlHoja, compartidas);
    const enc = buscarEncabezado(hoja);
    if (!enc) {
      hojasSinCodigo.push(nombre);
      continue;
    }

    const carpeta = ruta.slice(0, ruta.lastIndexOf("/"));
    const archivo = ruta.slice(ruta.lastIndexOf("/") + 1);
    const relHoja = relaciones(archivos, `${carpeta}/_rels/${archivo}.rels`, carpeta);
    const rutaDrawing = [...relHoja.values()].find((v) => /\/drawings\/[^/]+\.xml$/.test(v));
    const imagenes = rutaDrawing ? imagenesDe(archivos, rutaDrawing) : new Map<string, string>();

    const filas = [...hoja.filas.keys()].filter((f) => f > enc.fila).sort((a, b) => a - b);
    for (const fila of filas) {
      const celdas = hoja.filas.get(fila)!;
      const bruto = celdas.get(enc.codigo);
      const codigo = bruto === undefined ? null : codigoDeItem({ codigo: bruto });
      if (!codigo) continue;
      const foto = enc.foto === null ? null : (imagenes.get(`${fila - 1},${enc.foto}`) ?? null);
      const sustituto = enc.sustituto === null ? null : (celdas.get(enc.sustituto)?.trim() || null);
      const previa = entradas.get(codigo);
      if (!previa || (!previa.foto && foto)) entradas.set(codigo, { foto, sustituto, hoja: nombre });
    }
  }
  return { entradas, hojasSinCodigo };
}
