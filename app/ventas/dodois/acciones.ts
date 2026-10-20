"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sincronizarVentas } from "./sincronizar";

const RUTA = "/ventas/dodois";
const volver = (clave: "ok" | "error", texto: string): never => redirect(`${RUTA}?${clave}=${encodeURIComponent(texto)}`);

async function soloAdmin() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) volver("error", "Solo un administrador.");
  return supabase;
}

export async function actualizarAhora(fd: FormData) {
  await soloAdmin();
  const fecha = String(fd.get("fecha") ?? "").trim();
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) volver("error", "Revisa la fecha.");
  const simular = fd.get("simular") === "si";
  const r = await sincronizarVentas(crearClienteAdmin(), "manual", { fecha: fecha || undefined, simular });
  revalidatePath("/ventas", "layout");
  const texto = r.map((x) => x.tipo === "recepciones"
    ? `Recepciones ${x.sucursal}: ${x.estado === "error" ? `error — ${x.mensaje}` : x.mensaje}`
    : `Ventas ${x.sucursal} ${x.fecha}: ${x.estado === "error" ? `error — ${x.mensaje}` : `${x.pedidos} pedidos, ${pesos(x.total)}${x.mensaje ? ` (${x.mensaje})` : ""}`}`).join(" · ");
  volver(r.some((x) => x.estado === "error") ? "error" : "ok", texto);
}

export async function ligarUnidad(fd: FormData) {
  const supabase = await soloAdmin();
  const { error } = await supabase.rpc("ligar_unidad_dodois", { p_sucursal: String(fd.get("sucursal_id") ?? ""), p_unit: String(fd.get("unidad") ?? "") });
  if (error) volver("error", error.message);
  revalidatePath(RUTA);
  volver("ok", "Sucursal ligada.");
}
