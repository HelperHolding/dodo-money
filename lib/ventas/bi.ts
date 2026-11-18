// @ts-expect-error Node strip-types requiere extensión explícita.
import { categoriaRappi } from "./rappiProductos.ts";

export type Relativa = "hoy" | "ayer" | "esta_semana" | "semana_pasada" | "este_mes" | "mes_pasado" | "este_anio" | "anio_pasado";
export const RELATIVAS: readonly [Relativa, string][] = [["hoy", "Hoy"], ["ayer", "Ayer"], ["esta_semana", "Esta semana"], ["semana_pasada", "Semana pasada"],
  ["este_mes", "Este mes"], ["mes_pasado", "Mes pasado"], ["este_anio", "Este año"], ["anio_pasado", "Año pasado"]];
export const ORIGENES_BI = ["mostrador", "kiosco", "app", "sitio", "agregador", "rappi"] as const;
export const TIPOS_BI = ["en_tienda", "entrega", "para_llevar"] as const;
export const PAGOS_BI = ["efectivo", "tarjeta", "en_linea", "rappi", "otro"] as const;
export const CATEGORIAS_BI = ["pizza", "snack", "postre", "bebida", "combo", "otro", "sin_categoria"] as const;
export const EDADES_BI = { "0-6": [0, 6], "6-12": [6, 12], "12-24": [12, 24], "24+": [24, null] } as const;
export type FiltrosBI = { rel: Relativa | null; desde: string; hasta: string; comp: "anterior" | "anio"; suc: string[]; rfc: string | null;
  edad: keyof typeof EDADES_BI | null; canal: "pos" | "rappi" | null; origen: string[]; tipo: string[]; dia: number[]; hora: [number, number] | null;
  cat: string[]; prod: string | null; pago: string[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const mas = (s: string, dias: number) => { const x = d(s); x.setUTCDate(x.getUTCDate() + dias); return iso(x); };
const diasEntre = (a: string, b: string) => Math.round((d(b).getTime() - d(a).getTime()) / 86400000);
const finMes = (s: string) => iso(new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0, 12)));
const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);

