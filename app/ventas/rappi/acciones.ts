"use server";
import {createHash} from "node:crypto";
import {revalidatePath} from "next/cache";
import {obtenerPerfil} from "@/lib/contexto";
import {puedeImportarVentas} from "@/lib/roles";
import {hoyCalendarioMX} from "@/lib/formato";
import {leerHojas} from "@/lib/ventas/xlsx";
import {leerHistorialRappi} from "@/lib/ventas/rappi";
import type {OrdenRappi} from "@/lib/ventas/rappi";
import {leerTodo} from "@/lib/ventas/paginar";
import {volver} from "@/app/finanzas/servidor";
export type RevisionRappi={error?:string;huella?:string;ordenes?:OrdenRappi[];sucursal?:string;nuevas?:number;actualizadas?:number;productos?:number;guardado?:string};
async function admin(){const c=await obtenerPerfil();if(!puedeImportarVentas(c.perfil.rol))throw Error("Solo el admin importa Rappi.");return c.supabase;}
function invalidar(){revalidatePath("/ventas","layout");revalidatePath("/finanzas","layout");revalidatePath("/reporte");}
export async function importarRappi(_:RevisionRappi,fd:FormData):Promise<RevisionRappi>{
  try{
    const supabase=await admin(),archivo=fd.get("archivo"),sucursal=String(fd.get("sucursal")??"");
    if(!(archivo instanceof File)||!archivo.size||archivo.size>4*1024*1024||archivo.name.length>255||!/\.xlsx$/i.test(archivo.name))throw Error("Selecciona el Excel del historial, de hasta 4 MB.");
    const {data,error}=await supabase.from("sucursales").select("id,nombre").eq("id",sucursal).maybeSingle();if(error)throw Error(error.message);if(!data)throw Error("Elige la sucursal de estas órdenes.");
    const bytes=new Uint8Array(await archivo.arrayBuffer()),huella=createHash("sha256").update(bytes).digest("hex");
    const lectura=leerHistorialRappi(leerHojas(bytes),hoyCalendarioMX());
    const {data:tienda,error:errorTienda}=await supabase.from("rappi_tiendas").select("sucursal_id").eq("id",lectura.ordenes[0].tienda_id).maybeSingle();if(errorTienda)throw Error(errorTienda.message);if(tienda&&tienda.sucursal_id!==sucursal)throw Error("Esta tienda Rappi ya está ligada a otra sucursal.");
    if(fd.get("etapa")==="guardar"){
      if(fd.get("huella")!==`${huella}|${sucursal}`)throw Error("El archivo o la sucursal cambió. Revisa nuevamente antes de importar.");
      const {data:r,error:e}=await supabase.rpc("importar_rappi",{p_sucursal:sucursal,p_archivo:archivo.name,p_huella:huella,p_ordenes:lectura.ordenes,p_productos:lectura.productos});if(e)throw Error(e.message);invalidar();return {guardado:`Importadas ${r.ordenes} órdenes; ${r.actualizadas} actualizadas sin duplicar.`};
    }
    const fechas=lectura.ordenes.map(o=>o.fecha).sort(),ids=new Set(lectura.ordenes.map(o=>o.rappi_id));
    const previas=await leerTodo<{rappi_id:string}>((a,b)=>supabase.from("rappi_ordenes").select("rappi_id").eq("sucursal_id",sucursal).gte("fecha",fechas[0]).lte("fecha",fechas.at(-1)!).order("rappi_id").range(a,b));
    const actualizadas=previas.filter(o=>ids.has(o.rappi_id)).length;
    return {huella:`${huella}|${sucursal}`,sucursal:data.nombre,ordenes:lectura.ordenes,productos:lectura.productos.length,actualizadas,nuevas:lectura.ordenes.length-actualizadas};
  }catch(e){return {error:e instanceof Error?e.message:"No se pudo importar el Excel."};}
}
export async function vincularProducto(fd:FormData){const s=await admin();const {error}=await s.rpc("vincular_producto_rappi",{p_id:Number(fd.get("id")),p_dodo:fd.get("dodo")?Number(fd.get("dodo")):null});if(error)volver("/ventas/rappi","error",error.message);invalidar();volver("/ventas/rappi","ok","Producto vinculado. Se recalculó su costo con el catálogo de Dodo IS.");}
export async function cambiarFuente(fd:FormData){const s=await admin();const {error}=await s.rpc("fuente_rappi",{p_sucursal:fd.get("sucursal"),p_desde:fd.get("desde"),p_hasta:fd.get("hasta"),p_sumar:fd.get("sumar")==="si"});if(error)volver("/ventas/rappi","error",error.message);invalidar();volver("/ventas/rappi","ok","Fuente actualizada para el periodo.");}
export async function fuenteOrden(fd:FormData){const s=await admin();const {error}=await s.rpc("fuente_orden_rappi",{p_id:fd.get("id"),p_sumar:fd.get("sumar")==="si"});if(error)volver("/ventas/rappi","error",error.message);invalidar();volver("/ventas/rappi","ok","Fuente actualizada para la orden.");}
