import type { Envio, Evento } from "./tipos.ts";
export type Estadisticas = { destinatarios: number; aceptados: number; problema: number; pendientes: number; abrieron: number; clics: number; bajas: number;
  pctApertura: number; pctClic: number; porEnlace: { enlace: string; personas: number }[]; porHora: { hora: string; aperturas: number; clics: number }[];
  porEnvio: Record<string, { abrio: string | null; clic: string | null }> };
const horaMX = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:00`;
};
const sinUtm = (u: string) => { try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => k.startsWith("utm_")).forEach((k) => x.searchParams.delete(k)); return x.toString().replace(/\?$/, ""); } catch { return u; } };
/** Números de una campaña. Sin pruebas; clics sospechosos fuera; un clic real también cuenta como apertura. */
export function estadisticas(envios: Envio[], eventos: Evento[]): Estadisticas {
  const reales = envios.filter((e) => !e.es_prueba), ids = new Set(reales.map((e) => e.id)), acept = new Set(reales.filter((e) => e.estado === "aceptado").map((e) => e.id));
  const porEnvio: Estadisticas["porEnvio"] = Object.fromEntries(reales.map((e) => [e.id, { abrio: null, clic: null }]));
  const enlaces = new Map<string, Set<string>>(), horas = new Map<string, { aperturas: number; clics: number }>(), bajas = new Set<string>();
  for (const ev of [...eventos].sort((a, b) => a.creado_en.localeCompare(b.creado_en))) {
    if (!ids.has(ev.envio_id) || ev.sospechoso) continue;
    if (ev.tipo === "baja") { bajas.add(ev.envio_id); continue; }
    if (!acept.has(ev.envio_id)) continue;
    const p = porEnvio[ev.envio_id], h = horas.get(horaMX(ev.creado_en)) ?? { aperturas: 0, clics: 0 };
    if (!p.abrio) { p.abrio = ev.creado_en; h.aperturas++; }
    if (ev.tipo === "clic") {
      if (!p.clic) { p.clic = ev.creado_en; h.clics++; }
      const k = sinUtm(ev.enlace ?? ""); enlaces.set(k, (enlaces.get(k) ?? new Set()).add(ev.envio_id));
    }
    horas.set(horaMX(ev.creado_en), h);
  }
  const aceptados = reales.filter((e) => e.estado === "aceptado").length, valores = reales.filter((x) => x.estado === "aceptado").map((x) => porEnvio[x.id]);
  const abrieron = valores.filter((v) => v.abrio).length, clics = valores.filter((v) => v.clic).length;
  return {
    destinatarios: reales.length, aceptados, problema: reales.filter((e) => e.estado === "problema").length,
    pendientes: reales.filter((e) => e.estado === "pendiente" || e.estado === "procesando").length,
    abrieron, clics, bajas: bajas.size, pctApertura: aceptados ? abrieron / aceptados : 0, pctClic: aceptados ? clics / aceptados : 0,
    porEnlace: [...enlaces].map(([enlace, s]) => ({ enlace, personas: s.size })).sort((a, b) => b.personas - a.personas),
    porHora: [...horas].map(([hora, v]) => ({ hora, ...v })).filter((h) => h.aperturas || h.clics).sort((a, b) => a.hora.localeCompare(b.hora)),
    porEnvio,
  };
}
/** Lo que «reintentar» regresará a pendiente (problema y contacto aún activo) y cuántos de ellos vencieron sin respuesta de n8n, así que pudieron haber salido. */
export function reintentables(envios: Envio[]): { total: number; quizaSalieron: number } {
  const r = envios.filter((e) => !e.es_prueba && e.estado === "problema" && e.contacto?.estado === "activo");
  return { total: r.length, quizaSalieron: r.filter((e) => (e.detalle ?? "").startsWith("Sin respuesta de n8n;")).length };
}
