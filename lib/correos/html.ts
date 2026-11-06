/**
 * Limpieza del HTML que sube marketing (exportado de Canva) antes de guardarlo, verlo y enviarlo.
 *
 * Es un tokenizador lineal de una sola pasada que sigue los estados del tokenizador HTML de WHATWG
 * que importan aquí (datos, etiquetas, atributos con y sin comillas, comentarios, comentarios falsos,
 * texto crudo de script/style/title/textarea…). Así ve las etiquetas exactamente como el navegador.
 *
 * Invariante: la salida solo contiene piezas que el tokenizador leyó en estado de datos —texto (con `<`
 * escapado), etiquetas completas, comentarios condicionales de Outlook verificados, DOCTYPE y bloques
 * <style>/<title> sin marcado adentro—, así que el navegador vuelve a leer la salida igual que nosotros.
 * Lo que no cambia se copia byte por byte; solo se reescriben las etiquetas modificadas.
 */

/** Se quitan con su contenido; su contenido es texto crudo hasta su etiqueta de cierre (plaintext: hasta el final). */
const CRUDOS_PELIGROSOS = new Set(["script", "iframe", "noscript", "xmp", "noembed", "noframes", "textarea", "plaintext"]);
/** Etiquetas que se quitan solas (vacías, o de animación SVG que pueden poner javascript: en un href). */
const QUITAR_ETIQUETA = new Set(["embed", "base", "animate", "set", "animatemotion", "animatetransform"]);
/** Atributos que llevan una URL y se revisan contra javascript:, vbscript: y data:text/html. */
const URL_ATRIBUTOS = new Set(["href", "src", "action", "formaction", "xlink:href", "background", "poster", "data", "srcset", "lowsrc", "dynsrc"]);
const NOMBRADAS: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** Comentarios condicionales de Outlook: abre oculto, abre revelado y cierra revelado. */
const CONDICIONAL_OCULTO = /<!--\[if [a-z0-9 !()&|]+\]>/iy;
const CONDICIONAL_REVELADO = /<!--\[if [a-z0-9 !()&|]+\]><!-->/iy;
const CIERRE_REVELADO = "<!--<![endif]-->";
const CIERRE_OCULTO = "<![endif]-->";

type Atributo = { nombre: string; valor: string | null };
type Etiqueta = { nombre: string; atributos: Atributo[]; autocierre: boolean; fin: number };

const esEspacio = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";
const esLetra = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

/**
 * Lee una etiqueta desde el primer carácter de su nombre (después de `<` o `</`) siguiendo los estados de
 * nombre de etiqueta, atributos y valores. Devuelve null si el archivo termina dentro de la etiqueta
 * (el navegador la descarta).
 */
function leerEtiqueta(s: string, i: number): Etiqueta | null {
  const n = s.length;
  let j = i;
  while (j < n && !esEspacio(s[j]) && s[j] !== "/" && s[j] !== ">") j++;
  const etiqueta: Etiqueta = { nombre: s.slice(i, j), atributos: [], autocierre: false, fin: -1 };
  for (;;) {
    while (j < n && esEspacio(s[j])) j++; // antes del nombre del atributo
    if (j >= n) return null;
    if (s[j] === ">") { etiqueta.fin = j + 1; return etiqueta; }
    if (s[j] === "/") { // se cierra sola; si no sigue `>`, se vuelve a leer como inicio de atributo
      j++;
      if (s[j] === ">") { etiqueta.autocierre = true; etiqueta.fin = j + 1; return etiqueta; }
      continue;
    }
    const inicio = j++; // el primer carácter siempre es del nombre, aunque sea `=`, `"`, `'` o `<`
    while (j < n && !esEspacio(s[j]) && s[j] !== "/" && s[j] !== ">" && s[j] !== "=") j++;
    const nombre = s.slice(inicio, j);
    while (j < n && esEspacio(s[j])) j++; // después del nombre
    if (s[j] !== "=") { etiqueta.atributos.push({ nombre, valor: null }); continue; }
    j++;
    while (j < n && esEspacio(s[j])) j++; // antes del valor
    if (j >= n) return null;
    const q = s[j];
    if (q === '"' || q === "'") {
      const cierre = s.indexOf(q, j + 1);
      if (cierre < 0) return null;
      etiqueta.atributos.push({ nombre, valor: s.slice(j + 1, cierre) });
      j = cierre + 1;
    } else if (q === ">") {
      etiqueta.atributos.push({ nombre, valor: "" });
      etiqueta.fin = j + 1;
      return etiqueta;
    } else { // sin comillas: `"`, `'`, `<`, `=` y ` son parte del valor; termina en espacio o `>`
      const inicioValor = j;
      while (j < n && !esEspacio(s[j]) && s[j] !== ">") j++;
      etiqueta.atributos.push({ nombre, valor: s.slice(inicioValor, j) });
    }
  }
}

