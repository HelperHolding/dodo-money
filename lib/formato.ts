const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const pesos = (n: number | string | null | undefined) => mxn.format(Number(n ?? 0));

export const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" })
    .format(new Date(iso));

// México no tiene horario de verano desde 2022: UTC−6 todo el año. El servidor de Vercel corre en UTC.
// El día de operación cambia a las 4:00 (igual que diaOperativoMX en lib/franjas.ts): un cierre
// después de medianoche cuenta para el día que termina.

/** Día de operación de hoy en Ciudad de México (YYYY-MM-DD). */
export function hoyMX(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - (6 + 4) * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Inicio y fin del día de operación (4:00 a 4:00, Ciudad de México) en UTC, para filtrar por creado_en. */
export function rangoDiaMX(fecha: string): { desde: string; hasta: string } {
  const desde = new Date(`${fecha}T04:00:00-06:00`);
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export function numero(valor: FormDataEntryValue | null): number {
  const n = Number(String(valor ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function numeroOpcional(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").trim();
  return texto === "" ? null : numero(texto);
}

/** Número con punto o coma decimal ("0,5" o "0.5"). Devuelve NaN si no es número. */
export function decimal(valor: FormDataEntryValue | null): number {
  const texto = String(valor ?? "").replace(/\s/g, "").replace(",", ".");
  return texto === "" ? Number.NaN : Number(texto);
}

const corto = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 });

/** Cantidad con hasta tres decimales, para kilos y piezas. */
export const numeroCorto = (n: number) => corto.format(n);

const diaCorto = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-09-25" → "vie 25 de sep". */
export const fechaTexto = (fecha: string) => diaCorto.format(new Date(`${fecha}T00:00:00Z`));

/** Fracción como porcentaje con un decimal: 0.3421 → "34.2 %"; null → "—". */
export const porcentaje = (fraccion: number | null) => (fraccion === null ? "—" : `${(fraccion * 100).toFixed(1)} %`);

const mxnRedondo = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** Pesos sin centavos, para números grandes de un vistazo: 53454.4 → "$53,454". */
export const pesosRedondos = (n: number) => mxnRedondo.format(n);

const diaNumero = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** "2026-09-25" → "vie 25". */
export const diaYNumero = (fecha: string) => diaNumero.format(new Date(`${fecha}T00:00:00Z`)).replace(",", "");

/** Pesos en poco espacio, para el calendario: 9649 → "$9.6k", 1250000 → "$1.3M". */
export function pesosCortos(n: number): string {
  const corto = (valor: number, sufijo: string) => `$${Number(valor.toFixed(1)).toString()}${sufijo}`;
  if (Math.abs(n) >= 1_000_000) return corto(n / 1_000_000, "M");
  if (Math.abs(n) >= 1_000) return corto(n / 1_000, "k");
  return `$${Math.round(n)}`;
}
