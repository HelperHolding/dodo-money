"use server";

import { revalidatePath } from "next/cache";
import { numero } from "@/lib/formato";
import { clienteFinanzas, volver } from "../servidor";
import { conceptosNomina } from "@/lib/finanzas/nomina";
import { leerPersonal } from "../personal/datos";
import { generarPersonal, aplicarContpaqi, extraerContpaqi } from "@/lib/finanzas/personal";
import { leerPrimeraHoja } from "@/lib/ventas/xlsx";
import { createHash } from "node:crypto";

const RUTA = "/finanzas/nomina";
const t = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
const sucursal = (v: string) => (v === "oficina" || !v ? null : v);

async function preparar(fd:FormData,excel:boolean) {
  const supabase=await clienteFinanzas(RUTA),mes=t(fd,"mes"),s=sucursal(t(fd,"sucursal_id"));
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))volver(RUTA,"error","Elige un mes válido.");
  const personas=await leerPersonal(supabase);
  let borrador=generarPersonal(personas,s,mes),fuente=`Borrador generado desde Personal para ${mes}. Revisión mensual de importes.`;
  if(excel) {
    const archivo=fd.get("excel");
    if(!(archivo instanceof File)||!archivo.size||archivo.size>4*1024*1024||!archivo.name.toLowerCase().endsWith(".xlsx"))return volver(RUTA,"error","Selecciona un Excel .xlsx de hasta 4 MB.");
    try {
      const bytes=new Uint8Array(await archivo.arrayBuffer());
      borrador=aplicarContpaqi(personas,s,mes,extraerContpaqi(leerPrimeraHoja(bytes),mes));
      fuente=`CONTPAQi ${archivo.name} · ${mes} · SHA256 ${createHash("sha256").update(bytes).digest("hex")}. Totales patronales reportados conservados.`;
    }catch(e){volver(RUTA,"error",e instanceof Error?e.message:"No se pudo leer el acumulado.");}
  }
  if(!borrador.empleados.length)volver(RUTA,"error","No hay perfiles activos para este mes y lugar.");
  const {data,error}=await supabase.rpc("preparar_borrador_nomina",{p_sucursal:s,p_mes:`${mes}-01`,p_fuente:fuente,p_empleados:borrador.empleados,p_avisos:borrador.avisos});
  if(error)volver(RUTA,"error",error.message);
  volver(`${RUTA}?mes=${mes}&borrador=${data}`,"ok","Borrador preparado. Revisa todos los importes antes de confirmarlo; todavía no cambia el P&L.");
}
export async function generarNomina(fd:FormData){return preparar(fd,false);}
export async function importarContpaqi(fd:FormData){return preparar(fd,true);}

export async function guardarReal(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const mes = t(fd, "mes");
  if (!/^\d{4}-\d{2}$/.test(mes)) volver(RUTA, "error", "Elige el mes.");
  const campos = ["nombre", "puesto", "renglon", "nota", "personal_id", "version_id", ...Object.keys(conceptosNomina)];
  const valores = new Map(campos.map((k) => [k, fd.getAll(k).map(String)]));
  if(t(fd,"borrador") && (valores.get("nombre")??[]).some((_,i)=>Object.keys(conceptosNomina).some(k=>(valores.get(k)?.[i]??"").trim()==="")))volver(RUTA,"error","Completa los importes pendientes antes de confirmar.");
  const empleados = (valores.get("nombre") ?? []).map((nombre, i) => Object.fromEntries(campos.map((k) => [k,
    k in conceptosNomina ? Number(valores.get(k)?.[i] ?? "") : (valores.get(k)?.[i] ?? "").trim(),
  ]))).filter((e) => e.nombre || e.puesto || e.nota || Object.keys(conceptosNomina).some((k) => e[k] !== 0));
  if (empleados.some((e) => Object.keys(conceptosNomina).some((k) => !Number.isFinite(e[k])))) volver(RUTA, "error", "Revisa los importes.");
  const { error } = t(fd,"borrador") ? await supabase.rpc("confirmar_borrador_nomina",{p_id:t(fd,"borrador"),p_empleados:empleados,p_fuente:t(fd,"fuente")}) : await supabase.rpc("guardar_nomina_real", { p_sucursal: sucursal(t(fd,"sucursal_id")), p_mes: `${mes}-01`, p_fuente: t(fd,"fuente"), p_empleados: empleados, p_previa: t(fd,"previa") || null });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout"); volver(`${RUTA}?mes=${mes}`, "ok", "Nómina real guardada. Sustituye la estimación de este mes.");
}
export async function anularReal(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const { error } = await supabase.rpc("anular_nomina_real", { p_id: t(fd,"id"), p_motivo: t(fd,"motivo") });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout"); volver(RUTA,"ok","Nómina real anulada; se usa la plantilla estimada.");
}

/** Alta o cambio de un puesto: se guarda como versión nueva con su fecha de vigencia (personas 0 = se quita). */
export async function guardarPuesto(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const puesto = t(fd, "puesto"), renglon = t(fd, "renglon"), vigente_desde = t(fd, "vigente_desde");
  const personas = Math.round(numero(fd.get("personas"))), sueldo = numero(fd.get("sueldo")), bono = numero(fd.get("bono"));
  const pct_cargas = numero(fd.get("pct_cargas")) / 100;
  if (!puesto) volver(RUTA, "error", "Escribe el puesto.");
  if (renglon !== "cocina" && renglon !== "gerencia") volver(RUTA, "error", "Elige si es cocina o gerencia.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigente_desde)) volver(RUTA, "error", "Elige desde cuándo aplica.");
  if (personas < 0 || sueldo < 0 || bono < 0 || pct_cargas < 0 || pct_cargas > 1) volver(RUTA, "error", "Revisa personas, sueldo, cargas (0 a 100 %) y bono.");
  const { error } = await supabase.from("nomina_plantilla").insert(
    { sucursal_id: sucursal(t(fd, "sucursal_id")), puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde },
  );
  if (error) volver(RUTA, "error", error.code === "23505" ? "Ya hay una versión de ese puesto con esa fecha; usa otra fecha." : error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Puesto guardado.");
}

export async function agregarAjuste(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const mes = t(fd, "mes"), renglon = t(fd, "renglon"), concepto = t(fd, "concepto");
  const monto = numero(fd.get("monto"));
  if (!/^\d{4}-\d{2}$/.test(mes)) volver(RUTA, "error", "Elige el mes.");
  if (renglon !== "cocina" && renglon !== "gerencia") volver(RUTA, "error", "Elige si es cocina o gerencia.");
  if (!concepto || !monto) volver(RUTA, "error", "Escribe el concepto y el monto (negativo si resta).");
  const { error } = await supabase.from("nomina_ajustes").insert({ sucursal_id: sucursal(t(fd, "sucursal_id")), mes: `${mes}-01`, renglon, monto, concepto });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Ajuste agregado.");
}

export async function quitarAjuste(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const { error } = await supabase.from("nomina_ajustes").delete().eq("id", t(fd, "id"));
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Ajuste quitado.");
}
