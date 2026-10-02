import { inflateSync } from "node:zlib";

/**
 * Lector de la Constancia de Situación Fiscal que se descarga del portal del SAT (PDF con texto, Helvetica/WinAnsi,
 * hecho con Oracle XML Publisher). No usa librerías: saca los textos de cada página con su posición y arma renglones.
 * Una constancia "impresa a PDF" o escaneada es una imagen y no se puede leer: se avisa para llenar a mano.
 */

export const NO_ES_PDF = "El archivo no es un PDF.";
export const ES_IMAGEN = "Esta constancia es una imagen (impresa o escaneada) y no se puede leer. Descárgala del portal del SAT o llena los datos a mano.";
export const NO_ES_CONSTANCIA = "El PDF no parece una Constancia de Situación Fiscal del SAT.";

export type RegimenConstancia = { codigo: string | null; nombre: string; inicio: string | null; fin: string | null };
export type Constancia = {
  tipo: "moral" | "fisica";
  rfc: string;
  /** Persona moral: denominación sin el régimen de capital (como va en el CFDI 4.0). Persona física: nombre y apellidos. */
  razon_social: string;
  nombre_comercial: string | null;
  codigo_postal: string | null;
  fecha_emision: string;
  regimenes: RegimenConstancia[];
};

type Texto = { pagina: number; x: number; y: number; t: string };
type Renglon = { pagina: number; y: number; partes: Texto[] };

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
const winAnsi = new TextDecoder("windows-1252");

/** Cadena literal de PDF (sin los paréntesis) → texto: escapes y octales, en WinAnsi. */
function decodificar(cruda: string): string {
  const bytes = cruda.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e: string) => ESCAPES[e] ?? String.fromCharCode(parseInt(e, 8) & 0xff));
  return winAnsi.decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0) & 0xff));
}

