import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Caja, Perfil, Sucursal, Turno } from "@/lib/tipos";

/** Sesión, perfil, sucursal, cajas y turno abierto. Redirige a /login si falta algo. */
export async function obtenerContexto() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles").select("id, nombre, rol, sucursal_id").eq("id", user.id).single<Perfil>();
  if (!perfil?.sucursal_id) redirect("/login?error=sin-perfil");

  const [{ data: sucursal }, { data: cajas }, { data: turno }] = await Promise.all([
    supabase.from("sucursales")
      .select("id, nombre, fondo_caja_venta, fondo_cambios, fondo_caja_chica, limite_retiro")
      .eq("id", perfil.sucursal_id).single<Sucursal>(),
    supabase.from("cajas").select("id, tipo, nombre").eq("sucursal_id", perfil.sucursal_id).returns<Caja[]>(),
    supabase.from("turnos").select("id, fecha, tipo, abierto_en, cerrado_en, encargado_id")
      .eq("sucursal_id", perfil.sucursal_id).is("cerrado_en", null)
      .order("abierto_en", { ascending: false }).limit(1).maybeSingle<Turno>(),
  ]);
  if (!sucursal) redirect("/login?error=sin-sucursal");

  const cajaPorTipo = Object.fromEntries((cajas ?? []).map((c) => [c.tipo, c])) as Partial<Record<Caja["tipo"], Caja>>;

  return { supabase, user, perfil, sucursal, cajas: cajas ?? [], cajaPorTipo, turno: turno ?? null };
}

export const puedeGestionar = (rol: Perfil["rol"]) => rol === "gerente" || rol === "admin";
export const puedeAbrirTurno = (rol: Perfil["rol"]) => rol !== "cajero";
