const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const pesos = (n: number | string | null | undefined) => mxn.format(Number(n ?? 0));

export const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" })
    .format(new Date(iso));

/** Fecha de hoy en Ciudad de México (YYYY-MM-DD): el servidor de Vercel corre en UTC. */
export function hoyMX(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Inicio y fin del día de Ciudad de México en UTC, para filtrar por creado_en. */
export function rangoDiaMX(fecha: string): { desde: string; hasta: string } {
  // México no tiene horario de verano desde 2022: UTC−6 todo el año.
  const desde = new Date(`${fecha}T00:00:00-06:00`);
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
