// @ts-expect-error Node strip-types requiere extensión explícita.
import { NOMBRE_ROL } from "../roles.ts";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { PRIORIDADES, TIPOS, clave } from "../soporte.ts";
import type { Prioridad, TipoTicket } from "../soporte";
import type { Rol } from "../tipos";

/** Una fila de soporte_tomar_avisos. */
export type AvisoTomado = {
  aviso_id: string; para: string; evento: "nuevo" | "comentario"; numero: number; tipo: TipoTicket; titulo: string; descripcion: string;
  seccion: string; prioridad: Prioridad; sucursal: string | null; creador: string; rol_creador: string; con_captura: boolean;
  comentario: string | null; autor_comentario: string | null;
};

export const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const parrafo = (s: string) => escapar(s).replace(/\r?\n/g, "<br>");
const unaLinea = (s: string) => s.replace(/\s+/g, " ").trim();

/** Correo para soporte: asunto con la clave, datos del ticket y botón al detalle. `base` = origen https de la app. */
export function armarCorreo(a: AvisoTomado, base: string): { asunto: string; html: string; texto: string } {
  const k = clave(Number(a.numero)), url = `${base}/soporte/${Number(a.numero)}`;
  const asunto = unaLinea(a.evento === "nuevo" ? `[${k}] ${TIPOS[a.tipo]} · ${a.seccion} · ${a.titulo}` : `[${k}] Comentario de ${a.autor_comentario ?? "quien reporta"}`).slice(0, 200);
  const quien = `${a.creador} · ${NOMBRE_ROL[a.rol_creador as Rol] ?? a.rol_creador} · ${a.sucursal ?? "Oficina"}`;
  const filas: [string, string][] = [["Ticket", `${k} · ${a.titulo}`], ["Tipo", TIPOS[a.tipo]], ["Sección", a.seccion], ["Prioridad", PRIORIDADES[a.prioridad]], ["Levantó", quien]];
  const cuerpo = a.evento === "comentario" ? a.comentario ?? "" : a.descripcion;
  const titulo = a.evento === "comentario" ? `Comentario de ${a.autor_comentario ?? "quien reporta"}` : `Nuevo ticket: ${TIPOS[a.tipo].toLowerCase()}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#2b2b2b;max-width:560px">
<h2 style="color:#ff6900;margin:0 0 12px">${escapar(titulo)}</h2>
<table style="border-collapse:collapse;margin-bottom:12px">${filas.map(([e, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#777">${escapar(e)}</td><td style="padding:2px 0">${escapar(v)}</td></tr>`).join("")}</table>
<p style="background:#fff4ec;border-radius:8px;padding:12px;margin:0 0 12px">${parrafo(cuerpo)}</p>
${a.con_captura && a.evento === "nuevo" ? `<p style="margin:0 0 12px;color:#777">Trae captura de pantalla (se ve en el ticket).</p>` : ""}
<p><a href="${escapar(url)}" style="background:#ff6900;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir ticket</a></p>
<p style="color:#999;font-size:12px">Help Desk de DODO MX. Los avisos se configuran en Help Desk → Ajustes.</p>
</div>`;
  const texto = `${titulo}\n\n${filas.map(([e, v]) => `${e}: ${v}`).join("\n")}\n\n${cuerpo}\n\nAbrir ticket: ${url}`;
  return { asunto, html, texto };
}
