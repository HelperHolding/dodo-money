"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { BUCKET_FOTOS, rutaFoto, validarFoto } from "@/lib/fotos";
import { puedeRecibirCompras } from "@/lib/roles";

const volver = (clave: "ok" | "error", texto: string): never => redirect(`/recepciones?${clave}=${encodeURIComponent(texto)}`);

/** Confirma lo recibido de un renglón (activo fijo, servicio u otro). La foto se sube primero y es opcional. */
export async function recibirRenglon(fd: FormData) {
  const { supabase, perfil, sucursal } = await obtenerContextoParaEscribir("/recepciones");
  if (!puedeRecibirCompras(perfil.rol)) volver("error", "Solo encargado, gerente o administrador reciben compras.");
  const cantidad = Number(String(fd.get("cantidad") ?? "").replace(/,/g, ""));
  if (!(cantidad > 0)) volver("error", "Escribe la cantidad recibida.");
  const foto = fd.get("foto");
  const archivo = foto instanceof File && foto.size > 0 ? foto : null;
  const problema = validarFoto(archivo);
  if (problema) volver("error", problema);

  let fotoPath: string | null = null;
  if (archivo) {
    fotoPath = rutaFoto(sucursal.id, `recepciones/${crypto.randomUUID()}`, archivo.type);
    const { error: errorFoto } = await supabase.storage.from(BUCKET_FOTOS).upload(fotoPath, archivo, { contentType: archivo.type, upsert: false });
    if (errorFoto) volver("error", `No se pudo subir la foto: ${errorFoto.message}`);
  }
  const { error } = await supabase.rpc("recibir_renglon", {
    p_renglon: String(fd.get("renglon_id") ?? ""), p_cantidad: cantidad, p_fecha: String(fd.get("fecha") ?? ""), p_foto: fotoPath,
  });
  if (error) volver("error", error.message);
  revalidatePath("/recepciones");
  revalidatePath("/");
  volver("ok", "Recepción registrada.");
}
