import type { SupabaseClient } from "@supabase/supabase-js";

/** Fondo inicial (aperturas confirmadas del turno o, si no hay, el fondo fijo) y retiros a bóveda confirmados. */
export async function fondoYRetirosDelTurno(supabase: SupabaseClient, turnoId: string, fondoFijo: number) {
  const { data } = await supabase
    .from("movimientos").select("tipo, monto")
    .eq("turno_id", turnoId).eq("estado", "confirmado").in("tipo", ["apertura", "retiro_boveda"])
    .returns<{ tipo: string; monto: number }[]>();
  const suma = (tipo: string) => (data ?? []).filter((m) => m.tipo === tipo).reduce((s, m) => s + Number(m.monto), 0);
  const aperturas = suma("apertura");
  const {data:eventos,error}=await supabase.from('pagos_ventas_eventos').select('importe').eq('turno_id',turnoId);
  if(error)throw new Error(error.message);
  return { fondo: aperturas > 0 ? aperturas : fondoFijo, fondoDeMovimientos: aperturas > 0, retiros: suma("retiro_boveda"),pagos:(eventos??[]).reduce((s,e)=>s+Number(e.importe),0) };
}
