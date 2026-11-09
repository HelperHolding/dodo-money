import type { EstadoFactura } from "./facturas";

export type PorPagar = { id: string; saldo: number; vence_el: string; pago_programado_el: string | null; estado: EstadoFactura; pago_sugerido_el?: string | null };

const centavos = (n: number) => Math.round(Number(n) * 100);
const pesosTexto = (c: number) => `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** El día en que se paga: el programado; si no, el sugerido (día de pago autorizado); si no, el vencimiento. */
export const fechaDePago = (f: { vence_el: string; pago_programado_el: string | null; pago_sugerido_el?: string | null }) =>
  f.pago_programado_el ?? f.pago_sugerido_el ?? f.vence_el;

/** Reparte el monto entre las facturas, primero las que se pagan antes, sin pasar el saldo de ninguna. En centavos. */
export function repartirPago(monto: number, facturas: readonly PorPagar[]) {
  let resta = centavos(monto);
  const orden = [...facturas].sort((a, b) =>
    fechaDePago(a).localeCompare(fechaDePago(b)) || a.vence_el.localeCompare(b.vence_el) || a.id.localeCompare(b.id));
  const aplicaciones: { factura_id: string; monto: number }[] = [];
  for (const f of orden) {
    if (resta <= 0) break;
    const aplicar = Math.min(resta, centavos(f.saldo));
    if (aplicar <= 0) continue;
    aplicaciones.push({ factura_id: f.id, monto: aplicar / 100 });
    resta -= aplicar;
  }
  return { aplicaciones, sobrante: Math.max(resta, 0) / 100 };
}

/** Mensaje para el admin, o null si el pago se puede registrar (la base lo vuelve a revisar). */
export function revisarPago(monto: number, aplicaciones: readonly { factura_id: string; monto: number }[], saldos: ReadonlyMap<string, number>): string | null {
  if (!(monto > 0)) return "Escribe el monto del pago.";
  const usadas = aplicaciones.filter((a) => a.monto > 0);
  if (!usadas.length) return "Elige al menos una factura y cuánto se le aplica.";
  for (const a of usadas) {
    const saldo = saldos.get(a.factura_id);
    if (saldo === undefined || saldo <= 0) return "Una de las facturas ya no tiene saldo por pagar.";
    if (centavos(a.monto) > centavos(saldo)) return `Lo aplicado a una factura no puede pasar de su saldo (${pesosTexto(centavos(saldo))}).`;
  }
  const suma = usadas.reduce((s, a) => s + centavos(a.monto), 0);
  if (suma !== centavos(monto)) return `Lo aplicado (${pesosTexto(suma)}) no suma el monto del pago (${pesosTexto(centavos(monto))}).`;
  return null;
}

/** Domingo de la semana de `hoy` (la semana empieza en lunes). */
export function finDeSemana(hoy: string): string {
  const diaSemana = (new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
  return sumarDias(hoy, 6 - diaSemana);
}

const abierta = (f: PorPagar) => (f.estado === "por_pagar" || f.estado === "parcial") && Number(f.saldo) > 0;

export function grupoPorPagar(f: PorPagar, hoy: string): "vencidas" | "semana" | "despues" {
  if (f.vence_el < hoy) return "vencidas";
  return fechaDePago(f) <= finDeSemana(hoy) ? "semana" : "despues";
}

export function resumenPagos(facturas: readonly PorPagar[], pagos: readonly { fecha: string; monto: number; anulado: boolean }[], hoy: string) {
  const fin = finDeSemana(hoy);
  const treintaDias = sumarDias(hoy, 29);
  let vencido = 0, semana = 0, treinta = 0;
  for (const f of facturas.filter(abierta)) {
    const c = centavos(f.saldo);
    if (f.vence_el < hoy) { vencido += c; continue; }
    const dia = fechaDePago(f);
    if (dia <= fin) semana += c;
    if (dia <= treintaDias) treinta += c;
  }
  const mes = hoy.slice(0, 7);
  const pagadoMes = pagos.filter((p) => !p.anulado && p.fecha.slice(0, 7) === mes).reduce((s, p) => s + centavos(p.monto), 0);
  return { vencido: vencido / 100, semana: semana / 100, treinta: treinta / 100, pagadoMes: pagadoMes / 100 };
}

/**
 * Montos escritos a mano en algunas facturas; el resto del pago se reparte entre las demás por fecha.
 * Las facturas ajustadas van primero, en el orden de `manual`.
 */
export function repartirConAjustes(monto: number, facturas: readonly PorPagar[], manual: Readonly<Record<string, number>>) {
  const ajustadas = Object.entries(manual).filter(([id]) => facturas.some((f) => f.id === id))
    .map(([factura_id, m]) => ({ factura_id, monto: Math.round(Number(m) * 100) / 100 }));
  const usado = ajustadas.reduce((s, a) => s + centavos(a.monto), 0);
  const resto = repartirPago(Math.max(centavos(monto) - usado, 0) / 100, facturas.filter((f) => !(f.id in manual)));
  return { aplicaciones: [...ajustadas, ...resto.aplicaciones], sobrante: resto.sobrante };
}

/** Lo pagado en el mes de `hoy` a partir de lo aplicado a cada factura (así respeta filtros por proveedor o sucursal). */
export function pagadoDelMes(aplicaciones: readonly { pago_id: string; fecha: string; monto: number; anulado: boolean }[], hoy: string) {
  const delMes = aplicaciones.filter((a) => !a.anulado && a.fecha.slice(0, 7) === hoy.slice(0, 7));
  return { monto: delMes.reduce((s, a) => s + centavos(a.monto), 0) / 100, pagos: new Set(delMes.map((a) => a.pago_id)).size };
}

/**
 * Facturas por día de pago, con su total. Lo programado en una fecha que ya pasó o lo vencido sin programar cae en
 * `proximo` (el próximo día de pago desde hoy). `atrasada`: ya venció o su fecha programada pasó (aunque se vuelva a
 * programar). `tarde`: aún no vence, pero su día de pago cae después del vencimiento.
 */
export function agruparPorDiaDePago<T extends PorPagar>(facturas: readonly T[], hoy: string, proximo: string) {
  const grupos = new Map<string, (T & { programada: boolean; atrasada: boolean; tarde: boolean })[]>();
  for (const f of facturas) {
    const fecha = fechaDePago(f);
    const atrasada = fecha < hoy || f.vence_el < hoy;
    const dia = fecha < hoy ? proximo : fecha;
    grupos.set(dia, [...(grupos.get(dia) ?? []), { ...f, programada: !!f.pago_programado_el, atrasada, tarde: !atrasada && dia > f.vence_el }]);
  }
  return [...grupos].sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, lista]) => ({ dia, total: lista.reduce((s, x) => s + centavos(x.saldo), 0) / 100, facturas: lista }));
}

const montoTexto = (t: string) => Number(String(t).replace(/[$\s,]/g, "")) || 0;

/** Qué le pasa a una factura con lo aplicado: la liquida o queda como abono con su resto. Null si no aplica nada o pasa del saldo. */
export function efectoAplicacion(saldo: number, aplicado: number): { tipo: "liquida" } | { tipo: "abono"; queda: number } | null {
  const s = centavos(saldo), a = centavos(aplicado);
  if (a <= 0 || a > s) return null;
  return a === s ? { tipo: "liquida" } : { tipo: "abono", queda: (s - a) / 100 };
}

/**
 * El admin cambió lo aplicado a una factura: las demás se quedan como se ven (dejan de repartirse solas)
 * y el monto del pago pasa a ser la suma. Así un abono no choca con el monto prellenado.
 */
export function ajustarAplicacion(actuales: readonly { factura_id: string; monto: string }[], id: string, valor: string) {
  const manual: Record<string, string> = Object.fromEntries(actuales.map((a) => [a.factura_id, a.factura_id === id ? valor : a.monto]));
  const textos = Object.values(manual);
  const suma = textos.reduce((s, t) => s + centavos(montoTexto(t)), 0);
  return { manual, monto: textos.every((t) => t.trim() === "") ? "" : String(suma / 100) };
}

/** Facturas a las que el pago deja saldo (abonos). */
export function abonosDelPago(aplicaciones: readonly { factura_id: string; monto: number }[], saldos: ReadonlyMap<string, number>) {
  return aplicaciones.filter((a) => efectoAplicacion(saldos.get(a.factura_id) ?? 0, a.monto)?.tipo === "abono").map((a) => a.factura_id);
}

/**
 * Programación de lo que queda después de un abono. `{fecha}`: programar ahí (null la borra); null: no tocarla.
 * Sin fecha nueva, la programación que era para este pago se borra y el resto vuelve a su día sugerido o al vencimiento.
 */
export function programacionTrasAbono(programadaEl: string | null, fechaPago: string, resto: string): { fecha: string | null } | null {
  if (resto) return { fecha: resto };
  return programadaEl && programadaEl <= fechaPago ? { fecha: null } : null;
}

/** Forma prevista para liquidar el resto: la que ya tenía la factura; si no, la del abono (efectivo si salió de caja o bóveda). */
export function formaParaResto(formaActual: string | null, origen: string) {
  return formaActual ?? (origen === "transferencia" || origen === "tarjeta" ? origen : "efectivo");
}
