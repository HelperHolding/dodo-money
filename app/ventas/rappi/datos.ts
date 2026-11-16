import type {SupabaseClient} from "@supabase/supabase-js";
import {PREFIJO_EN_VIVO,aplicarFuenteDodo,claveDia,diasConAgregador,type AgregadorDodo,type RappiGuardada,type CatalogoRappi} from "@/lib/ventas/rappi";
import {leerTodo} from "@/lib/ventas/paginar";
/** Solo órdenes del portal en vivo: las subidas por Excel no cuadraban y quedan fuera de esta página. */
const EN_VIVO=`${PREFIJO_EN_VIVO}%`;

/** Venta de agregador que ya trae Dodo IS por sucursal y día (desglose «agregador»). */
export async function cargarAgregadorDodo(supabase:SupabaseClient,sucursal:string|null,desde:string,hasta:string):Promise<AgregadorDodo[]>{
  const filas=await leerTodo<{pedidos:number|string;total:number|string;ventas_dia:{sucursal_id:string;fecha:string}}>((a,b)=>{
    let c=supabase.from("ventas_dia_desglose").select("ventas_dia_id,pedidos,total,ventas_dia!inner(sucursal_id,fecha)").eq("tipo","agregador").gte("ventas_dia.fecha",desde).lte("ventas_dia.fecha",hasta);
    if(sucursal)c=c.eq("ventas_dia.sucursal_id",sucursal);
    return c.order("ventas_dia_id").range(a,b).returns<{pedidos:number|string;total:number|string;ventas_dia:{sucursal_id:string;fecha:string}}[]>();
  });
  return filas.map(f=>({sucursal_id:f.ventas_dia.sucursal_id,fecha:f.ventas_dia.fecha,pedidos:Number(f.pedidos),total:Number(f.total)}));
}

/**
 * Órdenes del portal del periodo. Las de días en que Dodo IS ya trae venta de agregador llegan con sumar=false y
 * enDodo=true: Dodo IS es la fuente de esos días y Rappi solo coteja (ver cotejoRappiDodo).
 */
export async function cargarRappi(supabase:SupabaseClient,sucursal:string|null,desde:string,hasta:string){
  const [ordenes,catalogo,agregador]=await Promise.all([
    leerTodo<RappiGuardada>((a,b)=>{let c=supabase.from("rappi_ordenes").select("*,rappi_lineas(*)").like("archivo",EN_VIVO).gte("fecha",desde).lte("fecha",hasta);if(sucursal)c=c.eq("sucursal_id",sucursal);return c.order("rappi_id").range(a,b).returns<RappiGuardada[]>();}),
    leerTodo<CatalogoRappi>((a,b)=>supabase.from("rappi_productos").select("id,clave,nombre,dodo_id").order("id").range(a,b).returns<CatalogoRappi[]>()),
    cargarAgregadorDodo(supabase,sucursal,desde,hasta),
  ]);
  for(const o of ordenes)if(Math.round(o.rappi_lineas.reduce((n,p)=>n+Number(p.importe),0)*100)!==Math.round(Number(o.bruto)*100))throw Error(`No se pudo cargar todo el detalle Rappi de ${o.rappi_id}.`);
  return {ordenes:aplicarFuenteDodo(ordenes,diasConAgregador(agregador)),catalogo,agregador};
}

/** Solo importes y órdenes por día: navegar el calendario no carga conceptos fuera del periodo elegido. Las órdenes
 * por día dan el ticket del periodo anterior para comparar. Los días que Dodo IS ya cubre no suman. */
export async function ventaDiariaRappi(supabase:SupabaseClient,sucursal:string|null,desde:string,hasta:string){
  const [ordenes,agregador]=await Promise.all([
    leerTodo<{sucursal_id:string;fecha:string;subtotal_restaurante:number|string}>((a,b)=>{
      let c=supabase.from("rappi_ordenes").select("sucursal_id,fecha,subtotal_restaurante").eq("estado","Finalizado").eq("sumar",true).like("archivo",EN_VIVO).gte("fecha",desde).lte("fecha",hasta);
      if(sucursal)c=c.eq("sucursal_id",sucursal);
      return c.order("rappi_id").range(a,b);
    }),
    cargarAgregadorDodo(supabase,sucursal,desde,hasta),
  ]);
  const cubiertos=diasConAgregador(agregador);
  const centavos:Record<string,number>={},cuantas:Record<string,number>={};
  for(const o of ordenes){if(cubiertos.has(claveDia(o.sucursal_id,o.fecha)))continue;centavos[o.fecha]=(centavos[o.fecha]??0)+Math.round(Number(o.subtotal_restaurante)*100);cuantas[o.fecha]=(cuantas[o.fecha]??0)+1;}
  return {venta:Object.fromEntries(Object.entries(centavos).map(([dia,monto])=>[dia,monto/100])),ordenes:cuantas};
}
