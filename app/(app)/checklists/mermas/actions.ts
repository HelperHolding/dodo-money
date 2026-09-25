"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeSupervisar } from "@/lib/contexto";
import { decimal } from "@/lib/formato";
import { NOMBRE_MOTIVO } from "@/lib/tipos";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/mermas?${clave}=${encodeURIComponent(texto)}`);

export async function registrarMerma(formData: FormData) {
  const { supabase, sucursal } = await obtenerContextoParaEscribir("/checklists/mermas");
  const productoId = String(formData.get("producto_id") ?? "");
  const cantidad = decimal(formData.get("cantidad"));
  const motivo = String(formData.get("motivo") ?? "");
  const empleado = String(formData.get("empleado") ?? "").trim();

  if (!productoId) volver("error", "Elige el producto.");
  if (!(cantidad > 0)) volver("error", "Escribe una cantidad mayor a cero.");
  if (!(motivo in NOMBRE_MOTIVO)) volver("error", "Elige el motivo.");
  if (!empleado) volver("error", "Escribe el nombre de quien hizo la merma.");

  // La fecha la pone la base de datos (día operativo); no se envía.
  const { error } = await supabase.from("mermas").insert({
    sucursal_id: sucursal.id, producto_id: productoId, cantidad, motivo, empleado,
  });
  if (error) volver("error", error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Merma registrada.");
}

export async function cerrarMermas(formData: FormData) {
  const { supabase, perfil, sucursal } = await obtenerContextoParaEscribir("/checklists/mermas");
  if (!puedeSupervisar(perfil.rol)) volver("error", "Solo un encargado o gerente cierra las mermas del día.");
  if (formData.get("capturado_dodo") !== "si") volver("error", "Marca que ya capturaste las mermas en Dodo IS.");

  const { error } = await supabase.from("cierres_merma").insert({ sucursal_id: sucursal.id, capturado_dodo: true });
  if (error) volver("error", error.code === "23505" ? "Las mermas de hoy ya se cerraron." : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Mermas del día cerradas.");
}
