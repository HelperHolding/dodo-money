// @ts-expect-error Node strip-types requiere extensión explícita.
import { dominioPermitido } from "./destino.ts";
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const decodificar = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0*39;|&#x0*27;|&apos;/gi, "'").replace(/&#0*38;|&#x0*26;/gi, "&").replace(/&amp;/g, "&");
/** Solo https sin usuario/contraseña a un dominio permitido: lo mismo que el redirector de clics acepta (destinoClic). */
function seguible(url: string, extra: string[]): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  try { const u = new URL(url); return !u.username && !u.password && dominioPermitido(u.hostname, extra); } catch { return false; }
}

/** HTML listo para un destinatario: enlaces a dominios permitidos (Dodo + `extra`) pasan por el seguimiento, píxel de apertura y pie de baja. */
export function prepararCorreo(html: string, token: string, base: string, asunto: string, extra: string[]): { html: string; texto: string } {
  const b = base.replace(/\/+$/, ""), t = encodeURIComponent(token);
  const enlaces: string[] = [];
  const conClics = html.replace(/(?<![\w-])href\s*=\s*(["'])(.*?)\1/gi, (todo, _q: string, url: string) => {
    const real = decodificar(url.trim());
    if (!seguible(real, extra)) return todo;
    if (!enlaces.includes(real)) enlaces.push(real);
    return `href="${b}/api/correos/c/${t}?u=${encodeURIComponent(real)}"`;
  });
  const baja = `${b}/baja/${t}`;
  const pie = `<img src="${b}/api/correos/a/${t}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
    + `<p style="margin:16px 0;font:12px Arial,Helvetica,sans-serif;color:#777;text-align:center">Si ya no quieres recibir estos correos, <a href="${escapar(baja)}" style="color:#777">date de baja aquí</a>.</p>`;
  const i = conClics.search(/<\/body>/i);
  const final = i >= 0 ? conClics.slice(0, i) + pie + conClics.slice(i) : conClics + pie;
  const texto = [asunto, "", ...enlaces, "", `Darte de baja: ${baja}`].join("\n");
  return { html: final, texto };
}
