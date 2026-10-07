"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeImportarVentas } from "@/lib/roles";

export async function guardarConciliacion(fd: FormData) {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeImportarVentas(perfil.rol)) redirect("/ventas/conciliacion?error=Solo+el+admin+concilia+ventas");
 const monto=(k:string)=>{const s=String(fd.get(k)??"").trim();return /^\d+(\.\d{1,2})?$/.test(s)?Number(s):null;};
 const {error}=await supabase.rpc("guardar_conciliacion_venta",{p_importacion:fd.get("importacion_id"),p_efectivo:monto("efectivo"),p_tarjeta:monto("tarjeta"),p_en_linea:monto("en_linea"),p_conciliar_productos:fd.get("conciliar_productos")==="si",p_motivo:fd.get("motivo")});
 volver(fd,error?.message);
}
export async function anularConciliacion(fd: FormData) {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeImportarVentas(perfil.rol)) redirect("/ventas/conciliacion?error=Solo+el+admin+concilia+ventas");
 const {error}=await supabase.rpc("anular_conciliacion_venta",{p_id:fd.get("id"),p_motivo:fd.get("motivo")});
 volver(fd,error?.message);
}
function volver(fd: FormData,error?: string) {
 if(!error) {revalidatePath("/ventas","layout");revalidatePath("/finanzas","layout");revalidatePath("/reporte","layout");}
 const mes=String(fd.get("mes")??"");
 const q=new URLSearchParams({...(/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)?{mes}:{}),...(error?{error}:{ok:"Conciliación guardada."})});
 redirect(`/ventas/conciliacion?${q}`);
}
