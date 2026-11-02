"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SUCURSAL } from "@/lib/contexto";
import { COOKIE_HOST } from "@/lib/seguridad";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function iniciarSesion(formData: FormData) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("correo") ?? ""),
    password: String(formData.get("contrasena") ?? ""),
  });
  if (error) redirect("/login?error=credenciales");
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  // Una cookie __Host- solo se puede borrar con Secure y Path=/.
  (await cookies()).delete({ name: COOKIE_SUCURSAL, ...COOKIE_HOST });
  redirect("/login");
}
