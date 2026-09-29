"use server";

import { redirect } from "next/navigation";
import { errorDeContrasena } from "@/lib/contrasena";
import { obtenerPerfil } from "@/lib/contexto";
import { esCorporativo } from "@/lib/roles";

const volver = (clave: "ok" | "error", texto: string): never => redirect(`/cuenta?${clave}=${encodeURIComponent(texto)}`);

export async function cambiarContrasena(fd: FormData) {
  const { supabase, user, perfil } = await obtenerPerfil({ permitirCambioPendiente: true });
  const actual = String(fd.get("actual") ?? "");
  const nueva = String(fd.get("nueva") ?? "");
  const problema = errorDeContrasena(actual, nueva, String(fd.get("confirmar") ?? ""));
  if (problema) volver("error", problema);

  // Se comprueba la contraseña actual: una sesión olvidada abierta en la tableta no basta para cambiarla.
  const { error: noEs } = await supabase.auth.signInWithPassword({ email: user.email ?? "", password: actual });
  if (noEs) volver("error", "La contraseña actual no es correcta.");

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) volver("error", `No se pudo cambiar la contraseña: ${error.message}`);

  if (perfil.debe_cambiar_contrasena) {
    const { error: marca } = await supabase.rpc("contrasena_cambiada");
    if (marca) volver("error", `La contraseña se cambió, pero no se pudo registrar: ${marca.message}`);
    // Primera vez: ya puede usar la app.
    redirect(esCorporativo(perfil.rol) ? "/corporativo" : "/");
  }
  volver("ok", "Contraseña cambiada.");
}
