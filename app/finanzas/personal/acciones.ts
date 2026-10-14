"use server";
import { revalidatePath } from "next/cache";
import { clienteFinanzas,volver } from "../servidor";
import { camposPersonal } from "@/lib/finanzas/personal";
export async function guardarPersona(fd:FormData) {
  const ruta="/finanzas/personal",supabase=await clienteFinanzas(ruta);
  const t=(k:string)=>String(fd.get(k)??"").trim();
  const datos:Record<string,unknown>={nombre:t("nombre"),puesto:t("puesto"),renglon:t("renglon"),ingreso:t("ingreso")||null,baja:t("baja")||null,nota:t("nota")};
  for(const k of camposPersonal) {datos[k]=t(k)===""?null:Number(t(k));if(datos[k]!==null&&!Number.isFinite(datos[k]))volver(ruta,"error","Revisa los importes.");}
  if(t('plantilla_id')&&fd.get('revisado')!=='si')volver(ruta,'error','Revisa el desglose del puesto antes de guardar.');
  const {data,error}=await supabase.rpc("guardar_personal_con_puesto",{p_solicitud:t('solicitud'),p_id:t("id")||null,p_sucursal:t("sucursal_id")==="oficina"?null:t("sucursal_id"),p_codigo:t("codigo"),p_desde:t("desde"),p_hasta:t("hasta")||null,p_datos:datos,p_previa:t("previa")||null,p_puesto:t('plantilla_id')||null});
  if(error)volver(ruta,"error",error.message);
  revalidatePath("/finanzas","layout");volver(`${ruta}/${data}`,"ok","Perfil guardado con historial.");
}
export async function registrarBaja(fd:FormData) {
 const id=String(fd.get('id')),ruta=`/finanzas/personal/${id}`,supabase=await clienteFinanzas(ruta);
 const {error}=await supabase.rpc('registrar_baja_personal',{p_solicitud:String(fd.get('solicitud')),p_personal:id,p_previa:String(fd.get('previa')),p_fecha:String(fd.get('fecha')),p_motivo:String(fd.get('motivo')??'').trim()});
 if(error)volver(ruta,'error',error.message);
 revalidatePath('/finanzas','layout');volver(ruta,'ok','Baja registrada con fecha, motivo e historial. La nómina confirmada no cambió.');
}
export async function guardarPlantillaPuesto(fd:FormData) {
 const ruta=`/finanzas/personal/${String(fd.get('id'))}`,supabase=await clienteFinanzas(ruta);
 const {error}=await supabase.rpc('guardar_plantilla_puesto',{p_id:String(fd.get('solicitud')),p_nombre:String(fd.get('nombre')??'').trim(),p_version:String(fd.get('version')),p_motivo:String(fd.get('motivo')??'').trim()});
 if(error)volver(ruta,'error',error.message);
 revalidatePath('/finanzas','layout');volver(ruta,'ok','Plantilla de puesto guardada. Puedes reutilizarla al registrar personal en esta sucursal.');
}
