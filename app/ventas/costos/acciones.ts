"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { decimal } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { CATEGORIAS, errorDeCosto, errorDeMonto, type Categoria } from "@/lib/ventas/calculos";

/** Regresa a la tarjeta del producto, conservando el filtro. */
function volver(fd: FormData, clave: "ok" | "error", texto: string): never {
  const ver = String(fd.get("ver") ?? "");
  const filtro = ver === "sin-costo" || ver === "sin-categoria" ? `ver=${ver}&` : "";
  redirect(`/ventas/costos?${filtro}${clave}=${encodeURIComponent(texto)}#p-${Number(fd.get("dodo_id"))}`);
}

async function clienteAdmin(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) volver(fd, "error", "Solo un administrador maneja costos y categorías.");
  return supabase;
}

export async function asignarCategoria(fd: FormData) {
  const supabase = await clienteAdmin(fd);
  const valor = String(fd.get("categoria") ?? "");
  const categoria = (CATEGORIAS as readonly string[]).includes(valor) ? (valor as Categoria) : null;
  const { error } = await supabase.rpc("asignar_categoria", { p_dodo_id: Number(fd.get("dodo_id")), p_categoria: categoria });
  if (error) volver(fd, "error", error.message);
  revalidatePath("/ventas", "layout");
  volver(fd, "ok", "Categoría guardada.");
}

export async function registrarCosto(fd: FormData) {
  const supabase = await clienteAdmin(fd);
  const costo = decimal(fd.get("costo"));
  const vigenteDesde = String(fd.get("vigente_desde") ?? "");
  const problema = errorDeCosto(costo, vigenteDesde);
  if (problema) volver(fd, "error", problema);

  const { error } = await supabase.from("costos_producto").insert({
    dodo_id: Number(fd.get("dodo_id")),
    costo: Math.round(costo * 100) / 100,
    vigente_desde: vigenteDesde,
    fuente: String(fd.get("fuente") ?? "").trim() || null,
  });
  if (error) volver(fd, "error", error.code === "23505" ? "Ese producto ya tiene un costo con esa fecha; usa otra fecha." : error.message);
  revalidatePath("/ventas", "layout");
  volver(fd, "ok", "Costo guardado.");
}

/** Corrige un error de captura; el valor anterior queda en la bitácora de correcciones. */
export async function corregirCosto(fd: FormData) {
  const supabase = await clienteAdmin(fd);
  const costo = decimal(fd.get("costo"));
  const problema = errorDeMonto(costo);
  if (problema) volver(fd, "error", problema);
  const { error } = await supabase.rpc("corregir_costo", { p_id: String(fd.get("costo_id") ?? ""), p_costo: Math.round(costo * 100) / 100 });
  if (error) volver(fd, "error", error.message);
  revalidatePath("/ventas", "layout");
  volver(fd, "ok", "Costo corregido.");
}
