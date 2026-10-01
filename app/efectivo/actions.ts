"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeRecibirEfectivo } from "@/lib/roles";

const RUTA = "/efectivo";
const volver = (clave: "ok" | "error", texto: string): never => redirect(`${RUTA}?${clave}=${encodeURIComponent(texto)}`);

function idDe(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) volver("error", "No se identificó la salida. Recarga la página e intenta de nuevo.");
  return id;
}

/** El admin recoge (o rechaza) en la sucursal. La base de datos vuelve a revisar que sea admin y no quien la registró. */
async function recoger(formData: FormData, aceptar: boolean) {
  const { supabase, perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") volver("error", "Solo un admin recoge las salidas a corporativo.");
  const { error } = await supabase.rpc("confirmar_movimiento", { p_id: idDe(formData), p_aceptar: aceptar });
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", aceptar ? "Salida recogida: va en camino a corporativo a tu cargo." : "Salida rechazada. La bóveda no cambia.");
}

/** Corporativo acepta el efectivo que trajo el admin o dice por qué no cuadró. */
async function recibir(formData: FormData, aceptar: boolean) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeRecibirEfectivo(perfil.rol)) volver("error", "Solo corporativo recibe el efectivo.");
  const nota = String(formData.get("nota") ?? "").trim();
  if (!aceptar && !nota) volver("error", "Escribe por qué no cuadró (por ejemplo, cuánto falta).");
  const { error } = await supabase.rpc("recibir_en_corporativo", { p_id: idDe(formData), p_aceptar: aceptar, p_nota: nota || null });
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", aceptar ? "Efectivo recibido en corporativo." : "Quedó marcada como «No cuadró» para revisarla.");
}

export async function recogerSalida(formData: FormData) { await recoger(formData, true); }
export async function rechazarSalida(formData: FormData) { await recoger(formData, false); }
export async function aceptarEntrada(formData: FormData) { await recibir(formData, true); }
export async function noCuadra(formData: FormData) { await recibir(formData, false); }
