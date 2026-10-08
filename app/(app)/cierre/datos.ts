import type { SupabaseClient } from "@supabase/supabase-js";
import { rangoDiaMX } from "@/lib/formato";

/** Movimientos confirmados del día, gastos pagados de la bóveda, saldo de bóveda del cierre anterior y diferencias de los arqueos de cierre. */
export async function datosDelDia(supabase: SupabaseClient, sucursalId: string, fecha: string) {
  const { desde, hasta } = rangoDiaMX(fecha);
  const [{ data: movs }, { data: anterior }, { data: turnos }, { data: caja }, { data: gastosBoveda }, {data:eventos,error:errorEventos}] = await Promise.all([
    supabase.from("movimientos").select("tipo, monto, estado")
      .eq("sucursal_id", sucursalId).gte("creado_en", desde).lt("creado_en", hasta)
      .returns<{ tipo: string; monto: number; estado: string }[]>(),
    supabase.from("cierres_dia").select("boveda_contado").eq("sucursal_id", sucursalId).lt("fecha", fecha)
      .order("fecha", { ascending: false }).limit(1).maybeSingle<{ boveda_contado: number }>(),
    supabase.from("turnos").select("id").eq("sucursal_id", sucursalId).eq("fecha", fecha).returns<{ id: string }[]>(),
    supabase.from("cajas").select("saldo_inicial").eq("sucursal_id", sucursalId).eq("tipo", "boveda")
      .maybeSingle<{ saldo_inicial: number }>(),
    supabase.from("gastos_caja_chica").select("monto").eq("sucursal_id", sucursalId).eq("origen", "boveda")
      .gte("creado_en", desde).lt("creado_en", hasta).returns<{ monto: number }[]>(),
    supabase.from("pagos_boveda_eventos").select("importe").eq("sucursal_id",sucursalId).eq("fecha_operativa",fecha).returns<{importe:number}[]>(),
  ]);
  if(errorEventos)throw new Error(errorEventos.message);

  const confirmados = (movs ?? []).filter((m) => m.estado === "confirmado");
  const suma = (tipo: string) => confirmados.filter((m) => m.tipo === tipo).reduce((s, m) => s + Number(m.monto), 0);

  let diferenciaTurnos = 0;
  const ids = (turnos ?? []).map((t) => t.id);
  if (ids.length) {
    const { data: arqueos } = await supabase.from("arqueos").select("diferencia")
      .in("turno_id", ids).eq("momento", "cierre").returns<{ diferencia: number }[]>();
    diferenciaTurnos = (arqueos ?? []).reduce((s, a) => s + Number(a.diferencia), 0);
  }

  return {
    bovedaInicial: Number(anterior?.boveda_contado ?? caja?.saldo_inicial ?? 0),
    retiros: suma("retiro_boveda"),
    aperturas: suma("apertura"),
    depositos: suma("salida_corporativo"),
    gastosBoveda: Math.round(((gastosBoveda ?? []).reduce((s, g) => s + Number(g.monto), 0)+(eventos??[]).reduce((s,e)=>s+Number(e.importe),0)) * 100) / 100,
    pendientes: (movs ?? []).filter((m) => m.estado === "pendiente").length,
    diferenciaTurnos,
  };
}
