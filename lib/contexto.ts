import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { esCorporativo, puedeEntrar, SOLO_CONSULTA } from "@/lib/roles";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Caja, Perfil, Sucursal, Turno } from "@/lib/tipos";

export { puedeAbrirTurno, puedeGestionar, puedeSupervisar } from "@/lib/roles";

/** Sucursal que corporativo eligió en la vista general. */
export const COOKIE_SUCURSAL = "sucursal_vista";

/**
 * Sesión y perfil, sin sucursal. Redirige a /login si falta algo, y a /cuenta si tiene que cambiar su contraseña
 * temporal (salvo en la propia pantalla de /cuenta).
 */
export async function obtenerPerfil({ permitirCambioPendiente = false }: { permitirCambioPendiente?: boolean } = {}) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles").select("id, nombre, rol, sucursal_id, activo, debe_cambiar_contrasena").eq("id", user.id).single<Perfil>();
  if (!perfil) redirect("/login?error=sin-perfil");
  if (!puedeEntrar(perfil)) redirect("/login?error=inactivo");
  if (perfil.debe_cambiar_contrasena && !permitirCambioPendiente) redirect("/cuenta");

  return { supabase, user, perfil };
}

/**
 * Sesión, perfil, sucursal, cajas y turno abierto.
 * Corporativo ve la sucursal que eligió (cookie) en solo lectura; sin elegir, vuelve a la vista general.
 */
export async function obtenerContexto() {
  const { supabase, user, perfil } = await obtenerPerfil();
  const soloLectura = esCorporativo(perfil.rol);
  const sucursalId = soloLectura ? (await cookies()).get(COOKIE_SUCURSAL)?.value : perfil.sucursal_id;
  if (!sucursalId) redirect(soloLectura ? "/corporativo" : "/login?error=sin-perfil");

  const [{ data: sucursal }, { data: cajas }, { data: turno }] = await Promise.all([
    supabase.from("sucursales")
      .select("id, nombre, fondo_caja_venta, fondo_cambios, fondo_caja_chica, limite_retiro, fondo_boveda, fondo_emergencia")
      .eq("id", sucursalId).maybeSingle<Sucursal>(),
    supabase.from("cajas").select("id, tipo, nombre").eq("sucursal_id", sucursalId).returns<Caja[]>(),
    supabase.from("turnos").select("id, fecha, tipo, abierto_en, cerrado_en, encargado_id")
      .eq("sucursal_id", sucursalId).is("cerrado_en", null)
      .order("abierto_en", { ascending: false }).limit(1).maybeSingle<Turno>(),
  ]);
  if (!sucursal) redirect(soloLectura ? "/corporativo" : "/login?error=sin-sucursal");

  const cajaPorTipo = Object.fromEntries((cajas ?? []).map((c) => [c.tipo, c])) as Partial<Record<Caja["tipo"], Caja>>;

  return { supabase, user, perfil, sucursal, cajas: cajas ?? [], cajaPorTipo, turno: turno ?? null, soloLectura };
}

/** Para server actions que escriben: corporativo regresa a `ruta` con el aviso de solo consulta. */
export async function obtenerContextoParaEscribir(ruta: string) {
  const contexto = await obtenerContexto();
  if (contexto.soloLectura) redirect(`${ruta}?error=${encodeURIComponent(SOLO_CONSULTA)}`);
  return contexto;
}
