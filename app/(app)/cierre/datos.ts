import type { SupabaseClient } from "@supabase/supabase-js";

type BovedaCierre = {
  bovedaInicial: number; retiros: number; aperturas: number; depositos: number;
  gastosBoveda: number; ajustesBoveda?: number; pendientes: number; ultimoCierre: string | null;
};

/** Solo consulta: el servidor usa el mismo cálculo al insertar un cierre nuevo. */
export async function datosDelDia(supabase: SupabaseClient, sucursalId: string, fecha: string) {
  const [boveda, turnos] = await Promise.all([
    supabase.rpc("datos_boveda_cierre", { p_sucursal: sucursalId, p_fecha: fecha }),
    supabase.from("turnos").select("id").eq("sucursal_id", sucursalId).eq("fecha", fecha)
      .returns<{ id: string }[]>(),
  ]);
  if (boveda.error) throw new Error(boveda.error.message);
  if (turnos.error) throw new Error(turnos.error.message);
  if (!boveda.data) throw new Error("No se pudo calcular la bóveda del cierre.");
  let diferenciaTurnos = 0;
  const ids = (turnos.data ?? []).map((t) => t.id);
  if (ids.length) {
    const { data, error } = await supabase.from("arqueos").select("diferencia")
      .in("turno_id", ids).eq("momento", "cierre").returns<{ diferencia: number }[]>();
    if (error) throw new Error(error.message);
    diferenciaTurnos = (data ?? []).reduce((s, a) => s + Number(a.diferencia), 0);
  }
  return { ...(boveda.data as BovedaCierre), diferenciaTurnos };
}
