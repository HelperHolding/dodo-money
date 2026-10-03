import type { SupabaseClient } from "@supabase/supabase-js";
import { arqueosVigentes } from "@/lib/arqueo";
import { primerError } from "@/lib/corporativo";
import { rangoDiaMX } from "@/lib/formato";
import type { OrigenGasto } from "@/lib/gastos";
import type { Recepcion } from "@/lib/salidas";
import { repartirGastos, resumenTurno, type ResumenTurno } from "@/lib/turnos";
import type { EstadoMovimiento, MomentoArqueo, TipoMovimiento, TipoTurno } from "@/lib/tipos";

export type TurnoDia = { id: string; fecha: string; tipo: TipoTurno; abierto_en: string; cerrado_en: string | null; encargado_id: string };
export type ArqueoDia = {
  id: string; turno_id: string; momento: MomentoArqueo; total_contado: number; esperado: number; diferencia: number;
  entrega_id: string; recibe_id: string | null; explicacion: string | null; creado_en: string;
  anulado_en: string | null; motivo_anulacion: string | null;
};
export type MovimientoDia = {
  id: string; turno_id: string | null; tipo: TipoMovimiento; caja_origen_id: string; caja_destino_id: string; monto: number;
  folio: string | null; nota: string | null; estado: EstadoMovimiento; registrado_por: string; confirmado_por: string | null;
  creado_en: string; recepcion: Recepcion | null; nota_recepcion: string | null;
};
export type GastoDia = {
  id: string; fecha: string; concepto: string; proveedor: string | null; monto: number; comprobante: string;
  origen: OrigenGasto; pagado_por: string | null; repuesto_en: string | null; creado_en: string;
};
export type CierreDia = {
  rappi: number; rappi_corte: number | null;
  venta_total: number; venta_neta: number; transacciones: number; ticket_promedio: number;
  boveda_inicial: number; retiros_dia: number; aperturas_dia: number; deposito_dia: number; gastos_boveda_dia: number;
  boveda_esperado: number; boveda_contado: number; boveda_diferencia: number; cambios_diferencia: number;
  deposito_ficha: string | null; cerrado_por: string; cerrado_en: string;
};
export type DetalleTurno = { turno: TurnoDia; arqueos: ArqueoDia[]; movimientos: MovimientoDia[]; gastos: GastoDia[]; resumen: ResumenTurno };

const MOVS = "id, turno_id, tipo, caja_origen_id, caja_destino_id, monto, folio, nota, estado, registrado_por, confirmado_por, creado_en, recepcion, nota_recepcion";

/**
 * Todo lo de un día de operación de una sucursal, repartido por turno.
 * Los movimientos van por su turno; los que se registraron sin turno abierto quedan "fuera de turno".
 * Los gastos no guardan turno: van al turno que estaba abierto cuando se registraron.
 */
export async function cargarDia(supabase: SupabaseClient, sucursalId: string, fecha: string, ahora: Date) {
  const { desde, hasta } = rangoDiaMX(fecha);
  const { data: turnos, error: errorTurnos } = await supabase.from("turnos")
    .select("id, fecha, tipo, abierto_en, cerrado_en, encargado_id").eq("sucursal_id", sucursalId).eq("fecha", fecha)
    .order("abierto_en").returns<TurnoDia[]>();
  if (errorTurnos) throw new Error(`No se pudieron cargar los turnos: ${errorTurnos.message}`);
  const ids = (turnos ?? []).map((t) => t.id);
  const sinIds = ["00000000-0000-0000-0000-000000000000"];

  const resultados = await Promise.all([
    supabase.from("arqueos").select("id, turno_id, momento, total_contado, esperado, diferencia, entrega_id, recibe_id, explicacion, creado_en, anulado_en, motivo_anulacion")
      .in("turno_id", ids.length ? ids : sinIds).order("creado_en").returns<ArqueoDia[]>(),
    supabase.from("movimientos").select(MOVS).eq("sucursal_id", sucursalId)
      .gte("creado_en", desde).lt("creado_en", hasta).order("creado_en").returns<MovimientoDia[]>(),
    supabase.from("movimientos").select(MOVS).in("turno_id", ids.length ? ids : sinIds).order("creado_en").returns<MovimientoDia[]>(),
    supabase.from("gastos_caja_chica").select("id, fecha, concepto, proveedor, monto, comprobante, origen, pagado_por, repuesto_en, creado_en")
      .eq("sucursal_id", sucursalId).gte("creado_en", desde).lt("creado_en", hasta).order("creado_en").returns<GastoDia[]>(),
    supabase.from("cierres_dia")
      .select("rappi, rappi_corte, venta_total, venta_neta, transacciones, ticket_promedio, boveda_inicial, retiros_dia, aperturas_dia, deposito_dia, gastos_boveda_dia, boveda_esperado, boveda_contado, boveda_diferencia, cambios_diferencia, deposito_ficha, cerrado_por, cerrado_en")
      .eq("sucursal_id", sucursalId).eq("fecha", fecha).maybeSingle<CierreDia>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const error = primerError(resultados);
  if (error) throw new Error(`No se pudieron cargar los datos del día: ${error}`);
  const [{ data: arqueos }, { data: movsDelDia }, { data: movsDeTurnos }, { data: gastos }, { data: cierre }, { data: perfiles }] = resultados;

  // Un movimiento de un turno del día puede caer después de las 4:00; se juntan las dos consultas sin repetir.
  const porId = new Map([...(movsDelDia ?? []), ...(movsDeTurnos ?? [])].map((m) => [m.id, m]));
  const movimientos = [...porId.values()].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const reparto = repartirGastos(turnos ?? [], gastos ?? [], ahora);

  const detalles: DetalleTurno[] = (turnos ?? []).map((turno) => {
    const as = (arqueos ?? []).filter((a) => a.turno_id === turno.id);
    const ms = movimientos.filter((m) => m.turno_id === turno.id);
    return { turno, arqueos: as, movimientos: ms, gastos: reparto.porTurno.get(turno.id) ?? [], resumen: resumenTurno(arqueosVigentes(as), ms) };
  });

  return {
    turnos: detalles,
    fuera: { movimientos: movimientos.filter((m) => !m.turno_id || !ids.includes(m.turno_id)), gastos: reparto.fuera },
    movimientos,
    gastos: gastos ?? [],
    cierre: cierre ?? null,
    persona: new Map((perfiles ?? []).map((p) => [p.id, p.nombre])),
  };
}

export type DatosDia = Awaited<ReturnType<typeof cargarDia>>;

/** Fecha (día de operación) de un turno de la sucursal; null si no existe o es de otra sucursal. */
export async function fechaDeTurno(supabase: SupabaseClient, sucursalId: string, id: string) {
  const { data } = await supabase.from("turnos").select("fecha").eq("id", id).eq("sucursal_id", sucursalId).maybeSingle<{ fecha: string }>();
  return data?.fecha ?? null;
}
