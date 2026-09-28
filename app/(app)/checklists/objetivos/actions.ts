"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeSupervisar } from "@/lib/contexto";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/objetivos?${clave}=${encodeURIComponent(texto)}`);

export async function registrarObjetivo(formData: FormData) {
  const { supabase, perfil, sucursal } = await obtenerContextoParaEscribir("/checklists/objetivos");
  if (!puedeSupervisar(perfil.rol)) volver("error", "Los objetivos del turno los registra el encargado o el gerente.");
  const turno = String(formData.get("turno") ?? "");
  const empleado = String(formData.get("empleado") ?? "").trim();
  const objetivo = String(formData.get("objetivo") ?? "").trim();
  if (turno !== "manana" && turno !== "tarde") volver("error", "Elige el turno.");
  if (!empleado || !objetivo) volver("error", "Escribe el empleado y su objetivo.");
  const { error } = await supabase.from("objetivos_turno").insert({ sucursal_id: sucursal.id, turno, empleado, objetivo });
  if (error) volver("error", error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Objetivo registrado.");
}
