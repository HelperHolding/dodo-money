// @ts-expect-error Node strip-types requiere extensión explícita.
import { NOMBRE_ROL } from "../roles.ts";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { PRIORIDADES, TIPOS, clave } from "../soporte.ts";
import type { Prioridad, TipoTicket } from "../soporte";
import type { Rol } from "../tipos";

/** Una fila de soporte_tomar_avisos. */
export type AvisoTomado = {
  aviso_id: string; para: string; evento: "nuevo" | "comentario" | "escalado"; numero: number; tipo: TipoTicket; titulo: string; descripcion: string;
  seccion: string; prioridad: Prioridad; sucursal: string | null; creador: string; rol_creador: string; con_captura: boolean;
  comentario: string | null; autor_comentario: string | null;
};

export const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const parrafo = (s: string) => escapar(s).replace(/\r?\n/g, "<br>");
const unaLinea = (s: string) => s.replace(/\s+/g, " ").trim();

/** Correo para soporte: asunto con la clave, datos del ticket y botón al detalle. `base` = origen https de la app. */
export function armarCorreo(a: AvisoTomado, base: string): { asunto: string; html: string; texto: string } {
  const k = clave(Number(a.numero)), url = `${base}/soporte/${Number(a.numero)}`;
  const esc = a.evento === "escalado";
  const asunto = unaLinea(
    a.evento === "nuevo" ? `[${k}] ${TIPOS[a.tipo]} · ${a.seccion} · ${a.titulo}`
    : esc ? `[${k}] ${a.tipo === "mejora" ? "Mejora" : "Te necesita"}: ${a.titulo}`
    : `[${k}] Comentario de ${a.autor_comentario ?? "quien reporta"}`).slice(0, 200);
  const quien = `${a.creador} · ${NOMBRE_ROL[a.rol_creador as Rol] ?? a.rol_creador} · ${a.sucursal ?? "Oficina"}`;
  const filas: [string, string][] = [["Ticket", `${k} · ${a.titulo}`], ["Tipo", TIPOS[a.tipo]], ["Sección", a.seccion], ["Prioridad", PRIORIDADES[a.prioridad]], ["Levantó", quien]];
  const cuerpo = a.evento === "comentario" ? a.comentario ?? "" : a.descripcion;
  const titulo = a.evento === "comentario" ? `Comentario de ${a.autor_comentario ?? "quien reporta"}`
    : esc ? (a.tipo === "mejora" ? "Mejora propuesta (ordenada por el agente)" : "El agente te necesita") : `Nuevo ticket: ${TIPOS[a.tipo].toLowerCase()}`;
  const diagnostico = esc && a.comentario ? a.comentario : null;
  const html = `<div style="font-family:Arial,sans-serif;color:#2b2b2b;max-width:560px">
<h2 style="color:#ff6900;margin:0 0 12px">${escapar(titulo)}</h2>
<table style="border-collapse:collapse;margin-bottom:12px">${filas.map(([e, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#777">${escapar(e)}</td><td style="padding:2px 0">${escapar(v)}</td></tr>`).join("")}</table>
<p style="background:#fff4ec;border-radius:8px;padding:12px;margin:0 0 12px">${parrafo(cuerpo)}</p>
${diagnostico ? `<h3 style="margin:0 0 6px;font-size:15px">Diagnóstico del agente</h3><p style="background:#eef6ff;border-radius:8px;padding:12px;margin:0 0 12px">${parrafo(diagnostico)}</p>` : ""}
${a.con_captura && a.evento !== "comentario" ? `<p style="margin:0 0 12px;color:#777">Trae captura de pantalla (se ve en el ticket).</p>` : ""}
<p><a href="${escapar(url)}" style="background:#ff6900;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir ticket</a></p>
<p style="color:#999;font-size:12px">Help Desk de DODO MX. Los avisos se configuran en Help Desk → Ajustes.</p>
</div>`;
  const texto = `${titulo}\n\n${filas.map(([e, v]) => `${e}: ${v}`).join("\n")}\n\n${cuerpo}${diagnostico ? `\n\nDiagnóstico del agente:\n${diagnostico}` : ""}\n\nAbrir ticket: ${url}`;
  return { asunto, html, texto };
}

export type FilaResumen = { numero: number; titulo: string; tipo: TipoTicket; creador: string; sucursal: string | null; respuesta: string | null; reabierto: boolean };

/** Resumen diario de lo que resolvió el agente: un correo por destinatario; nada si no hubo tickets. */
export function armarResumen(filas: FilaResumen[], base: string, correos: string[], fecha: string): { para: string; asunto: string; html: string; texto: string }[] {
  if (filas.length === 0 || correos.length === 0) return [];
  const asunto = `Help Desk: el agente resolvió ${filas.length} ticket${filas.length === 1 ? "" : "s"} · ${fecha}`;
  const linea = (f: FilaResumen) => `${clave(f.numero)} · ${f.titulo} · ${f.creador} · ${f.sucursal ?? "Oficina"}${f.reabierto ? " (reabierto)" : ""}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#2b2b2b;max-width:600px">
<h2 style="color:#ff6900;margin:0 0 12px">${escapar(asunto)}</h2>
${filas.map((f) => `<div style="border:1px solid #eee;border-radius:8px;padding:12px;margin:0 0 10px">
<p style="margin:0 0 6px"><a href="${escapar(`${base}/soporte/${f.numero}`)}" style="color:#b83800;font-weight:bold">${escapar(clave(f.numero))}</a> · ${escapar(f.titulo)}${f.reabierto ? ` <span style="background:#fff0c7;color:#795200;border-radius:6px;padding:1px 6px;font-size:12px">Reabierto</span>` : ""}</p>
<p style="margin:0 0 6px;color:#777;font-size:13px">${escapar(f.creador)} · ${escapar(f.sucursal ?? "Oficina")}</p>
<p style="margin:0">${parrafo(f.respuesta ?? "")}</p></div>`).join("")}
<p style="color:#999;font-size:12px">Help Desk de DODO MX. El resumen se apaga en Help Desk → Ajustes.</p>
</div>`;
  const texto = `${asunto}\n\n${filas.map((f) => `${linea(f)}\n${f.respuesta ?? ""}`).join("\n\n")}`;
  return correos.map((para) => ({ para, asunto, html, texto }));
}