/** Fin de un comentario `<!--` que empieza en i, donde lo cierra el navegador (`-->`, `--!>`, `<!-->`, `<!--->`). */
function finComentario(s: string, i: number): number {
  const j = i + 4;
  if (s[j] === ">") return j + 1;
  if (s[j] === "-" && s[j + 1] === ">") return j + 2;
  for (let k = s.indexOf("--", j); k >= 0; k = s.indexOf("--", k + 1)) {
    if (s[k + 2] === ">") return k + 3;
    if (s[k + 2] === "!" && s[k + 3] === ">") return k + 4;
  }
  return s.length;
}

/** Cierre de un elemento de texto crudo: `</nombre` sin importar mayúsculas, seguido de espacio, `/` o `>`. */
function cierreTextoCrudo(s: string, desde: number, nombre: string): { inicio: number; etiqueta: Etiqueta | null } | null {
  for (let k = s.indexOf("</", desde); k >= 0; k = s.indexOf("</", k + 2)) {
    const despues = s[k + 2 + nombre.length];
    if (s.slice(k + 2, k + 2 + nombre.length).toLowerCase() === nombre && (esEspacio(despues) || despues === "/" || despues === ">"))
      return { inicio: k, etiqueta: leerEtiqueta(s, k + 2) };
  }
  return null;
}

/** Valor de un atributo como lo vería el navegador: entidades resueltas y sin caracteres de control ni espacios. */
function valorNavegador(v: string): string {
  const dec = v.replace(/&#x([0-9a-f]+);?|&#(\d+);?|&([a-z]+);/gi, (m, h: string, d: string, n: string) => {
    if (n) return NOMBRADAS[n.toLowerCase()] ?? m;
    const cp = h ? parseInt(h, 16) : parseInt(d, 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  });
  return dec.replace(/[\u0000-\u0020\u007f-\u00a0\u1680\u180e\u2000-\u200f\u2028\u2029\u205f\u3000\ufeff]/g, "").toLowerCase();
}
const ESQUEMA_PELIGROSO = /^(?:javascript:|vbscript:|data:text\/html)/;
const urlPeligrosa = (valor: string, lista: boolean) => {
  const v = valorNavegador(valor);
  return lista ? v.split(",").some((p) => ESQUEMA_PELIGROSO.test(p)) : ESQUEMA_PELIGROSO.test(v);
};

/** Quita on*, srcdoc y URLs ejecutables (cambiadas por "#"); devuelve los atributos que quedan y cuántos cambió. */
function limpiarAtributos(atributos: Atributo[]): { atributos: Atributo[]; cambios: number } {
  const quedan: Atributo[] = [];
  let cambios = 0;
  for (const a of atributos) {
    const nombre = a.nombre.toLowerCase();
    if (nombre.startsWith("on") || nombre === "srcdoc") cambios++;
    else if (URL_ATRIBUTOS.has(nombre) && a.valor !== null && urlPeligrosa(a.valor, nombre === "srcset")) { cambios++; quedan.push({ nombre: a.nombre, valor: "#" }); }
    else quedan.push(a);
  }
  return { atributos: quedan, cambios };
}

