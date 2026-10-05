/**
 * Periodos del P&L: mes o semana ISO (lunes a domingo). Un periodo en curso se corta en ayer (día operativo) para que
 * ventas y costos fijos cubran los mismos días. Fechas como texto YYYY-MM-DD.
 */
export type TipoPeriodo = "mes" | "semana";
export type Periodo = {
  tipo: TipoPeriodo;
  /** "2026-10" o "2026-W41". */
  clave: string;
  /** Días que se calculan: `hasta` ya viene recortado a ayer si el periodo está en curso. */
  desde: string; hasta: string;
  /** Último día del mes o domingo de la semana. */
  finNominal: string;
  titulo: string;
  /** En curso y todavía sin días cerrados. */
  vacio: boolean;
};
export type Rango = { desde: string; hasta: string };
export type MesDelRango = { mes: string; dias: number; diasMes: number; fraccion: number; fin: string };

const DIA = 86_400_000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const fecha = (f: string) => new Date(`${f}T00:00:00Z`);
const texto = (d: Date) => d.toISOString().slice(0, 10);
export const sumarDias = (f: string, n: number) => texto(new Date(fecha(f).getTime() + n * DIA));
export const diasEntre = (desde: string, hasta: string) => (hasta < desde ? 0 : Math.round((fecha(hasta).getTime() - fecha(desde).getTime()) / DIA) + 1);
const ultimoDia = (mes: string) => {
  const d = fecha(`${mes}-01`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return texto(d);
};
const mesMenos = (mes: string, n: number) => {
  const d = fecha(`${mes}-01`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return texto(d).slice(0, 7);
};
const diaMes = (f: string) => `${Number(f.slice(8))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

/** Semana ISO de una fecha: "2026-W41". La semana es del año de su jueves. */
export function semanaISO(f: string): string {
  const d = fecha(f);
  const jueves = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DIA);
  const anio = jueves.getUTCFullYear();
  const n = Math.floor((jueves.getTime() - fecha(`${anio}-01-01`).getTime()) / DIA / 7) + 1;
  return `${anio}-W${String(n).padStart(2, "0")}`;
}

/** Lunes y domingo de una semana ISO (la semana 1 contiene el 4 de enero). */
export function rangoSemana(semana: string): Rango {
  const anio = Number(semana.slice(0, 4)), n = Number(semana.slice(6));
  const ene4 = fecha(`${anio}-01-04`);
  const lunes = texto(new Date(ene4.getTime() - ((ene4.getUTCDay() + 6) % 7) * DIA + (n - 1) * 7 * DIA));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

export const esSemana = (s: string) => /^\d{4}-W\d{2}$/.test(s) && semanaISO(rangoSemana(s).desde) === s;

/** Meses que toca un rango, con los días que entran de cada uno y su fracción (días ÷ días del mes). */
export function mesesDelRango(desde: string, hasta: string): MesDelRango[] {
  const r: MesDelRango[] = [];
  for (let ini = desde; ini <= hasta; ) {
    const mes = ini.slice(0, 7), fin = ultimoDia(mes);
    const diasMes = Number(fin.slice(8));
    const dias = diasEntre(ini, fin < hasta ? fin : hasta);
    r.push({ mes, dias, diasMes, fraccion: dias / diasMes, fin });
    ini = sumarDias(fin, 1);
  }
  return r;
}

/** Recorta a ayer si el periodo no ha terminado. */
function armar(tipo: TipoPeriodo, clave: string, desde: string, finNominal: string, titulo: string, hoy: string): Periodo {
  const hasta = finNominal < hoy ? finNominal : sumarDias(hoy, -1);
  return { tipo, clave, desde, hasta, finNominal, titulo, vacio: hasta < desde };
}

export function periodoMes(mes: string, hoy: string): Periodo {
  return armar("mes", mes, `${mes}-01`, ultimoDia(mes), `${MESES_LARGOS[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`, hoy);
}

/** Con `inicio`, la semana que lo cruza empieza ahí (antes no hay datos ni costos del P&L). */
export function periodoSemana(semana: string, hoy: string, inicio?: string): Periodo {
  const r = rangoSemana(semana);
  const desde = inicio && r.desde < inicio ? inicio : r.desde, hasta = r.hasta;
  const n = Number(semana.slice(6));
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  const primero = mismoMes ? String(Number(desde.slice(8))) : `${diaMes(desde)}${mismoAnio ? "" : ` ${desde.slice(0, 4)}`}`;
  return armar("semana", semana, desde, hasta, `Semana ${n} · ${primero} al ${diaMes(hasta)} ${hasta.slice(0, 4)}`, hoy);
}

/** Para la lista: "Sem 41 · 5–11 oct" o "Sem 40 · 28 sep – 4 oct". */
export function etiquetaSemana(semana: string): string {
  const { desde, hasta } = rangoSemana(semana);
  const n = Number(semana.slice(6));
  return desde.slice(0, 7) === hasta.slice(0, 7)
    ? `Sem ${n} · ${Number(desde.slice(8))}–${diaMes(hasta)}`
    : `Sem ${n} · ${diaMes(desde)} – ${diaMes(hasta)}`;
}

/** Semanas de la que contiene `inicio` a la de hoy, la más reciente primero. */
export function semanasDesde(inicio: string, hoy: string): string[] {
  const primera = rangoSemana(semanaISO(inicio)).desde;
  const r: string[] = [];
  for (let lunes = rangoSemana(semanaISO(hoy)).desde; lunes >= primera; lunes = sumarDias(lunes, -7)) r.push(semanaISO(lunes));
  return r;
}

/** Periodo de la URL; si falta o no es válido, el mes o la semana de ayer (nunca antes del inicio). */
export function elegirPeriodo(q: { periodo?: string; mes?: string; semana?: string }, hoy: string, inicio: string): Periodo {
  const ayer = sumarDias(hoy, -1) < inicio ? inicio : sumarDias(hoy, -1);
  if (q.periodo === "semana") {
    const s = q.semana ?? "";
    const valida = esSemana(s) && rangoSemana(s).desde <= hoy && rangoSemana(s).hasta >= inicio;
    return periodoSemana(valida ? s : semanaISO(ayer), hoy, inicio);
  }
  const m = q.mes ?? "";
  const valido = /^\d{4}-\d{2}$/.test(m) && m <= hoy.slice(0, 7) && m >= inicio.slice(0, 7);
  return periodoMes(valido ? m : ayer.slice(0, 7), hoy);
}

export const paramsPeriodo = (p: Periodo): Record<string, string> =>
  p.tipo === "semana" ? { periodo: "semana", semana: p.clave } : { periodo: "mes", mes: p.clave };

/** Periodo anterior del mismo tipo. */
export const anteriorDe = (p: Periodo, hoy: string, inicio?: string): Periodo =>
  p.tipo === "semana" ? periodoSemana(semanaISO(sumarDias(p.desde, -7)), hoy, inicio) : periodoMes(mesMenos(p.clave, 1), hoy);

/** Acumulado para comparar: del 1 de enero (mes) o del 1 del mes (semana) hasta el último día calculado; nunca antes del inicio. */
export function acumuladoDe(p: Periodo, inicio: string): Rango {
  const base = p.tipo === "mes" ? `${p.hasta.slice(0, 4)}-01-01` : `${p.hasta.slice(0, 7)}-01`;
  return { desde: base > inicio ? base : inicio, hasta: p.hasta };
}

/** Un rango por cada mes que toca (para cargar el acumulado en paralelo, mes por mes). */
export const rangosPorMes = (r: Rango): Rango[] =>
  mesesDelRango(r.desde, r.hasta).map((m) => ({ desde: m.mes === r.desde.slice(0, 7) ? r.desde : `${m.mes}-01`, hasta: m.fin < r.hasta ? m.fin : r.hasta }));

/** Encabezados de las dos columnas de comparación. */
export const COLUMNAS = {
  mes: { anterior: "Mes anterior %", anteriorCorto: "Mes ant.", acumulado: "Acumulado del año %", acumuladoCorto: "Año" },
  semana: { anterior: "Semana anterior %", anteriorCorto: "Sem. ant.", acumulado: "Acumulado del mes %", acumuladoCorto: "Mes" },
} as const;
export type Columnas = (typeof COLUMNAS)[TipoPeriodo];
