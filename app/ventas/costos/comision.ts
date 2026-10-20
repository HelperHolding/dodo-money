import type {SupabaseClient} from "@supabase/supabase-js";
/** Comisión Rappi vigente hoy (% sobre el precio con IVA), del mismo parámetro que usa el P&L. null si no hay ninguno vigente. */
export async function comisionRappiVigente(supabase:SupabaseClient,hoy:string){
 const {data,error}=await supabase.from("pl_parametros").select("valor,vigente_desde").eq("clave","rappi_pct").lte("vigente_desde",hoy).order("vigente_desde",{ascending:false}).limit(1);
 if(error)throw new Error(`No se pudo consultar la comisión Rappi: ${error.message}`);
 const p=data?.[0];
 if(!p)return null;
 const pct=Number(p.valor)*100;
 if(!Number.isFinite(pct)||pct<0||pct>=100)throw new Error("La comisión Rappi vigente no es un porcentaje válido.");
 return {pct,desde:p.vigente_desde as string};
}
