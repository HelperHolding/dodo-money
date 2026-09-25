"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SUCURSAL } from "@/lib/contexto";
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
  (await cookies()).delete(COOKIE_SUCURSAL);
  redirect("/login");
}
