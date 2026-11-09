"use server";
import { redirect } from "next/navigation";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/** Solo se ejecuta al pulsar el botón (POST); abrir la página no da de baja. */
export async function darDeBaja(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!/^[0-9a-f]{64}$/.test(token)) redirect("/baja/invalido?estado=invalido");
  let listo = false;
  try {
    const { data } = await crearClienteAdmin().rpc("correo_baja_por_token", { p_token: token });
    listo = Boolean(data);
  } catch { listo = false; }
  redirect(`/baja/${token}?estado=${listo ? "listo" : "invalido"}`);
}
