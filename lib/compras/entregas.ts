/** Recepciones esperadas: al confirmar una orden se espera en confirmación + días de entrega del proveedor (naturales). */

export type EstadoEntrega = "recibida" | "sin_fecha" | "atrasada" | "hoy" | "a_tiempo";

export const NOMBRE_ESTADO_ENTREGA: Record<EstadoEntrega, string> = {
  recibida: "Recibida", sin_fecha: "Sin fecha", atrasada: "Atrasada", hoy: "Llega hoy", a_tiempo: "A tiempo",
};

/** "2026-10-02" + 3 → "2026-10-05". null si el proveedor no tiene días de entrega. */
export function fechaEsperada(confirmada: string, dias: number | null): string | null {
  if (dias === null) return null;
  const d = new Date(`${confirmada}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function estadoEntrega(esperada: string | null, completa: boolean, hoy: string): EstadoEntrega {
  if (completa) return "recibida";
  if (!esperada) return "sin_fecha";
  return esperada < hoy ? "atrasada" : esperada === hoy ? "hoy" : "a_tiempo";
}

/** Órdenes por día esperado, sin las recibidas completas ni las que no tienen fecha (para el calendario). */
export function esperadasPorDia<O extends { entrega_esperada: string | null; completa: boolean }>(ordenes: readonly O[]): Record<string, O[]> {
  const r: Record<string, O[]> = {};
  for (const o of ordenes) {
    if (o.completa || !o.entrega_esperada) continue;
    (r[o.entrega_esperada] ??= []).push(o);
  }
  return r;
}
