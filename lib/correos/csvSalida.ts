import type { Envio } from "./tipos.ts";
import type { Estadisticas } from "./estadisticas.ts";
/** RFC 4180; contra inyección de fórmulas en Excel, un apóstrofo delante de lo que empiece con = + - @ tab o retorno de carro. */
const celda = (v: string | null) => {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** ISO UTC → "YYYY-MM-DD HH:mm" en hora de México. */
const fechaMX = (iso: string | null) => {
  if (!iso) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};
export function csvDestinatarios(envios: Envio[], porEnvio: Estadisticas["porEnvio"]): string {
  const filas = envios.filter((e) => !e.es_prueba).map((e) => [e.email, e.estado, fechaMX(e.enviado_en), fechaMX(porEnvio[e.id]?.abrio ?? null), fechaMX(porEnvio[e.id]?.clic ?? null), e.detalle].map(celda).join(","));
  return "﻿" + ["correo,estado,enviado,abrio,clic,detalle", ...filas].join("\r\n") + "\r\n";
}
