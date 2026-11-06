/** Quita lo que los clientes de correo bloquean y que sería riesgoso en la vista previa. */
export function limpiarHtml(html: string): { html: string; quitados: number } {
  let quitados = 0;
  const contar = (re: RegExp, s: string) => s.replace(re, () => { quitados++; return ""; });
  let r = contar(/<script\b[\s\S]*?<\/script\s*>/gi, html);
  r = contar(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, r);
  r = r.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, (_m, attr: string) => { quitados++; return `${attr}="#"`; });
  return { html: r, quitados };
}
