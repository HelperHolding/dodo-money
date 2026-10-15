"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeGestionar } from "@/lib/contexto";
import { hoyMX, numero } from "@/lib/formato";
import { BUCKET_FOTOS, rutaFoto, validarFoto } from "@/lib/fotos";
import { esCuentaGasto } from "@/lib/finanzas/cuentas";
import { leerOrigen } from "@/lib/gastos";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/caja-chica?${clave}=${encodeURIComponent(texto)}`);

export async function registrarGasto(formData: FormData) {
  const { supabase, sucursal, perfil } = await obtenerContextoParaEscribir("/caja-chica");
  const origen = leerOrigen(formData.get("origen"));
  const pagadoPor = origen === "empleado" ? String(formData.get("pagado_por") ?? "") || perfil.id : null;
  const comprobante = String(formData.get("comprobante"));
  const uuid = String(formData.get("uuid_cfdi") ?? "").trim() || null;
  const monto = numero(formData.get("monto"));
  const concepto = String(formData.get("concepto") ?? "").trim();
  const cuenta = String(formData.get("cuenta_pl") ?? "otros");

  if (!concepto) volver("error", "Escribe en qué se gastó.");
  if (monto <= 0) volver("error", "Escribe un monto mayor a cero.");
  if (!origen) volver("error", "Elige de dónde salió el dinero.");
  if (!esCuentaGasto(cuenta)) volver("error", "Elige el tipo de gasto.");
  if (comprobante === "cfdi" && !uuid) volver("error", "Con factura, escribe el folio fiscal (UUID) del CFDI.");

  const foto = formData.get("foto");
  const archivo = foto instanceof File && foto.size > 0 ? foto : null;
  const problemaFoto = validarFoto(archivo);
  if (problemaFoto) volver("error", problemaFoto);

  // La foto se sube primero: si falla, el gasto no se registra y se puede volver a intentar.
  let fotoPath: string | null = null;
  if (archivo) {
    fotoPath = rutaFoto(sucursal.id, crypto.randomUUID(), archivo.type);
    const { error: errorFoto } = await supabase.storage.from(BUCKET_FOTOS)
      .upload(fotoPath, archivo, { contentType: archivo.type, upsert: false });
    if (errorFoto) volver("error", `No se pudo subir la foto: ${errorFoto.message}`);
  }

  const { error } = await supabase.rpc("registrar_gasto_sucursal",{p_datos:{
    sucursal:sucursal.id,solicitud:String(formData.get("solicitud")??""),
    fecha:String(formData.get("fecha")||hoyMX()),concepto,proveedor:String(formData.get("proveedor")??"").trim()||null,
    monto,comprobante,uuid_cfdi:uuid,foto_path:fotoPath,origen,pagado_por:pagadoPor,cuenta_pl:cuenta,
    informativo:formData.get("informativo")==="si",motivo:String(formData.get("motivo_informativo")??""),
    referencia:String(formData.get("referencia_informativa")??""),confirmado:String(formData.get("confirmado")??"")
  }});
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", formData.get("informativo")==="si" ? "Gasto informativo registrado. No se descontó efectivo ni se generó reposición." : origen === "empleado" ? "Gasto registrado. Queda por reponer a quien lo pagó." : "Gasto registrado.");
}

/** El gerente o el admin marcan que ya se le regresó el dinero al empleado. Ninguna caja cambia. */
export async function marcarRepuesto(formData: FormData) {
  const { supabase, perfil } = await obtenerContextoParaEscribir("/caja-chica");
  if (!puedeGestionar(perfil.rol)) volver("error", "Solo el gerente o el admin marcan un gasto como repuesto.");
  const id = String(formData.get("id") ?? "");
  if (!id) volver("error", "No se identificó el gasto. Recarga la página e intenta de nuevo.");
  const { error } = await supabase.rpc("marcar_repuesto", { p_id: id });
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", "Gasto marcado como repuesto.");
}

export async function solicitarReposicion(formData: FormData) {
  const { supabase, sucursal, cajaPorTipo, turno } = await obtenerContextoParaEscribir("/caja-chica");
  const monto = numero(formData.get("monto"));
  if (monto <= 0) volver("error", "No hay gastos por reponer.");
  const {data:ultima,error:errUltima}=await supabase.from("movimientos").select("creado_en").eq("sucursal_id",sucursal.id).eq("tipo","reposicion_caja_chica").neq("estado","rechazado").order("creado_en",{ascending:false}).limit(1).maybeSingle();
  let consulta=supabase.from("gastos_caja_chica").select("monto").eq("sucursal_id",sucursal.id).eq("origen","caja_chica").eq("informativo",false);
  if(ultima)consulta=consulta.gt("creado_en",ultima.creado_en);
  const {data:gastos,error:errGastos}=await consulta;
  if(errUltima||errGastos)volver("error","No se pudieron verificar los gastos por reponer.");
  const actual=Math.round((gastos??[]).reduce((s,g)=>s+Number(g.monto),0)*100)/100;
  if(actual!==monto)volver("error","Los gastos por reponer cambiaron. Recarga la página antes de solicitar la reposición.");
  if (!cajaPorTipo.corporativo || !cajaPorTipo.caja_chica) volver("error", "Faltan las cajas de corporativo o caja chica en esta sucursal.");

  const { error } = await supabase.from("movimientos").insert({
    sucursal_id: sucursal.id,
    turno_id: turno?.id ?? null,
    tipo: "reposicion_caja_chica",
    caja_origen_id: cajaPorTipo.corporativo!.id,
    caja_destino_id: cajaPorTipo.caja_chica!.id,
    monto,
    nota: "Reposición por gastos comprobados",
  });
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", "Reposición solicitada. La confirma el gerente cuando el efectivo llegue a la caja chica.");
}

/** Corrige solo el registro elegido: conserva importe, fecha y fuente original del P&L. */
export async function corregirGastoInformativo(fd:FormData) {
  const {supabase,sucursal,perfil}=await obtenerContextoParaEscribir("/caja-chica");
  if(!puedeGestionar(perfil.rol))volver("error","Solo gerencia o administración corrige gastos.");
  const id=String(fd.get("id")??"");
  const {data:g,error:lectura}=await supabase.from("gastos_caja_chica").select("id,foto_path,informativo").eq("id",id).eq("sucursal_id",sucursal.id).maybeSingle();
  if(lectura||!g)volver("error","No se encontró el gasto en esta sucursal.");
  const foto=fd.get("foto");const archivo=foto instanceof File&&foto.size>0?foto:null;
  const problema=validarFoto(archivo);if(problema)volver("error",problema);
  let respaldo:string|null=null;
  if(archivo&&!g!.informativo){respaldo=rutaFoto(sucursal.id,crypto.randomUUID(),archivo.type);const {error}=await supabase.storage.from(BUCKET_FOTOS).upload(respaldo,archivo,{contentType:archivo.type,upsert:false});if(error)volver("error","No se pudo subir el respaldo.");}
  const {error}=await supabase.rpc("corregir_fecha_gasto_informativo",{p_id:id,p_fecha:String(fd.get("fecha_real")??""),p_motivo:String(fd.get("motivo")??""),p_referencia:String(fd.get("referencia")??""),p_respaldo:respaldo,p_confirmado:fd.get("confirmado")==="si"});
  if(error)volver("error",error.message);
  revalidatePath("/","layout");volver("ok","Gasto corregido como informativo. Se conserva una sola entrada en el P&L y el corte anterior no se modifica.");
}