/**
 * Reescribe una etiqueta modificada con valores entre comillas dobles. El valor va tal como venía: sus
 * referencias `&...` ya están escritas y se resuelven igual; solo se escapan `"`, `<` y `>`.
 */
function serializar(nombre: string, atributos: Atributo[], autocierre: boolean): string {
  const attrs = atributos.map((a) => (a.valor === null ? ` ${a.nombre}` : ` ${a.nombre}="${a.valor.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`));
  return `<${nombre}${attrs.join("")}${autocierre ? " /" : ""}>`;
}

/** Quita lo que los clientes de correo bloquean y que sería riesgoso en la vista previa. Tiempo lineal. */
export function limpiarHtml(html: string): { html: string; quitados: number } {
  const s = html, n = s.length;
  let salida = "", quitados = 0;
  let enObjeto = 0; // profundidad dentro de <object>: su contenido se lee pero no se emite
  let condicional: { salida: number; quitados: number } | null = null; // dentro de <!--[if ...]> … <![endif]-->
  const emitir = (t: string) => { if (enObjeto === 0) salida += t; };
  const quitar = (cuantos = 1) => { if (enObjeto === 0) quitados += cuantos; };
  const emitirEtiqueta = (inicio: number, e: Etiqueta) => {
    const l = limpiarAtributos(e.atributos);
    if (l.cambios) { quitar(l.cambios); emitir(serializar(e.nombre, l.atributos, e.autocierre)); } else emitir(s.slice(inicio, e.fin));
  };
  /** Las etiquetas de cierre con atributos (el navegador los ignora) se reescriben sin ellos. */
  const emitirCierre = (inicio: number, e: Etiqueta) => {
    if (e.atributos.length === 0) emitir(s.slice(inicio, e.fin));
    else { quitar(); emitir(`</${e.nombre}>`); }
  };
  /** Un nombre de etiqueta con `<` (`<scr<script>`) no se acepta: ese primer `<` queda como texto. */
  const nombreConMenor = (desde: number) => {
    let j = desde;
    while (j < n && !esEspacio(s[j]) && s[j] !== "/" && s[j] !== ">" && s[j] !== "<") j++;
    return s[j] === "<";
  };

  let i = 0;
  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt < 0) { emitir(s.slice(i)); break; }
    if (lt > i) emitir(s.slice(i, lt));
    i = lt;
    const c = s[i + 1];

    if (esLetra(c)) { // etiqueta de apertura
      if (nombreConMenor(i + 1)) { emitir("&lt;"); i++; continue; }
      const e = leerEtiqueta(s, i + 1);
      if (!e) { quitar(); break; } // el archivo termina dentro de la etiqueta
      const nombre = e.nombre.toLowerCase();
      if (CRUDOS_PELIGROSOS.has(nombre)) {
        quitar();
        const cierre = nombre === "plaintext" ? null : cierreTextoCrudo(s, e.fin, nombre);
        i = cierre?.etiqueta ? cierre.etiqueta.fin : n;
        continue;
      }
      if (nombre === "style" || nombre === "title") {
        const cierre = cierreTextoCrudo(s, e.fin, nombre);
        if (!cierre?.etiqueta) { quitar(); break; } // sin cierre: todo lo demás sería su texto
        const dentro = s.slice(e.fin, cierre.inicio);
        // Algo que parece marcado adentro (y que en SVG sí sería marcado): fuera completo.
        if (/<[a-zA-Z\/!]/.test(dentro)) { quitar(); i = cierre.etiqueta.fin; continue; }
        emitirEtiqueta(i, e);
        emitir(dentro);
        emitirCierre(cierre.inicio, cierre.etiqueta);
        i = cierre.etiqueta.fin;
        continue;
      }
      if (nombre === "object") { quitar(); enObjeto++; i = e.fin; continue; }
      const refresh = nombre === "meta" && e.atributos.some((a) => a.nombre.toLowerCase() === "http-equiv" && valorNavegador(a.valor ?? "") === "refresh");
      if (QUITAR_ETIQUETA.has(nombre) || refresh) { quitar(); i = e.fin; continue; }
      emitirEtiqueta(i, e);
      i = e.fin;
      continue;
    }

    if (c === "/") { // etiqueta de cierre
      const d = s[i + 2];
      if (esLetra(d)) {
        if (nombreConMenor(i + 2)) { emitir("&lt;"); i++; continue; }
        const e = leerEtiqueta(s, i + 2);
        if (!e) { quitar(); break; }
        const nombre = e.nombre.toLowerCase();
        if (nombre === "object" && enObjeto > 0) enObjeto--;
        else if (nombre === "object" || CRUDOS_PELIGROSOS.has(nombre) || QUITAR_ETIQUETA.has(nombre)) quitar(); // cierre suelto de algo que se quita
        else emitirCierre(i, e);
        i = e.fin;
        continue;
      }
      if (d === ">") { i += 3; continue; } // `</>` no produce nada
      if (d === undefined) { emitir("&lt;/"); break; }
      const fin = s.indexOf(">", i + 2); // comentario falso `</3 ...>`
      quitar();
      i = fin < 0 ? n : fin + 1;
      continue;
    }

    if (c === "!") {
      if (s.startsWith("<!--", i)) {
        if (!condicional && enObjeto === 0) {
          CONDICIONAL_REVELADO.lastIndex = i;
          if (CONDICIONAL_REVELADO.test(s)) { emitir(s.slice(i, CONDICIONAL_REVELADO.lastIndex)); i = CONDICIONAL_REVELADO.lastIndex; continue; }
          if (s.startsWith(CIERRE_REVELADO, i)) { emitir(CIERRE_REVELADO); i += CIERRE_REVELADO.length; continue; }
          CONDICIONAL_OCULTO.lastIndex = i;
          if (CONDICIONAL_OCULTO.test(s)) { // su contenido se sigue leyendo y limpiando: Outlook lo muestra
            condicional = { salida: salida.length, quitados };
            emitir(s.slice(i, CONDICIONAL_OCULTO.lastIndex));
            i = CONDICIONAL_OCULTO.lastIndex;
            continue;
          }
        }
        quitar(); // comentario normal
        i = finComentario(s, i);
        continue;
      }
      const fin = s.indexOf(">", i + 2); // DOCTYPE o comentario falso (`<!x>`, `<![CDATA[`, `<![endif]-->`)
      const pieza = s.slice(i, fin < 0 ? n : fin + 1);
      i = fin < 0 ? n : fin + 1;
      if (condicional && pieza === CIERRE_OCULTO) {
        enObjeto = 0; // un <object> abierto dentro del condicional termina con él
        salida += pieza;
        // Para el navegador todo el bloque debe ser un solo comentario que cierra justo al final; si no, fuera.
        const bloque = salida.slice(condicional.salida);
        if (finComentario(bloque, 0) !== bloque.length) { salida = salida.slice(0, condicional.salida); quitados = condicional.quitados + 1; }
        condicional = null;
      } else if (fin >= 0 && /^<!doctype[\s>]/i.test(pieza)) emitir(pieza);
      else quitar();
      continue;
    }

    if (c === "?") { // comentario falso `<?x>`
      const fin = s.indexOf(">", i + 2);
      quitar();
      i = fin < 0 ? n : fin + 1;
      continue;
    }

    emitir("&lt;"); // `<` que no abre nada: escapado, para que quitar lo que sigue no lo pegue a otra cosa
    i++;
  }
  if (condicional) { salida = salida.slice(0, condicional.salida); quitados = condicional.quitados + 1; } // condicional sin cerrar
  return { html: salida, quitados };
}
