type Fila = { email: string; nombre: string | null; etiquetas: string[] };
/** Misma normalización que la base: quita espacios, NBSP, BOM y ZWSP de las orillas y pasa a minúsculas. */
const INVISIBLES = /^[\s ﻿​]+|[\s ﻿​]+$/g;
const normalizar = (s: string) => s.replace(INVISIBLES, "").toLowerCase();
function celdas(linea: string, sep: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (q) { if (ch === '"' && linea[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out.map((c) => c.replace(INVISIBLES, ""));
}
/** CSV de contactos: columnas correo/email (obligatoria), nombre, etiquetas (separadas por ; o ,). Sin correos repetidos. */
export function leerCsvContactos(texto: string): { filas: Fila[]; error?: string } {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return { filas: [], error: "El archivo está vacío." };
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = celdas(lineas[0], sep).map((c) => c.toLowerCase());
  const iC = cab.findIndex((c) => c === "correo" || c === "email" || c === "e-mail"), iN = cab.indexOf("nombre"), iE = cab.indexOf("etiquetas");
  if (iC < 0) return { filas: [], error: "Falta la columna correo (o email)." };
  const porCorreo = new Map<string, Fila>();
  for (const l of lineas.slice(1)) {
    const c = celdas(l, sep);
    const email = normalizar(c[iC] ?? "");
    if (email === "") continue;
    const etiquetas = iE >= 0 ? (c[iE] ?? "").split(/[;,]/).map(normalizar).filter(Boolean) : [];
    const nombre = iN >= 0 && c[iN] ? c[iN] : null;
    const previa = porCorreo.get(email);
    if (!previa) { porCorreo.set(email, { email, nombre, etiquetas: [...new Set(etiquetas)] }); continue; }
    previa.nombre ??= nombre;
    previa.etiquetas = [...new Set([...previa.etiquetas, ...etiquetas])];
  }
  return { filas: [...porCorreo.values()] };
}
