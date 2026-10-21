"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerBanregio, type ReporteBanregio } from "@/lib/banca/banregio";
import { leerHojas } from "@/lib/ventas/xlsx";
import { leerRazonesSociales } from "@/lib/compras/razonesSociales";

export type RevisionBanregio = {
  archivo: string; sha: string; reporte: ReporteBanregio; empresa: string; nuevos: number; repetidos: number;
  sucursal: string; opciones: { id: string; nombre: string }[];
};
export type ResultadoBanregio = { tipo: "revision"; revision: RevisionBanregio } | { tipo: "error"; mensaje: string } | { tipo: "guardado"; id: string };
const mensaje = (e: unknown) => e instanceof Error ? e.message : "No se pudo procesar el reporte.";

async function preparar(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") throw Error("Solo administración importa movimientos bancarios.");
  const file = fd.get("archivo");
  if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024 || !/\.xlsx$/i.test(file.name) || file.name.length > 200) throw Error("Selecciona el Excel original de Banregio (.xlsx), hasta 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const reporte = leerBanregio(leerHojas(bytes));
  const razones = await leerRazonesSociales(supabase);
  const empresa = razones.find(e => e.rfc === reporte.rfc && e.activa);
  if (!empresa) throw Error(`El RFC ${reporte.rfc} no corresponde a una razón social activa del grupo.`);
  const opciones = empresa.razon_social_sucursales.map(s => ({ id: s.sucursal_id, nombre: s.sucursales?.nombre ?? "Sucursal" }));
  const sucursal = String(fd.get("sucursal") ?? "");
  if (sucursal && !opciones.some(s => s.id === sucursal)) throw Error("Elige una sucursal de esa razón social o deja sin asignar.");
  const { data: cuenta, error } = await supabase.from("banca_cuentas").select("id,rfc,clabe").eq("numero", reporte.cuenta).maybeSingle<{id:string;rfc:string;clabe:string}>();
  if (error) throw Error("No se pudo consultar Banca. Verifica que la migración de Banregio esté instalada.");
  if (cuenta && (cuenta.rfc !== reporte.rfc || cuenta.clabe !== reporte.clabe)) throw Error("La cuenta ya tiene otros datos registrados. No se reasigna automáticamente.");
  const existentes: { fecha: string; huella: string }[] = [];
  if (cuenta) {
    for (let offset = 0; ; offset += 1000) {
      const {data,error} = await supabase.from("banca_movimientos").select("fecha,huella").eq("cuenta_id",cuenta.id).gte("fecha",reporte.primeraFecha).lte("fecha",reporte.ultimaFecha).order("id").range(offset,offset+999).returns<{fecha:string;huella:string}[]>();
      if(error) throw Error("No se pudieron revisar los movimientos existentes.");
      existentes.push(...data ?? []);
      if((data?.length ?? 0)<1000) break;
      if(offset>=99000) throw Error("El periodo es demasiado grande. Usa reportes más cortos.");
    }
  }
  const fechas = new Set(reporte.movimientos.map(m=>m.fecha));
  const huellas = new Set(reporte.movimientos.map(m=>m.huella));
  const previas = new Set(existentes.map(m=>m.huella));
  const fechasPrevias = new Set(existentes.map(m=>m.fecha));
  if(existentes.some(m=>fechas.has(m.fecha)&&!huellas.has(m.huella)) || reporte.movimientos.some(m=>fechasPrevias.has(m.fecha)&&!previas.has(m.huella))) throw Error("Un día ya importado contiene movimientos distintos o incompletos. Revisa los reportes; no se modificó nada.");
  const repetidos = reporte.movimientos.filter(m=>previas.has(m.huella)).length;
  const revision:RevisionBanregio = {archivo:file.name,sha,reporte,empresa:empresa.razon_social,nuevos:reporte.movimientos.length-repetidos,repetidos,sucursal,opciones};
  return {supabase,bytes,revision};
}
export async function revisarBanregio(fd:FormData):Promise<ResultadoBanregio> {
  try {return {tipo:"revision",revision:(await preparar(fd)).revision};}
  catch(e){return {tipo:"error",mensaje:mensaje(e)};}
}
export async function guardarBanregio(fd:FormData):Promise<ResultadoBanregio> {
  try {
    const {supabase,bytes,revision:r}=await preparar(fd);
    if(fd.get("sha_revisado")!==r.sha || fd.get("sucursal_revisada")!==r.sucursal) throw Error("El archivo o la asignación cambió. Revisa nuevamente antes de guardar.");
    if(fd.get("confirmar")!=="si") throw Error("Confirma la cuenta, razón social, moneda MXN y asignación antes de guardar.");
    const solicitud=String(fd.get("solicitud")??"");
    if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(solicitud)) throw Error("Solicitud inválida. Revisa nuevamente el reporte.");
    const {data,error}=await supabase.rpc("importar_banregio",{p_solicitud:solicitud,p_archivo:r.archivo,p_original:bytes.toString("base64"),p_reporte:{...r.reporte,moneda:"MXN"},p_sucursal:r.sucursal||null});
    if(error) throw Error(error.message);
    revalidatePath("/banca");
    return {tipo:"guardado",id:String(data)};
  } catch(e){return {tipo:"error",mensaje:mensaje(e)};}
}
