"use server";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { leerCsvContactos } from "@/lib/correos/csv";
import { volver } from "../../compras/servidor";
import { mensajeDe } from "../datos";

const R = "/correos/contactos";
const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
async function cliente() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) volver("/correos", "error", "Solo marketing o administración puede hacer esto.");
  return supabase;
}

/** El componente Importar lee el archivo en el navegador y manda su texto en `contenido` (previa y confirmación). */
export async function importarCsv(fd: FormData) {
  const sb = await cliente();
  const confirmar = texto(fd, "confirmar") === "1", contenido = texto(fd, "contenido");
  if (contenido.length > 5_000_000) volver(R, "error", "El archivo pesa más de 5 MB.");
  const { filas, error: e } = leerCsvContactos(contenido);
  if (e) volver(R, "error", e);
  const etiquetaExtra = texto(fd, "etiquetaExtra").toLowerCase();
  const conEtiqueta = filas.map((f) => ({ ...f, etiquetas: etiquetaExtra ? [...new Set([...f.etiquetas, etiquetaExtra])] : f.etiquetas }));
  const origen = texto(fd, "origen") || "CSV";
  const { data, error } = await sb.rpc("correo_importar_contactos", { p_filas: conEtiqueta, p_origen: origen, p_confirmar: confirmar });
  if (error) volver(R, "error", mensajeDe(error));
  const r = data as { nuevos: number; existentes: number; bajas: number; invalidos: number };
  const resumen = `${r.nuevos} nuevos, ${r.existentes} ya existían (se suman etiquetas), ${r.bajas} dados de baja (no se reactivan), ${r.invalidos} inválidos.`;
  if (confirmar) { revalidatePath("/correos", "layout"); volver(R, "ok", `Importado: ${resumen}`); }
  // Previa: la página reenvía el contenido (guardado en el navegador) para confirmar sin volver a subir el archivo.
  volver(`${R}?previa=${encodeURIComponent(resumen)}&origen=${encodeURIComponent(origen)}&etiquetaExtra=${encodeURIComponent(etiquetaExtra)}`, "ok", "Revisa el resumen y confirma.");
}

export async function guardarContacto(fd: FormData) {
  const sb = await cliente();
  const { error } = await sb.rpc("correo_guardar_contacto", { p: { id: texto(fd, "id") || null, email: texto(fd, "email"), nombre: texto(fd, "nombre"), etiquetas: texto(fd, "etiquetas").split(/[;,]/).map((x) => x.trim()).filter(Boolean) } });
  if (error) volver(R, "error", mensajeDe(error));
  revalidatePath(R); volver(R, "ok", "Contacto guardado.");
}

export async function bajaManual(fd: FormData) {
  const sb = await cliente();
  const { error } = await sb.rpc("correo_baja_manual", { p_id: texto(fd, "id") });
  if (error) volver(R, "error", mensajeDe(error));
  revalidatePath(R); volver(R, "ok", "Contacto dado de baja.");
}
