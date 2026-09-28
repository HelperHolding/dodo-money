"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/limpieza-profunda?${clave}=${encodeURIComponent(texto)}`);

export async function registrarLimpiezaProfunda(formData: FormData) {
  const { supabase, sucursal } = await obtenerContextoParaEscribir("/checklists/limpieza-profunda");
  const empleado = String(formData.get("empleado") ?? "").trim();
  if (!empleado) volver("error", "Escribe quién hizo la limpieza profunda.");
  // La fecha y el área las pone la base de datos según el día.
  const { error } = await supabase.from("limpiezas_profundas").insert({ sucursal_id: sucursal.id, empleado });
  if (error) volver("error", error.code === "23505" ? "La limpieza profunda de hoy ya se registró." : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Limpieza profunda registrada.");
}
