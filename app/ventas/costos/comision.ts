import type {SupabaseClient} from "@supabase/supabase-js";
import {leerTodo} from "@/lib/ventas/paginar";
import {sumarDias} from "@/lib/finanzas/periodo";
import {valorVigente,type Parametro} from "@/lib/finanzas/parametros";
import {comisionPOS} from "@/lib/costeo/margenes";
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
/** Comisión de terminal para costear POS (% del precio con IVA): tasas NetPay/Amex vigentes hoy en Finanzas → Parámetros × parte de la venta fuera de Rappi cobrada con tarjeta en los últimos 30 días. null sin ventas en ese periodo. */
export async function comisionPOSVigente(supabase:SupabaseClient,hoy:string){
 const desde=sumarDias(hoy,-29);
 const [params,dias,agregador]=await Promise.all([
  leerTodo<Parametro>((a,b)=>supabase.from("pl_parametros").select("clave,valor,vigente_desde").in("clave",["netpay_pct","amex_pct","amex_participacion"]).lte("vigente_desde",hoy).order("clave").order("vigente_desde").range(a,b).returns<Parametro[]>()),
  leerTodo<{id:string;total:number;tarjeta:number}>((a,b)=>supabase.from("ventas_dia").select("id,total,tarjeta").gte("fecha",desde).lte("fecha",hoy).order("id").range(a,b).returns<{id:string;total:number;tarjeta:number}[]>()),
  leerTodo<{ventas_dia_id:string;total:number;tarjeta:number}>((a,b)=>supabase.from("ventas_dia_desglose").select("ventas_dia_id,total,tarjeta,ventas_dia!inner(fecha)").eq("tipo","agregador").gte("ventas_dia.fecha",desde).lte("ventas_dia.fecha",hoy).order("ventas_dia_id").range(a,b).returns<{ventas_dia_id:string;total:number;tarjeta:number}[]>()),
 ]);
 const ag=new Map(agregador.map(x=>[x.ventas_dia_id,x]));
 const c=comisionPOS(dias.map(d=>({total:d.total,tarjeta:d.tarjeta,agregadorTotal:Number(ag.get(d.id)?.total??0),agregadorTarjeta:Number(ag.get(d.id)?.tarjeta??0)})),valorVigente(params,"netpay_pct",hoy),valorVigente(params,"amex_pct",hoy),valorVigente(params,"amex_participacion",hoy));
 // A dos decimales: el mismo % que se muestra es el que se cobra en la lista, la ficha y las calculadoras.
 return c&&{...c,pct:Math.round(c.pct*100)/100,desde,hasta:hoy};
}
