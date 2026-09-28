"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { gramos } from "@/lib/amasado";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA } from "@/lib/masa";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/amasado?${clave}=${encodeURIComponent(texto)}`);
const TEMPS = ["temp_sala", "temp_harina", "temp_agua", "temp_masa"] as const;
const GRAMOS = ["g_agua", "g_sal", "g_azucar", "g_aceite", "g_harina", "g_levadura"] as const;

export async function registrarLote(formData: FormData) {
  const { supabase, sucursal } = await obtenerContextoParaEscribir("/checklists/amasado");
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const entero = (k: string) => (texto(k) === "" ? Number.NaN : Number(texto(k)));

  const inicio = texto("inicio"), fin = texto("fin"), empleado = texto("empleado");
  const tempArea = Number(formData.get("temp_area"));
  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) volver("error", "Escribe la hora de inicio y de fin del amasado.");
  if (!(TEMPS_AREA as readonly number[]).includes(tempArea)) volver("error", "Elige la temperatura del área: 25, 30 o 35 °C.");
  if (!empleado) volver("error", "Escribe quién amasó.");

  const fila: Record<string, number | string | null> = {
    sucursal_id: sucursal.id, inicio, fin, temp_area: tempArea, empleado, comentario: texto("comentario") || null,
    plan_bolas: entero("plan_bolas"), bolas_resultado: entero("bolas_resultado"), minutos_amasado: decimal(formData.get("minutos_amasado")),
  };
  for (const k of TEMPS) fila[k] = decimal(formData.get(k));
  for (const k of GRAMOS) fila[k] = gramos(texto(k));

  if (![fila.plan_bolas, fila.bolas_resultado].every((n) => Number.isInteger(n) && (n as number) >= 0)) volver("error", "Escribe las bolas planeadas y las que salieron.");
  if (!TEMPS.every((k) => Number.isFinite(fila[k]) && (fila[k] as number) >= -5 && (fila[k] as number) <= 60)) volver("error", "Revisa las temperaturas: escríbelas en grados centígrados.");
  if (!GRAMOS.every((k) => Number.isFinite(fila[k]) && (fila[k] as number) >= 0)) volver("error", "Escribe los gramos de cada ingrediente, por ejemplo 1500 o 1,500.");
  if (!(Number.isFinite(fila.minutos_amasado) && (fila.minutos_amasado as number) > 0)) volver("error", "Escribe los minutos de amasado.");

  // Si alguna temperatura sale de rango sin comentario, la base de datos responde "Escribe qué pasó: …".
  const { error } = await supabase.from("lotes_amasado").insert(fila);
  if (error) volver("error", error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Lote registrado.");
}