/** Textos de cada flujo de contenido, con la posición que les da "a b c d x y Tm". */
function textosDePdf(datos: Uint8Array): Texto[] {
  const b = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength);
  const crudo = b.toString("latin1");
  const textos: Texto[] = [];
  let pos = 0, pagina = 0;
  for (;;) {
    const inicio = crudo.indexOf("stream", pos);
    if (inicio < 0) break;
    if (crudo.slice(inicio - 3, inicio) === "end") { pos = inicio + 6; continue; }
    let ini = inicio + 6;
    if (crudo[ini] === "\r") ini++;
    if (crudo[ini] === "\n") ini++;
    const fin = crudo.indexOf("endstream", ini);
    if (fin < 0) break;
    pos = fin + 9;
    let contenido: string;
    try { contenido = inflateSync(b.subarray(ini, fin)).toString("latin1"); } catch { contenido = crudo.slice(ini, fin); }
    if (!contenido.includes("BT") || !/\bT[jJ]\b/.test(contenido)) continue;
    pagina++;
    let x = 0, y = 0;
    for (const linea of contenido.split(/\r?\n/)) {
      const tm = /(-?[\d.]+) (-?[\d.]+) Tm\s*$/.exec(linea);
      if (tm) { x = Number(tm[1]); y = Number(tm[2]); continue; }
      const tj = /^\((.*)\)\s*Tj$/.exec(linea);
      if (tj) { textos.push({ pagina, x, y, t: decodificar(tj[1]) }); continue; }
      const arreglo = /^\[(.*)\]\s*TJ$/.exec(linea);
      if (arreglo) textos.push({ pagina, x, y, t: [...arreglo[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((m) => decodificar(m[1])).join("") });
    }
  }
  return textos.filter((t) => t.t.trim() !== "");
}

/** Renglones: misma página y misma altura (±1.5 puntos), de izquierda a derecha. */
function renglonesDe(textos: readonly Texto[]): Renglon[] {
  const ordenados = [...textos].sort((a, c) => a.pagina - c.pagina || c.y - a.y || a.x - c.x);
  const renglones: Renglon[] = [];
  for (const t of ordenados) {
    const r = renglones.at(-1);
    if (r && r.pagina === t.pagina && Math.abs(r.y - t.y) < 1.5) r.partes.push(t);
    else renglones.push({ pagina: t.pagina, y: t.y, partes: [t] });
  }
  return renglones;
}

const unir = (partes: readonly Texto[]) => partes.map((p) => p.t.trim()).join(" ").replace(/\s+/g, " ").trim();
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Columna de etiquetas (izquierda) y de valores (x ≥ 230) de la sección de identificación. */
const X_VALOR = 230;

/** Valor del renglón cuya etiqueta es `etiqueta` ("Denominación/Razón Social:"); null si no está o viene vacío. */
function valorDe(renglones: readonly Renglon[], etiqueta: string): string | null {
  const buscada = sinAcentos(etiqueta).replace(/\s+/g, " ");
  for (const r of renglones) {
    const izquierda = sinAcentos(unir(r.partes.filter((p) => p.x < X_VALOR)));
    if (izquierda === buscada) return unir(r.partes.filter((p) => p.x >= X_VALOR)) || null;
  }
  return null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaDma = (t: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/** "Régimen de las Personas Físicas con …" → palabras clave para comparar con el catálogo del SAT. */
const PALABRAS_VACIAS = new Set(["regimen", "de", "del", "la", "las", "los", "el", "y", "e"]);
const huella = (t: string) => sinAcentos(t).replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((p) => p && !PALABRAS_VACIAS.has(p)).join(" ");

export function codigoRegimen(nombre: string, catalogo: Readonly<Record<string, string>>): string | null {
  const buscada = huella(nombre);
  return Object.entries(catalogo).find(([, n]) => huella(n) === buscada)?.[0] ?? null;
}

/** Tabla "Regímenes:": entre su encabezado (Régimen · Fecha Inicio · Fecha Fin) y "Obligaciones:". */
function regimenesDe(renglones: readonly Renglon[], catalogo: Readonly<Record<string, string>>): RegimenConstancia[] {
  const inicio = renglones.findIndex((r) => {
    const t = sinAcentos(unir(r.partes));
    return t.startsWith("regimen") && t.includes("fecha inicio");
  });
  if (inicio < 0) return [];
  const filas: { nombre: string; fechas: string[] }[] = [];
  for (const r of renglones.slice(inicio + 1)) {
    if (sinAcentos(unir(r.partes)).startsWith("obligaciones")) break;
    const fechas = r.partes.map((p) => fechaDma(p.t.trim())).filter((f): f is string => f !== null);
    const nombre = unir(r.partes.filter((p) => !fechaDma(p.t.trim())));
    // Un nombre largo se parte en dos renglones: el de abajo no trae fechas.
    if (!fechas.length && filas.length) filas[filas.length - 1].nombre += ` ${nombre}`;
    else if (nombre) filas.push({ nombre, fechas });
  }
  return filas.map((f) => ({ codigo: codigoRegimen(f.nombre, catalogo), nombre: f.nombre, inicio: f.fechas[0] ?? null, fin: f.fechas[1] ?? null }));
}

export function leerConstancia(datos: Uint8Array, catalogo: Readonly<Record<string, string>>): { datos: Constancia } | { error: string } {
  if (Buffer.from(datos.subarray(0, 5)).toString("latin1") !== "%PDF-") return { error: NO_ES_PDF };
  const textos = textosDePdf(datos);
  if (!textos.length) return { error: ES_IMAGEN };
  const renglones = renglonesDe(textos);
  const todo = renglones.map((r) => unir(r.partes)).join("\n");
  if (!/CONSTANCIA DE SITUACI[ÓO]N FISCAL/i.test(todo)) return { error: NO_ES_CONSTANCIA };

  // La cadena original del sello trae la fecha y hora de emisión y el RFC: es lo más confiable.
  const cadena = /\|\|(\d{4})\/(\d{2})\/(\d{2}) [\d:]+\|([A-ZÑ&\d]{12,13})\|CONSTANCIA/.exec(todo);
  const rfc = cadena?.[4] ?? valorDe(renglones, "RFC:")?.replace(/\s/g, "") ?? null;
  if (!rfc) return { error: NO_ES_CONSTANCIA };

  let fecha_emision = cadena ? `${cadena[1]}-${cadena[2]}-${cadena[3]}` : null;
  if (!fecha_emision) {
    const lugar = new RegExp(`A (\\d{1,2}) DE (${MESES.join("|")}) DE (\\d{4})`, "i").exec(sinAcentos(todo).replace(/\n/g, " "));
    if (lugar) fecha_emision = `${lugar[3]}-${String(MESES.indexOf(lugar[2].toLowerCase()) + 1).padStart(2, "0")}-${lugar[1].padStart(2, "0")}`;
  }
  if (!fecha_emision) return { error: NO_ES_CONSTANCIA };

  const denominacion = valorDe(renglones, "Denominación/Razón Social:");
  const nombre = [valorDe(renglones, "Nombre (s):"), valorDe(renglones, "Primer Apellido:"), valorDe(renglones, "Segundo Apellido:")].filter(Boolean).join(" ");
  const razon_social = denominacion ?? nombre;
  if (!razon_social) return { error: NO_ES_CONSTANCIA };

  const renglonCp = renglones.find((r) => sinAcentos(unir(r.partes)).includes("codigo postal:"));
  const codigo_postal = renglonCp?.partes.map((p) => p.t.trim()).find((t) => /^\d{5}$/.test(t)) ?? null;

  return {
    datos: {
      tipo: denominacion ? "moral" : "fisica",
      rfc,
      razon_social,
      nombre_comercial: valorDe(renglones, "Nombre Comercial:"),
      codigo_postal,
      fecha_emision,
      regimenes: regimenesDe(renglones, catalogo),
    },
  };
}

/** Régimen que se propone para el proveedor: el primero vigente (sin fecha de fin) que esté en el catálogo, en el orden del SAT. */
export const regimenPropuesto = (c: Constancia) => c.regimenes.find((r) => !r.fin && r.codigo)?.codigo ?? null;
