/** Franjas horarias de los checklists, en hora de Ciudad de México (UTC−6 todo el año desde 2022). */

export const TOLERANCIA_MIN = 10;
/** El día operativo cambia a esta hora: el cierre nocturno después de medianoche cuenta para el día que termina. */
export const CORTE_DIA_HORAS = 4;
const DESFASE_MS = -6 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

export type Franja = { fecha: string; hora: number };
export type EstadoCasilla = "ok" | "alerta" | "abierta" | "falta" | "futura";

export const etiquetaHora = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Fecha (YYYY-MM-DD) y minutos transcurridos del día en Ciudad de México. */
export function relojMX(ahora: Date): { fecha: string; minutos: number } {
  const mx = new Date(ahora.getTime() + DESFASE_MS);
  return { fecha: mx.toISOString().slice(0, 10), minutos: mx.getUTCHours() * 60 + mx.getUTCMinutes() };
}

function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Franjas del checklist que aceptan registro ahora: la actual y, en los primeros minutos, la anterior. */
export function franjasAbiertas(horas: readonly number[], ahora: Date): Franja[] {
  const { fecha, minutos } = relojMX(ahora);
  const h = Math.floor(minutos / 60);
  const candidatas: Franja[] = [{ fecha, hora: h }];
  if (minutos % 60 < TOLERANCIA_MIN) {
    candidatas.push(h === 0 ? { fecha: diaAnterior(fecha), hora: 23 } : { fecha, hora: h - 1 });
  }
  return candidatas.filter((f) => horas.includes(f.hora));
}

export function estadoFranja(f: Franja, ahora: Date): "futura" | "abierta" | "cerrada" {
  const inicio = Date.parse(`${f.fecha}T${etiquetaHora(f.hora)}:00-06:00`);
  const t = ahora.getTime();
  if (t < inicio) return "futura";
  if (t < inicio + HORA_MS + TOLERANCIA_MIN * 60 * 1000) return "abierta";
  return "cerrada";
}

/** Estado de una casilla del resumen: el registro manda; sin registro, depende del horario. */
export function estadoCasilla(registro: "ok" | "alerta" | undefined, f: Franja, ahora: Date): EstadoCasilla {
  if (registro) return registro;
  const e = estadoFranja(f, ahora);
  return e === "abierta" ? "abierta" : e === "cerrada" ? "falta" : "futura";
}

/** Próxima hora del checklist después de la hora actual, o null si ya no hay más hoy. */
export function siguienteFranja(horas: readonly number[], ahora: Date): number | null {
  const actual = Math.floor(relojMX(ahora).minutos / 60);
  const siguientes = horas.filter((h) => h > actual);
  return siguientes.length ? Math.min(...siguientes) : null;
}

/** Día operativo (YYYY-MM-DD): el de Ciudad de México menos CORTE_DIA_HORAS. */
export function diaOperativoMX(ahora: Date): string {
  return new Date(ahora.getTime() + DESFASE_MS - CORTE_DIA_HORAS * HORA_MS).toISOString().slice(0, 10);
}

/** Identifica un conjunto de horas disponibles. Como `key`, reinicia el formulario cuando se registra una hora. */
export function claveFranjas(franjas: readonly Franja[], extra = ""): string {
  return `${extra}:${franjas.map((f) => `${f.fecha}|${f.hora}`).join(",")}`;
}
