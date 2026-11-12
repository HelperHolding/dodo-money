import type { EstadoCampana, EstadoEnvio } from "./tipos";

/** Tonos de estado de la app (app/marca.css: .estado[data-tono]); cada uno trae su fondo y texto de día y de noche. */
export type Tono = "ok" | "aviso" | "alerta" | "info" | "neutro";

export const TONO_ESTADO: Record<EstadoCampana, Tono> = {
  borrador: "neutro", programada: "info", enviando: "aviso", detenida: "alerta", enviada: "ok", cancelada: "alerta",
};
export const TONO_ENVIO: Record<EstadoEnvio, Tono> = { pendiente: "neutro", procesando: "aviso", aceptado: "ok", problema: "alerta" };
export const NOMBRE_ENVIO: Record<EstadoEnvio, string> = { pendiente: "Pendiente", procesando: "Enviando", aceptado: "Aceptado", problema: "Con problema" };

/** Enlace legible en una tabla: sin protocolo, sin «www.» y sin diagonal final. Lo que no es http(s) se deja igual. */
export function enlaceCorto(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    return `${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Barras de actividad por hora (aperturas + clics) para BarrasVerticales. `hora` viene como «AAAA-MM-DD HH:00» (hora de México).
 * Si hay más de un día, el rótulo lleva el día para no confundir horas iguales.
 */
export function barrasPorHora(porHora: readonly { hora: string; aperturas: number; clics: number }[]) {
  const orden = [...porHora].sort((a, b) => a.hora.localeCompare(b.hora));
  const variosDias = new Set(orden.map((h) => h.hora.slice(0, 10))).size > 1;
  return orden.map((h) => {
    const dia = Number(h.hora.slice(8, 10)), mes = MESES[Number(h.hora.slice(5, 7)) - 1], hora = h.hora.slice(11, 16);
    return {
      clave: h.hora,
      rotulo: variosDias ? `${dia} · ${Number(hora.slice(0, 2))}h` : hora,
      valor: h.aperturas + h.clics,
      detalle: `${dia} ${mes}, ${hora} · ${plural(h.aperturas, "apertura", "aperturas")} · ${plural(h.clics, "clic", "clics")}`,
    };
  });
}
