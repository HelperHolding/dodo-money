"use server";
import { revalidatePath } from "next/cache";
import { clienteFinanzas,volver } from "../servidor";
import { camposPersonal } from "@/lib/finanzas/personal";
export async function guardarPersona(fd:FormData) {
  const ruta="/finanzas/personal",supabase=await clienteFinanzas(ruta);
  const t=(k:string)=>String(fd.get(k)??"").trim();
  const datos:Record<string,unknown>={nombre:t("nombre"),puesto:t("puesto"),renglon:t("renglon"),ingreso:t("ingreso")||null,baja:t("baja")||null,nota:t("nota")};
  for(const k of camposPersonal) {datos[k]=t(k)===""?null:Number(t(k));if(datos[k]!==null&&!Number.isFinite(datos[k]))volver(ruta,"error","Revisa los importes.");}
  const {data,error}=await supabase.rpc("guardar_personal",{p_id:t("id")||null,p_sucursal:t("sucursal_id")==="oficina"?null:t("sucursal_id"),p_codigo:t("codigo"),p_desde:t("desde"),p_hasta:t("hasta")||null,p_datos:datos,p_previa:t("previa")||null});
  if(error)volver(ruta,"error",error.message);
  revalidatePath("/finanzas","layout");volver(`${ruta}/${data}`,"ok","Perfil guardado con historial.");
}
