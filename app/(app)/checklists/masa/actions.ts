"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { etiquetaHora } from "@/lib/franjas";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA, temperaturaValida } from "@/lib/masa";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/masa?${clave}=${encodeURIComponent(texto)}`);

export async function registrarLectura(formData: FormData) {
  const { supabase, sucursal } = await obtenerContexto();
  const [fecha, horaTexto] = String(formData.get("franja") ?? "").split("|");
  const hora = Number(horaTexto);
  const tempArea = Number(formData.get("temp_area"));
  const bolasTexto = String(formData.get("bolas") ?? "").trim();
  const bolas = bolasTexto === "" ? Number.NaN : Number(bolasTexto);
  const temperatura = decimal(formData.get("temperatura"));
  const comentario = String(formData.get("comentario") ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !Number.isInteger(hora)) volver("error", "Elige la hora que vas a registrar.");
  if (!(TEMPS_AREA as readonly number[]).includes(tempArea)) volver("error", "Elige la temperatura del área: 25, 30 o 35 °C.");
  if (!Number.isInteger(bolas) || bolas < 0) volver("error", "Escribe cuántas bolas sacaste.");
  if (!temperaturaValida(temperatura)) volver("error", "Revisa la temperatura de la masa: escríbela en grados centígrados.");

  // Si la lectura sale de norma sin comentario, la base de datos responde "Escribe qué pasó: …".
  const { error } = await supabase.from("lecturas_masa").insert({
    sucursal_id: sucursal.id, fecha, hora, temp_area: tempArea, bolas, temperatura, comentario,
  });
  if (error) volver("error", error.code === "23505" ? `Ya se registró la masa de las ${etiquetaHora(hora)}.` : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", `Temperatura de las ${etiquetaHora(hora)} registrada.`);
}
