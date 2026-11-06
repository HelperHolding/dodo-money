import type { Envio } from "./tipos.ts";
import type { Estadisticas } from "./estadisticas.ts";
/** RFC 4180; contra inyección de fórmulas en Excel, un apóstrofo delante de lo que empiece con = + - @ tab o retorno de carro. */
const celda = (v: string | null) => {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function csvDestinatarios(envios: Envio[], porEnvio: Estadisticas["porEnvio"]): string {
  const filas = envios.filter((e) => !e.es_prueba).map((e) => [e.email, e.estado, e.enviado_en, porEnvio[e.id]?.abrio ?? null, porEnvio[e.id]?.clic ?? null, e.detalle].map(celda).join(","));
  return "﻿" + ["correo,estado,enviado,abrio,clic,detalle", ...filas].join("\r\n") + "\r\n";
}
