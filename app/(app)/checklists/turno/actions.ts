"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { diaSemanaISO } from "@/lib/limpiezaProfunda";
import { COLUMNAS } from "@/lib/zonas";

const MOMENTOS = COLUMNAS.map((c) => c.momento as string);

export async function registrarLista(formData: FormData) {
  const { supabase } = await obtenerContextoParaEscribir("/checklists/turno");
  const checklistId = String(formData.get("checklist_id") ?? "");
  const momento = String(formData.get("momento") ?? "");
  const empleado = String(formData.get("empleado") ?? "").trim();

  const { data: lista } = await supabase.from("checklists").select("clave").eq("id", checklistId).eq("tipo", "lista")
    .maybeSingle<{ clave: string }>();
  const base = lista ? `/checklists/turno?lista=${lista.clave}&momento=${momento}` : "/checklists/turno?x=1";
  const volver = (clave: "ok" | "error", texto: string) => redirect(`${base}&${clave}=${encodeURIComponent(texto)}`);

  if (!lista || !MOMENTOS.includes(momento)) volver("error", "Elige la lista y el momento.");
  if (!empleado) volver("error", "Escribe quién hizo la lista.");

  let consulta = supabase.from("checklist_puntos").select("id").eq("checklist_id", checklistId).eq("momento", momento);
  if (momento === "semanal") consulta = consulta.eq("dia_semana", diaSemanaISO(hoyMX()));
  const { data: puntos } = await consulta.returns<{ id: string }[]>();
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

  const { error } = await supabase.rpc("registrar_checklist", {
    p_checklist: checklistId, p_momento: momento, p_fecha: null, p_hora: null, p_empleado: empleado, p_respuestas: respuestas,
  });
  if (error) volver("error", error.code === "23505" ? "Esta lista ya se registró hoy." : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Lista guardada.");
}