export function rangoRelativo(rel: Relativa, hoy: string): { desde: string; hasta: string } {
  const lunes = mas(hoy, -((d(hoy).getUTCDay() + 6) % 7)), mes = `${hoy.slice(0, 7)}-01`, anio = Number(hoy.slice(0, 4));
  switch (rel) {
    case "hoy": return { desde: hoy, hasta: hoy };
    case "ayer": return { desde: mas(hoy, -1), hasta: mas(hoy, -1) };
    case "esta_semana": return { desde: lunes, hasta: hoy };
    case "semana_pasada": return { desde: mas(lunes, -7), hasta: mas(lunes, -1) };
    case "este_mes": return { desde: mes, hasta: hoy };
    case "mes_pasado": { const fin = mas(mes, -1); return { desde: `${fin.slice(0, 7)}-01`, hasta: fin }; }
    case "este_anio": return { desde: `${anio}-01-01`, hasta: hoy };
    case "anio_pasado": return { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31` };
  }
}

const unAnioAntes = (s: string) => { const y = Number(s.slice(0, 4)) - 1, md = s.slice(5); return md === "02-29" ? `${y}-02-28` : `${y}-${md}`; };
export function rangoComparacion(desde: string, hasta: string, comp: "anterior" | "anio") {
  if (comp === "anio") return { desde: unAnioAntes(desde), hasta: unAnioAntes(hasta) };
  const largo = diasEntre(desde, hasta) + 1;
  return { desde: mas(desde, -largo), hasta: mas(desde, -1) };
}

export function leerFiltrosBI(sp: Record<string, string | string[] | undefined>, hoy: string): FiltrosBI {
  const uno = (k: string) => lista(sp[k])[0] ?? null;
  const desdeP = uno("desde"), hastaP = uno("hasta");
  const rangoValido = !!desdeP && !!hastaP && ISO.test(desdeP) && ISO.test(hastaP) && desdeP <= hastaP && hastaP <= hoy && diasEntre(desdeP, hastaP) <= 1100;
  const relP = uno("rel") as Relativa | null;
  const rel: Relativa | null = rangoValido ? null : RELATIVAS.some(([r]) => r === relP) ? relP : "esta_semana";
  const rango = rel ? rangoRelativo(rel, hoy) : { desde: desdeP!, hasta: hastaP! };
  const permitidos = (k: string, valores: readonly string[]) => lista(sp[k]).filter((x) => valores.includes(x));
  const horaM = (uno("hora") ?? "").match(/^(\d{1,2})-(\d{1,2})$/);
  const hora: [number, number] | null = horaM && Number(horaM[1]) <= Number(horaM[2]) && Number(horaM[2]) <= 23 ? [Number(horaM[1]), Number(horaM[2])] : null;
  const edad = uno("edad");
  const prod = (uno("prod") ?? "").trim().slice(0, 80);
  return {
    rel, ...rango, comp: uno("comp") === "anio" ? "anio" : "anterior",
    suc: lista(sp.suc).filter((x) => /^[0-9a-z-]{1,40}$/i.test(x)), rfc: uno("rfc"),
    edad: edad && edad in EDADES_BI ? (edad as keyof typeof EDADES_BI) : null,
    canal: uno("canal") === "pos" || uno("canal") === "rappi" ? (uno("canal") as "pos" | "rappi") : null,
    origen: permitidos("origen", ORIGENES_BI), tipo: permitidos("tipo", TIPOS_BI),
    dia: lista(sp.dia).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7), hora,
    cat: permitidos("cat", CATEGORIAS_BI), prod: prod || null, pago: permitidos("pago", PAGOS_BI),
  };
}

export function parametrosSQL(f: FiltrosBI, rango: { desde: string; hasta: string }): Record<string, unknown> {
  const o = <T,>(xs: T[]) => (xs.length ? xs : null);
  const edad = f.edad ? EDADES_BI[f.edad] : null;
  return { desde: rango.desde, hasta: rango.hasta, sucursales: o(f.suc), rfc: f.rfc, edad_min: edad ? edad[0] : null, edad_max: edad ? edad[1] : null,
    canal: f.canal, origenes: o(f.origen), tipos: o(f.tipo), dias: o(f.dia), hora_desde: f.hora?.[0] ?? null, hora_hasta: f.hora?.[1] ?? null,
    categorias: o(f.cat), producto: f.prod, pagos: o(f.pago) };
}

/**
 * Filtros que se quedan con una parte de la venta de cada sucursal (canal, origen, tipo, día, hora, pago, categoría,
 * producto). Con ellos la venta no se compara contra P.E. ni meta, que son mensuales completos. Sucursal, razón social,
 * antigüedad y fechas sí permiten comparar.
 */
export const ventaParcial = (f: FiltrosBI) =>
  !!f.canal || !!f.hora || !!f.prod || [f.origen, f.tipo, f.dia, f.pago, f.cat].some((x) => x.length > 0);

/** Renglones del P&L que suben y bajan con la venta; el resto son fijos. */
export const CLAVES_VARIABLES = ["alimento", "merma", "regalias", "agregadores", "marketing_agregadores", "repartidores"] as const;
export const CLAVES_FIJAS = ["nomina_cocina", "nomina_gerencia", "renta", "servicios", "mantenimiento", "consumibles_equipo", "marketing", "otros", "oficina"] as const;

/** P.E. mensual = fijos ÷ (1 − variables ÷ venta neta). Sin venta, sin dato o margen ≤ 0 → null. */
export function puntoEquilibrio(montos: Record<string, number | null>): number | null {
  const venta = montos.venta_neta;
  if (venta === null || venta === undefined || venta <= 0) return null;
  const suma = (ks: readonly string[]) => ks.reduce((s, k) => s + (montos[k] ?? 0), 0);
  const margen = 1 - suma(CLAVES_VARIABLES) / venta;
  return margen > 0 ? suma(CLAVES_FIJAS) / margen : null;
}

/** Parte de un monto mensual que toca a los días del rango dentro de ese mes ("AAAA-MM"). */
export function prorratear(montoMensual: number, desde: string, hasta: string, mes: string): number {
  const ini = `${mes}-01`, fin = finMes(ini), a = desde > ini ? desde : ini, b = hasta < fin ? hasta : fin;
  if (a > b) return 0;
  return (montoMensual * (diasEntre(a, b) + 1)) / (diasEntre(ini, fin) + 1);
}

export function metaDelRango(metas: { sucursal_id: string; mes: string; monto: number }[], sucursales: string[], desde: string, hasta: string) {
  const meses: string[] = [];
  for (let m = `${desde.slice(0, 7)}-01`; m <= hasta; m = mas(finMes(m), 1)) meses.push(m);
  let monto = 0; const faltan: { sucursal_id: string; mes: string }[] = [];
  for (const s of sucursales) for (const m of meses) {
    const meta = metas.find((x) => x.sucursal_id === s && x.mes === m);
    if (!meta) faltan.push({ sucursal_id: s, mes: m }); else monto += prorratear(Number(meta.monto), desde, hasta, m.slice(0, 7));
  }
  return { monto: Math.round(monto * 100) / 100, faltan };
}

export function mezclarCategorias(pos: { categoria: string; ventas: number }[], rappi: { nombre: string; ventas: number }[]) {
  const t = new Map<string, number>();
  for (const c of pos) t.set(c.categoria, (t.get(c.categoria) ?? 0) + Number(c.ventas));
  for (const r of rappi) { const c = categoriaRappi(r.nombre, null).categoria; t.set(c, (t.get(c) ?? 0) + Number(r.ventas)); }
  return [...t].map(([categoria, ventas]) => ({ categoria, ventas: Math.round(ventas * 100) / 100 })).sort((a, b) => b.ventas - a.ventas);
}

export function urlBI(f: FiltrosBI, cambios: Partial<FiltrosBI> = {}): string {
  const x = { ...f, ...cambios }, q = new URLSearchParams();
  if (x.rel) q.set("rel", x.rel); else { q.set("desde", x.desde); q.set("hasta", x.hasta); }
  q.set("comp", x.comp);
  for (const s of x.suc) q.append("suc", s);
  if (x.rfc) q.set("rfc", x.rfc); if (x.edad) q.set("edad", x.edad); if (x.canal) q.set("canal", x.canal);
  for (const [k, v] of [["origen", x.origen], ["tipo", x.tipo], ["dia", x.dia], ["cat", x.cat], ["pago", x.pago]] as const) for (const i of v) q.append(k, String(i));
  if (x.hora) q.set("hora", `${x.hora[0]}-${x.hora[1]}`); if (x.prod) q.set("prod", x.prod);
  return `/ventas/bi?${q}`;
}
