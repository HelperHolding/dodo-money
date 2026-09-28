"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { etiquetaHora } from "@/lib/franjas";
import { zonaCompleta } from "@/lib/zonas";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/ronda?${clave}=${encodeURIComponent(texto)}`);

/** Guarda por separado cada zona completa de la ronda; las zonas sin tocar se ignoran. */
export async function registrarRonda(formData: FormData) {
  const { supabase } = await obtenerContextoParaEscribir("/checklists/ronda");
  const [fecha, horaTexto] = String(formData.get("franja") ?? "").split("|");
  const hora = Number(horaTexto);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !Number.isInteger(hora)) volver("error", "Elige la hora de la ronda.");

  const [{ data: zonas }, { data: puntos }] = await Promise.all([
    supabase.from("checklists").select("id, nombre, horas").eq("tipo", "lista").eq("en_ronda", true).order("orden")
      .returns<{ id: string; nombre: string; horas: number[] }[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id").eq("momento", "hora").order("orden")
      .returns<{ id: string; checklist_id: string }[]>(),
  ]);

  const guardadas: string[] = [];
  const incompletas: string[] = [];
  const fallas: string[] = [];
  for (const z of zonas ?? []) {
    if (!z.horas.includes(hora)) continue;
    const empleado = String(formData.get(`empleado_${z.id}`) ?? "").trim();
    const respuestas = (puntos ?? []).filter((p) => p.checklist_id === z.id).map((p) => {
      const valor = formData.get(`${z.id}:cumple_${p.id}`);
      return {
        punto_id: p.id,
        cumple: valor === "si" ? true : valor === "no" ? false : null,
        comentario: String(formData.get(`${z.id}:comentario_${p.id}`) ?? "").trim() || null,
      };
    });
    const tocada = empleado !== "" || respuestas.some((r) => r.cumple !== null);
    if (!tocada) continue;
    if (!zonaCompleta(empleado, respuestas)) { incompletas.push(z.nombre); continue; }
    const { error } = await supabase.rpc("registrar_checklist", {
      p_checklist: z.id, p_momento: "hora", p_fecha: fecha, p_hora: hora, p_empleado: empleado, p_respuestas: respuestas,
    });
    if (error) fallas.push(`${z.nombre}: ${error.code === "23505" ? `ya se registró la ronda de las ${etiquetaHora(hora)}` : error.message}`);
    else guardadas.push(z.nombre);
  }

  revalidatePath("/checklists", "layout");
  const faltan = incompletas.length ? `Falta completar el nombre y todos los puntos de: ${incompletas.join(", ")}.` : "";
  if (!guardadas.length) volver("error", [...fallas, faltan].filter(Boolean).join(" ") || "Llena al menos una zona.");
  volver("ok", [`Guardado: ${guardadas.join(", ")}.`, faltan, ...fallas].filter(Boolean).join(" "));
}
