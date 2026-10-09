"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerIncomingSupplies } from "@/lib/compras/incomingSupplies";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { leerHojas, NO_ES_XLSX, type Hoja } from "@/lib/ventas/xlsx";
import { clienteAdmin, volver } from "../servidor";

export type ResultadoImportacion = { ok?: string; errores?: string[] };

export async function importarRecepciones(_previo: ResultadoImportacion | null, fd: FormData): Promise<ResultadoImportacion> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { errores: [SOLO_CONSULTA] };
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { errores: ["Elige el archivo de Excel."] };
  if (archivo.size > 5 * 1024 * 1024) return { errores: ["El archivo pesa más de 5 MB."] };
  let hojas: Hoja[];
  try {
    hojas = leerHojas(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { errores: [NO_ES_XLSX] };
  }
  const { data: sucursales, error: errorSuc } = await supabase.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>();
  if (errorSuc) return { errores: [errorSuc.message] };
  const leido = leerIncomingSupplies(hojas, sucursales ?? []);
  if (leido.errores.length) return { errores: leido.errores };

  const { data, error } = await supabase.rpc("importar_recepciones_dodo", { p_archivo: archivo.name, p_dias: leido.dias, p_filas: leido.recepciones });
  if (error) return { errores: [error.message] };
  revalidatePath("/compras", "layout");
  const r = data as { recepciones: number; ligadas: number; pendientes: number };
  return { ok: `${r.recepciones} recepciones guardadas: ${r.ligadas} ligadas a órdenes y ${r.pendientes} por revisar.` };
}

/** `destino` = "renglon:<id>" | "sin_orden" | "traspaso" | "pendiente". */
export async function clasificarRecepcion(fd: FormData) {
  const ruta = "/compras/recepciones";
  const supabase = await clienteAdmin(ruta);
  const destino = String(fd.get("destino") ?? "");
  const [clasificacion, renglon] = destino.startsWith("renglon:") ? ["orden", destino.slice(8)] : [destino, null];
  const { error } = await supabase.rpc("clasificar_recepcion", { p_id: String(fd.get("id") ?? ""), p_clasificacion: clasificacion, p_renglon: renglon });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", "Recepción clasificada.");
}

export async function conciliarRecepcion(fd: FormData) {
 const ruta="/compras/recepciones",db=await clienteAdmin(ruta);
 const {error}=await db.rpc("conciliar_recepcion_dodo",{p_dodo:String(fd.get("dodo_id")??""),p_manual:String(fd.get("manual_id")??"")});
 if(error)volver(ruta,"error",error.message);
 revalidatePath("/compras","layout");volver(ruta,"ok","Recepciones conciliadas sin duplicar cantidades.");
}
