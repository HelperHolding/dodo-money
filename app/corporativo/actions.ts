"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SUCURSAL, obtenerPerfil } from "@/lib/contexto";
import { esCorporativo } from "@/lib/roles";

/** Guarda la sucursal elegida y abre sus pantallas en solo lectura. obtenerContexto() valida que exista. */
export async function verSucursal(formData: FormData) {
  const { perfil } = await obtenerPerfil();
  if (!esCorporativo(perfil.rol)) redirect("/");
  const id = String(formData.get("sucursal_id") ?? "");
  if (!id) redirect("/corporativo");
  (await cookies()).set(COOKIE_SUCURSAL, id, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}
