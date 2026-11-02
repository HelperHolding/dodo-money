import type {SupabaseClient} from "@supabase/supabase-js";
import {PREFIJO_EN_VIVO,type RappiGuardada,type CatalogoRappi} from "@/lib/ventas/rappi";
import {leerTodo} from "@/lib/ventas/paginar";
/** Solo órdenes del portal en vivo: las subidas por Excel no cuadraban y quedan fuera de esta página. */
const EN_VIVO=`${PREFIJO_EN_VIVO}%`;
export async function cargarRappi(supabase:SupabaseClient,sucursal:string|null,desde:string,hasta:string){
  const [ordenes,catalogo]=await Promise.all([
    leerTodo<RappiGuardada>((a,b)=>{let c=supabase.from("rappi_ordenes").select("*,rappi_lineas(*)").like("archivo",EN_VIVO).gte("fecha",desde).lte("fecha",hasta);if(sucursal)c=c.eq("sucursal_id",sucursal);return c.order("rappi_id").range(a,b).returns<RappiGuardada[]>();}),
    leerTodo<CatalogoRappi>((a,b)=>supabase.from("rappi_productos").select("id,clave,nombre,dodo_id").order("id").range(a,b).returns<CatalogoRappi[]>())
  ]);
  for(const o of ordenes)if(Math.round(o.rappi_lineas.reduce((n,p)=>n+Number(p.importe),0)*100)!==Math.round(Number(o.bruto)*100))throw Error(`No se pudo cargar todo el detalle Rappi de ${o.rappi_id}.`);
  return {ordenes,catalogo};
}

/** Solo importes y órdenes por día: navegar el calendario no carga conceptos fuera del periodo elegido. Las órdenes
 * por día dan el ticket del periodo anterior para comparar. */
export async function ventaDiariaRappi(supabase:SupabaseClient,sucursal:string|null,desde:string,hasta:string){
  const ordenes=await leerTodo<{fecha:string;subtotal_restaurante:number|string}>((a,b)=>{
    let c=supabase.from("rappi_ordenes").select("fecha,subtotal_restaurante").eq("estado","Finalizado").eq("sumar",true).like("archivo",EN_VIVO).gte("fecha",desde).lte("fecha",hasta);
    if(sucursal)c=c.eq("sucursal_id",sucursal);
    return c.order("rappi_id").range(a,b);
  });
  const centavos:Record<string,number>={},cuantas:Record<string,number>={};
  for(const o of ordenes){centavos[o.fecha]=(centavos[o.fecha]??0)+Math.round(Number(o.subtotal_restaurante)*100);cuantas[o.fecha]=(cuantas[o.fecha]??0)+1;}
  return {venta:Object.fromEntries(Object.entries(centavos).map(([dia,monto])=>[dia,monto/100])),ordenes:cuantas};
}
