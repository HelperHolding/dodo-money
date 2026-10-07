import {obtenerPerfil} from "@/lib/contexto";
import {redirect} from "next/navigation";
import {leerTodo} from "@/lib/ventas/paginar";
import {hoyCalendarioMX} from "@/lib/formato";
import type {ModeloBOM,Receta} from "@/lib/costeo/bom";
export type VersionCosteo={id:string;vigente_desde:string;archivo:string;modelo:ModeloBOM;periferico:boolean;actualizado_en:string};
export type RecetaCosteo={version_id:string;clave:string;nombre:string;receta:Receta;costo:number|null;dodo_id:number|null};
export async function catalogoCosteo(version?:string){
 const contexto=await obtenerPerfil();
 if(!["admin","corporativo"].includes(contexto.perfil.rol))redirect("/ventas");
 const versiones=await leerTodo<VersionCosteo>((a,b)=>contexto.supabase.from("bom_versiones").select("id,vigente_desde,archivo,modelo,periferico,actualizado_en").order("vigente_desde",{ascending:false}).order("actualizado_en",{ascending:false}).order("id").range(a,b));
 const hoy=hoyCalendarioMX(),v=version?versiones.find(v=>v.id===version):versiones.find(v=>v.vigente_desde<=hoy);
 const recetas=v?await leerTodo<RecetaCosteo>((a,b)=>contexto.supabase.from("bom_recetas").select("version_id,clave,nombre,receta,costo,dodo_id").eq("version_id",v.id).order("clave").range(a,b)):[];
 return {...contexto,versiones,v,recetas,hoy};
}
export {fichaInsumo,fichaReceta} from "@/lib/costeo/enlaces";
