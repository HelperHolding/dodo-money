const PELIGROSOS = "script|iframe|object|textarea|noscript|xmp|noembed|noframes|plaintext";
const BLOQUES = new RegExp(`<(${PELIGROSOS})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const SIN_CIERRE = new RegExp(`<(${PELIGROSOS}|style|title)\\b(?![\\s\\S]*<\\/\\1)[\\s\\S]*$`, "i");
const TEXTO_CRUDO = /<(style|title)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
const COMENTARIO = /<!--[\s\S]*?-->/g;
const ETIQUETA = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^>])*>/g;
const ATRIBUTO = /[\s\/"']*([^\s"'<>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/y;
const URL_ATRIBUTOS = new Set(["href", "src", "action", "formaction", "xlink:href", "background", "poster", "data", "srcset"]);
const NOMBRADAS: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const HANDLER = /[\s\/"'=<]on[a-z]+\s*=/i;

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
const peligroso = (v: string) => valorNavegador(v).split(",").some((p) => /^(?:javascript|vbscript):|^data:text\/html/.test(p));

/** Limpia los atributos de una etiqueta; devuelve la etiqueta y cuánto quitó. Falla cerrado: lo dudoso se quita completo. */
function limpiarEtiqueta(tag: string): { tag: string; quitados: number } {
  const quitar = { tag: "", quitados: 1 };
  if (/^<embed\b/i.test(tag)) return quitar;
  const nombre = /^<[^\s\/>]*/.exec(tag)![0];
  const cortes: [number, number, string][] = [];
  ATRIBUTO.lastIndex = nombre.length;
  let fin = nombre.length;
  for (let m = ATRIBUTO.exec(tag); m; m = ATRIBUTO.exec(tag)) {
    fin = ATRIBUTO.lastIndex;
    const inicio = m.index + m[0].length - m[0].replace(/^[\s\/"']*/, "").length;
    const attr = m[1].toLowerCase(), valor = m[2] ?? "";
    if (/^["']/.test(valor) && /[<>]/.test(valor)) return quitar; // Canva escapa < y > como &lt; y &gt;
    if (/^on/.test(attr) || attr === "srcdoc") cortes.push([inicio, m.index + m[0].length, ""]);
    else if (URL_ATRIBUTOS.has(attr) && peligroso(valor)) cortes.push([inicio, m.index + m[0].length, `${m[1]}="#"`]);
  }
  if (!/^[\s/]*>$/.test(tag.slice(fin))) return quitar; // no se pudo leer toda la etiqueta
  let r = tag;
  for (const [a, b, nuevo] of cortes.reverse()) r = r.slice(0, a) + nuevo + r.slice(b);
  const sinValores = r.replace(/"[^"]*"|'[^']*'/g, '""'); // el texto de un valor entre comillas no es un atributo
  if (HANDLER.test(sinValores) || /(?:javascript|vbscript):/.test(valorNavegador(sinValores))) return quitar;
  return { tag: r, quitados: cortes.length };
}

/** Comentarios normales fuera; los condicionales de Outlook se conservan si no esconden nada ejecutable. */
function conservarComentario(c: string): boolean {
  const condicional = /^<!--\[if[^\]]*\]>[\s\S]*<!\[endif\]-->$/i.test(c) || /^<!--\[if[^\]]*\]><!-->$/i.test(c) || c === "<!--<![endif]-->";
  return condicional && !/--!>/.test(c) && !HANDLER.test(c) && !/(?:javascript|vbscript):/.test(valorNavegador(c));
}

function pasada(html: string): { html: string; quitados: number } {
  let quitados = 0;
  const cuenta = () => { quitados++; return ""; };
  let r = html.replace(COMENTARIO, (c) => (conservarComentario(c) ? c : cuenta()));
  r = r.replace(BLOQUES, cuenta);
  r = r.replace(SIN_CIERRE, cuenta);
  r = r.replace(TEXTO_CRUDO, (b, _n: string, dentro: string) => (/<[a-zA-Z\/]/.test(dentro) ? cuenta() : b));
  r = r.replace(ETIQUETA, (t) => { const l = limpiarEtiqueta(t); quitados += l.quitados; return l.tag; });
  return { html: r, quitados };
}

/**
 * Quita lo que los clientes de correo bloquean y que sería riesgoso en la vista previa.
 * Repite hasta que una pasada no cambia nada: quitar una pieza puede unir otras (`<scr<img ...>ipt>`),
 * así que el resultado es un punto fijo del limpiador. Si no se estabiliza, no se devuelve nada.
 */
export function limpiarHtml(html: string): { html: string; quitados: number } {
  let quitados = 0, r = html;
  for (let i = 0; i < 20; i++) {
    const p = pasada(r);
    quitados += p.quitados;
    if (p.html === r) return { html: r, quitados };
    r = p.html;
  }
  return { html: "", quitados: quitados + 1 };
}
