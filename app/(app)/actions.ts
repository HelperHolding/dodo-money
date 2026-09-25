"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeAbrirTurno } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";

export async function abrirTurno(formData: FormData) {
  const { supabase, perfil, sucursal, turno } = await obtenerContextoParaEscribir("/");
  if (!puedeAbrirTurno(perfil.rol)) redirect("/?error=" + encodeURIComponent("Solo un encargado o gerente abre el turno."));
  if (turno) redirect("/?error=" + encodeURIComponent("Ya hay un turno abierto. Ciérralo con su arqueo antes de abrir otro."));

  const tipo = formData.get("tipo") === "vespertino" ? "vespertino" : "matutino";
  const { error } = await supabase.from("turnos").insert({
    sucursal_id: sucursal.id, fecha: hoyMX(), tipo, encargado_id: perfil.id,
  });
  if (error) {
    const texto = error.code === "23505" ? `El turno ${tipo} de hoy ya se abrió.` : error.message;
    redirect("/?error=" + encodeURIComponent(texto));
  }
  revalidatePath("/", "layout");
  redirect("/?ok=" + encodeURIComponent(`Turno ${tipo} abierto. Registra el arqueo de inicio.`));
}
