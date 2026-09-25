"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { etiquetaHora } from "@/lib/franjas";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/recorrido?${clave}=${encodeURIComponent(texto)}`);

export async function registrarRecorrido(formData: FormData) {
  const { supabase, perfil } = await obtenerContexto();
  if (!puedeSupervisar(perfil.rol)) volver("error", "El recorrido lo registra el encargado o el gerente.");

  const checklistId = String(formData.get("checklist_id") ?? "");
  const [fecha, horaTexto] = String(formData.get("franja") ?? "").split("|");
  const hora = Number(horaTexto);
  if (!checklistId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !Number.isInteger(hora)) volver("error", "Elige la hora del recorrido.");

  const { data: puntos } = await supabase.from("checklist_puntos").select("id")
    .eq("checklist_id", checklistId).returns<{ id: string }[]>();
  const respuestas = (puntos ?? []).map((p) => {
    const valor = formData.get(`cumple_${p.id}`);
    return {
      punto_id: p.id,
      cumple: valor === "si" ? true : valor === "no" ? false : null,
      comentario: String(formData.get(`comentario_${p.id}`) ?? "").trim() || null,
    };
  });
  if (!respuestas.length || respuestas.some((r) => r.cumple === null)) volver("error", "Marca Cumple o No cumple en todos los puntos.");
  if (respuestas.some((r) => r.cumple === false && !r.comentario)) volver("error", "Escribe qué pasó en cada punto que no cumple.");

  const { error } = await supabase.rpc("registrar_recorrido", {
    p_checklist: checklistId, p_fecha: fecha, p_hora: hora, p_respuestas: respuestas,
  });
  if (error) volver("error", error.code === "23505" ? `Ya se registró el recorrido de las ${etiquetaHora(hora)}.` : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", `Recorrido de las ${etiquetaHora(hora)} guardado.`);
}
