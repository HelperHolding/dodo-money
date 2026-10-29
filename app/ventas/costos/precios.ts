import type {SupabaseClient} from "@supabase/supabase-js";
import type {CatalogoRappi,RappiGuardada} from "@/lib/ventas/rappi";
import {leerTodo} from "@/lib/ventas/paginar";
import {preciosRappi} from "@/lib/costeo/trazabilidad";
/** Solo carga el historial vinculado a este SKU, no todas las ventas del negocio. */
export async function preciosDelProducto(supabase:SupabaseClient,id:number,hoy:string){
 const catalogo=await leerTodo<CatalogoRappi>((a,b)=>supabase.from("rappi_productos").select("id,clave,nombre,dodo_id").eq("dodo_id",id).order("id").range(a,b));
 if(!catalogo.length)return [];
 type Linea=RappiGuardada["rappi_lineas"][number]&{rappi_ordenes:Omit<RappiGuardada,"rappi_lineas">};
 const lineas=await leerTodo<Linea>((a,b)=>supabase.from("rappi_lineas").select("*,rappi_ordenes!inner(*)").in("producto_id",catalogo.map(c=>c.id)).eq("rappi_ordenes.estado","Finalizado").lte("rappi_ordenes.fecha",hoy).order("rappi_id").order("linea").range(a,b));
 const ordenes=new Map<string,RappiGuardada>();
 for(const l of lineas){const {rappi_ordenes:o,...detalle}=l;const orden=ordenes.get(o.rappi_id)??{...o,rappi_lineas:[]};orden.rappi_lineas.push(detalle);ordenes.set(o.rappi_id,orden);}
 return preciosRappi(id,[...ordenes.values()],catalogo);
}

/** Una lectura paginada para la lista, sin una consulta por cada producto. La lista oficial vigente manda; sin ella, el último precio observado. */
export async function ultimosPreciosCosteo(supabase:SupabaseClient,hoy:string){
 type Linea={producto_id:number;cantidad:number;importe:number;rappi_id:string;linea:number;rappi_ordenes:{fecha:string;hora:string}};
 type Oficial={dodo_id:number;precio:number;vigente_desde:string};
 const [catalogo,lineas,oficiales]=await Promise.all([
 leerTodo<{id:number;dodo_id:number|null}>((a,b)=>supabase.from("rappi_productos").select("id,dodo_id").not("dodo_id","is",null).order("id").range(a,b)),
 leerTodo<Linea>((a,b)=>supabase.from("rappi_lineas").select("producto_id,cantidad,importe,rappi_id,linea,rappi_ordenes!inner(fecha,hora)").eq("rappi_ordenes.estado","Finalizado").lte("rappi_ordenes.fecha",hoy).order("rappi_id").order("linea").range(a,b).returns<Linea[]>()),
 leerTodo<Oficial>((a,b)=>supabase.from("precios_rappi").select("dodo_id,precio,vigente_desde").lte("vigente_desde",hoy).order("dodo_id").order("vigente_desde",{ascending:false}).range(a,b).returns<Oficial[]>()),
 ]);
 const ids=new Map(catalogo.map(p=>[Number(p.id),p.dodo_id])),resultado=new Map<number,{precio:number;fecha:string;oficial:boolean}>();
 for(const o of oficiales)if(!resultado.has(o.dodo_id))resultado.set(o.dodo_id,{precio:Number(o.precio),fecha:o.vigente_desde,oficial:true});
 for(const l of lineas.sort((a,b)=>b.rappi_ordenes.fecha.localeCompare(a.rappi_ordenes.fecha)||b.rappi_ordenes.hora.localeCompare(a.rappi_ordenes.hora)||b.rappi_id.localeCompare(a.rappi_id)||a.linea-b.linea)){
 const id=ids.get(Number(l.producto_id));if(id===null||id===undefined||resultado.has(id)||Number(l.cantidad)<=0)continue;
 resultado.set(id,{precio:Math.round(Number(l.importe)/Number(l.cantidad)*100)/100,fecha:l.rappi_ordenes.fecha,oficial:false});
 }return resultado;
}
