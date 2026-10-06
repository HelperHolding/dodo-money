"use server";

import { revalidatePath } from "next/cache";
import { hoyCalendarioMX } from "@/lib/formato";
import { leerEntero } from "@/lib/finanzas/retenciones";
import { clienteFinanzas, volver } from "../servidor";

const RUTA = "/finanzas/retenciones";
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function registrarEntero(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const lectura = leerEntero((campo) => texto(fd, campo), hoyCalendarioMX());
  if ("error" in lectura) volver(RUTA, "error", lectura.error);
  if (!("datos" in lectura)) return;
  const datos = lectura.datos;
  let ruta: string | null = null;
  const acuse = fd.get("acuse");
  if (acuse instanceof File && acuse.size) {
    const extension = EXT[acuse.type];
    if (!extension) volver(RUTA, "error", "El acuse debe ser PDF, JPG, PNG o WebP.");
    if (acuse.size > 4 * 1024 * 1024) volver(RUTA, "error", "El acuse pesa más de 4 MB.");
    ruta = `${datos.mes.slice(0, 7)}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("acuses-sat").upload(ruta, acuse, { contentType: acuse.type, upsert: false });
    if (error) volver(RUTA, "error", error.message);
  }
  const { error } = await supabase.rpc("registrar_entero", { p_mes: datos.mes, p_fecha: datos.fecha, p_iva: datos.iva,
    p_isr: datos.isr, p_operacion: datos.operacion, p_acuse: ruta });
  if (error) {
    if (ruta) await supabase.storage.from("acuses-sat").remove([ruta]);
    volver(RUTA, "error", error.message);
  }
  revalidatePath(RUTA);
  volver(RUTA, "ok", "Entero registrado.");
}
export async function anularEntero(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const motivo = texto(fd, "motivo");
  if (!motivo) volver(RUTA, "error", "Escribe el motivo de anulación.");
  const { error } = await supabase.rpc("anular_entero", { p_id: texto(fd, "id"), p_motivo: motivo });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath(RUTA);
  volver(RUTA, "ok", "Entero anulado; se conserva su historial.");
}
