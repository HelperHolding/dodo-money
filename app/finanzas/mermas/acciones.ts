"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { clienteFinanzas, volver } from "../servidor";
import { hoyCalendarioMX } from "@/lib/formato";
import { leerHojas } from "@/lib/ventas/xlsx";
import { leerMermasDodo, nombresParaMermas, resumirMermas } from "@/lib/finanzas/mermasDodo";
import { leerTodo } from "@/lib/ventas/paginar";
import { tokenDeAcceso } from "@/lib/dodois/cliente";
import { ventanaMermas } from "@/lib/dodois/mermas";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sincronizarMermas } from "./sincronizar";
export type Revision = { error?: string; huella?: string; archivo?: string; dias?: ReturnType<typeof resumirMermas>; nombres?: Record<string,string>; reemplazados?: number };
export async function importarMermas(_: Revision, fd: FormData): Promise<Revision> {
  const supabase = await clienteFinanzas("/finanzas/mermas");
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || !archivo.size || archivo.size > 4*1024*1024 || !/\.xlsx$/i.test(archivo.name) || archivo.name.length > 255) return { error: "Elige el Excel .xlsx de Dodo IS, de hasta 4 MB." };
  const {data: sucursales,error} = await supabase.from("sucursales").select("id,nombre,dodois_unit_id").returns<{id:string;nombre:string;dodois_unit_id:string|null}[]>();
  if (error) return { error: error.message };
  // El Excel trae el nombre de la unidad en Dodo IS; se reconoce por la unidad ligada a cada sucursal.
  const {data: conexion,error: errorConexion} = await supabase.from("dodois_conexion").select("unidades").maybeSingle<{unidades:{id?:unknown;name?:unknown}[]|null}>();
  if (errorConexion) return { error: errorConexion.message };
  const nombres = nombresParaMermas(sucursales ?? [], Array.isArray(conexion?.unidades) ? conexion.unidades : []);
  let lectura; let huella;
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer()); huella = createHash("sha256").update(bytes).digest("hex");
    lectura = leerMermasDodo(leerHojas(bytes), nombres, hoyCalendarioMX());
  } catch { return { error: "No se pudo leer el Excel. Descarga nuevamente el reporte de Bajas de Dodo IS." }; }
  if (lectura.errores.length) return { error: lectura.errores.join(" ") };
  if (fd.get("etapa") === "guardar") {
    if (fd.get("huella") !== huella) return {error:"El archivo cambió. Revisa su vista previa antes de importarlo."};
    const {data,error: guardarError} = await supabase.rpc("importar_mermas_dodo", {p_archivo:archivo.name,p_huella:huella,p_dias:lectura.dias,p_filas:lectura.filas});
    if (guardarError) return {error:guardarError.message};
    revalidatePath("/finanzas", "layout");
    revalidatePath("/reporte/pl", "layout");
    volver(`/finanzas/mermas?mes=${lectura.dias.map(d=>d.fecha).sort().at(-1)!.slice(0,7)}`, "ok", `Importados ${data.dias} días y ${data.filas} renglones. Se reemplazaron ${data.reemplazados} días ya importados.`);
  }
  const fechas = lectura.dias.map(d=>d.fecha).sort(), claves = new Set(lectura.dias.map(d=>`${d.sucursal_id}|${d.fecha}`));
  const existentes = await leerTodo<{sucursal_id:string;fecha:string}>((desde,hasta)=>supabase.from("mermas_dodo_dias").select("sucursal_id,fecha").gte("fecha",fechas[0]).lte("fecha",fechas.at(-1)!).order("sucursal_id").order("fecha").range(desde,hasta));
  return {huella,archivo:archivo.name,dias:resumirMermas(lectura.filas,lectura.dias),nombres:Object.fromEntries((sucursales??[]).map(s=>[s.id,s.nombre])),reemplazados:existentes.filter(d=>claves.has(`${d.sucursal_id}|${d.fecha}`)).length};
}


/** «Traer de Dodo IS»: reemplaza los días del rango (máximo 31) con las bajas de la API, a nombre del admin. */
export async function traerMermasApi(fd:FormData) {
 const ruta="/finanzas/mermas";
 const supabase=await clienteFinanzas(ruta);
 const v=ventanaMermas(hoyCalendarioMX(),String(fd.get("desde")??""),String(fd.get("hasta")??""));
 if(!v)return volver(ruta,"error","Elige un rango de hasta 31 días que no pase de hoy.");
 let token:string;
 try{token=await tokenDeAcceso(crearClienteAdmin());}catch(e){return volver(ruta,"error",`Dodo IS: ${(e as Error).message}`);}
 const {data:sucursales,error}=await supabase.from("sucursales").select("id,nombre,dodois_unit_id").not("dodois_unit_id","is",null).order("nombre")
  .returns<{id:string;nombre:string;dodois_unit_id:string}[]>();
 if(error)return volver(ruta,"error",error.message);
 const r=await sincronizarMermas(supabase,token,sucursales??[],v,async(dias,filas,huella)=>await supabase.rpc("importar_mermas_dodo",{p_archivo:"API Dodo IS (manual)",p_huella:huella,p_dias:dias,p_filas:filas}));
 revalidatePath("/finanzas","layout");revalidatePath("/reporte/pl","layout");
 const destino=`${ruta}?mes=${v.hasta.slice(0,7)}`,fallas=r.filter(x=>x.estado==="error");
 if(fallas.length)return volver(destino,"error",fallas.map(x=>`${x.sucursal}: ${x.mensaje}`).join(" · "));
 return volver(destino,"ok",r.map(x=>`${x.sucursal}: ${x.mensaje}`).join(" · ")||"No hay sucursales ligadas a Dodo IS.");
}

export async function guardarCostoMerma(fd:FormData) {
 const supabase=await clienteFinanzas("/finanzas/mermas");
 const valor=String(fd.get("costo_unitario")??"").trim();
 const costo=/^\d+(\.\d{1,6})?$/.test(valor)?Number(valor):null;
 const {error}=await supabase.rpc("registrar_costo_merma",{p_sucursal:fd.get("sucursal_id"),p_clave:fd.get("clave"),p_desde:fd.get("vigente_desde"),p_costo:costo,p_fuente:fd.get("fuente")});
 if(!error){revalidatePath("/finanzas","layout");revalidatePath("/reporte/pl","layout");}
 volverCosto(fd,error?.message);
}
export async function anularCostoMerma(fd:FormData) {
 const supabase=await clienteFinanzas("/finanzas/mermas");
 const {error}=await supabase.rpc("anular_costo_merma",{p_id:fd.get("id"),p_motivo:fd.get("motivo")});
 if(!error){revalidatePath("/finanzas","layout");revalidatePath("/reporte/pl","layout");}
 volverCosto(fd,error?.message);
}
function volverCosto(fd:FormData,error?:string) {
 const mes=String(fd.get("mes")??""),sucursal=String(fd.get("sucursal_id")??"");
 const q=new URLSearchParams({...(/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)?{mes}:{}),...(/^[0-9a-f-]{36}$/i.test(sucursal)?{sucursal}:{})});
 volver(`/finanzas/mermas?${q}`,error?"error":"ok",error??"Costo de merma actualizado; el P&L se recalculó.");
}
