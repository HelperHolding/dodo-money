const BLOQUES = /<(script|iframe|object)\b[\s\S]*?<\/\1\s*>/gi;
const SIN_CIERRE = /<(?:script|iframe|object)\b[\s\S]*$/i;
const ETIQUETA = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^>])*>/g;
const ATRIBUTO = /[\s\/"']*([^\s"'<>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/y;
const URL_ATRIBUTOS = new Set(["href", "src", "action", "formaction", "xlink:href", "background", "poster"]);
const NOMBRADAS: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Valor de un atributo como lo vería el navegador: sin comillas, con entidades resueltas y sin caracteres de control. */
function valorNavegador(v: string): string {
  const sinComillas = /^(["'])([\s\S]*)\1$/.exec(v)?.[2] ?? v;
  const dec = sinComillas.replace(/&#x([0-9a-f]+);?|&#(\d+);?|&([a-z]+);/gi, (m, h: string, d: string, n: string) => {
    if (n) return NOMBRADAS[n.toLowerCase()] ?? m;
    const cp = h ? parseInt(h, 16) : parseInt(d, 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  });
  return dec.replace(/[\u0000- \u007f- ​﻿]/g, "").toLowerCase();
}
const peligroso = (v: string) => /^(?:javascript|vbscript):|^data:text\/html/.test(valorNavegador(v));

/** Limpia los atributos de una etiqueta; devuelve la etiqueta y cuánto quitó. */
function limpiarEtiqueta(tag: string): { tag: string; quitados: number } {
  if (/^<embed\b/i.test(tag)) return { tag: "", quitados: 1 };
  const nombre = /^<[^\s\/>]*/.exec(tag)![0];
  const cortes: [number, number, string][] = [];
  ATRIBUTO.lastIndex = nombre.length;
  let fin = nombre.length;
  for (let m = ATRIBUTO.exec(tag); m; m = ATRIBUTO.exec(tag)) {
    fin = ATRIBUTO.lastIndex;
    const inicio = m.index + m[0].length - m[0].replace(/^[\s\/"']*/, "").length;
    const attr = m[1].toLowerCase(), valor = m[2] ?? "";
    if (/^on/.test(attr) || attr === "srcdoc") cortes.push([inicio, m.index + m[0].length, ""]);
    else if (URL_ATRIBUTOS.has(attr) && peligroso(valor)) cortes.push([inicio, m.index + m[0].length, `${m[1]}="#"`]);
  }
  // Falla cerrado: si no se pudo leer toda la etiqueta, o aún parece ejecutable, se quita completa.
  if (!/^[\s/]*>$/.test(tag.slice(fin))) return { tag: "", quitados: 1 };
  let r = tag;
  for (const [a, b, nuevo] of cortes.reverse()) r = r.slice(0, a) + nuevo + r.slice(b);
  const sinValores = r.replace(/"[^"]*"|'[^']*'/g, '""'); // el texto de un valor entre comillas no es un atributo
  if (/[\s/"'=<]on[a-z]+\s*=/i.test(sinValores) ||/(?:javascript|vbscript):/.test(valorNavegador(r))) return { tag: "", quitados: 1 };
  return { tag: r, quitados: cortes.length };
}

/** Quita lo que los clientes de correo bloquean y que sería riesgoso en la vista previa. */
export function limpiarHtml(html: string): { html: string; quitados: number } {
  let quitados = 0, r = html;
  for (let previo = ""; previo !== r;) { previo = r; r = r.replace(BLOQUES, () => { quitados++; return ""; }); }
  r = r.replace(SIN_CIERRE, () => { quitados++; return ""; });
  r = r.replace(ETIQUETA, (t) => { const l = limpiarEtiqueta(t); quitados += l.quitados; return l.tag; });
  return { html: r, quitados };
}
