import type { SupabaseClient } from "@supabase/supabase-js";
import type { Boveda } from "@/lib/fondos";

/** Saldo de la bóveda (movimientos confirmados) y salidas a corporativo que aún no se recogen. */
export async function bovedaDe(supabase: SupabaseClient, sucursalId: string, fondoBoveda: number): Promise<Boveda> {
  const [{ data: saldo, error: e1 }, { data: pendientes, error: e2 }, {data: disponibilidad,error:e3}] = await Promise.all([
    supabase.from("saldos_cajas").select("saldo").eq("sucursal_id", sucursalId).eq("tipo", "boveda").maybeSingle<{ saldo: number }>(),
    supabase.from("movimientos").select("monto").eq("sucursal_id", sucursalId).eq("tipo", "salida_corporativo").eq("estado", "pendiente")
      .returns<{ monto: number }[]>(),
    supabase.rpc("disponibilidad_boveda",{p_sucursal:sucursalId}),
  ]);
  if (e1 || e2 || e3) throw new Error(`No se pudo leer el saldo de la bóveda: ${(e1 ?? e2 ?? e3)!.message}`);
  return {
    saldoBoveda: Number(saldo?.saldo ?? 0),
    salidasPendientes: (pendientes ?? []).reduce((s, m) => s + Number(m.monto), 0),
    fondoBoveda,
    reservas:Number(disponibilidad?.reservado??0),
  };
}
