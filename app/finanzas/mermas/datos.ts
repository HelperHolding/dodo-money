import type {SupabaseClient} from "@supabase/supabase-js";
import type {DiaMerma,MermaDodo} from "@/lib/finanzas/mermasDodo";
import type {CostoMerma} from "@/lib/finanzas/mermasPL";
import {leerTodo} from "@/lib/ventas/paginar";
export type DiaImportado = DiaMerma & {archivo:string;desde:string;hasta:string;registrado_en:string};
export async function datosMermas(supabase:SupabaseClient,desde:string,hasta:string) {
 const [dias,filas,costos]=await Promise.all([
  leerTodo<DiaImportado>((a,b)=>supabase.from("mermas_dodo_dias").select("*").gte("fecha",desde).lte("fecha",hasta).order("sucursal_id").order("fecha").range(a,b)),
  leerTodo<MermaDodo>((a,b)=>supabase.from("mermas_dodo").select("*").gte("fecha",desde).lte("fecha",hasta).order("sucursal_id").order("fecha").order("tipo").order("clave").range(a,b)),
  leerCostos(supabase,hasta),
 ]);
 return {dias,filas,costos:costos.filas,disponible:costos.disponible};
}
async function leerCostos(supabase:SupabaseClient,hasta:string) {
 const filas:CostoMerma[]=[];
 for(let a=0;;a+=1000) {
  const {data,error}=await supabase.from("mermas_costos_producto").select("*").lte("vigente_desde",hasta).order("orden").range(a,a+999).returns<CostoMerma[]>();
  if(error){if(["42P01","PGRST205"].includes(error.code))return {filas:[],disponible:false};throw Error(error.message);}
  filas.push(...(data??[]));if((data??[]).length<1000)return {filas,disponible:true};
 }
}
