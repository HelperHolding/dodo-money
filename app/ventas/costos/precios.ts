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
