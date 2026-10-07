"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { clienteFinanzas, volver } from "../servidor";
import { hoyCalendarioMX } from "@/lib/formato";
import { leerHojas } from "@/lib/ventas/xlsx";
import { leerMermasDodo, resumirMermas } from "@/lib/finanzas/mermasDodo";
import { leerTodo } from "@/lib/ventas/paginar";
export type Revision = { error?: string; huella?: string; archivo?: string; dias?: ReturnType<typeof resumirMermas>; nombres?: Record<string,string>; reemplazados?: number };
export async function importarMermas(_: Revision, fd: FormData): Promise<Revision> {
  const supabase = await clienteFinanzas("/finanzas/mermas");
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || !archivo.size || archivo.size > 4*1024*1024 || !/\.xlsx$/i.test(archivo.name) || archivo.name.length > 255) return { error: "Elige el Excel .xlsx de Dodo IS, de hasta 4 MB." };
  const {data: sucursales,error} = await supabase.from("sucursales").select("id,nombre");
  if (error) return { error: error.message };
  let lectura; let huella;
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer()); huella = createHash("sha256").update(bytes).digest("hex");
    lectura = leerMermasDodo(leerHojas(bytes), sucursales ?? [], hoyCalendarioMX());
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
