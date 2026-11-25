"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { rutaFoto, validarFoto } from "@/lib/fotos";
import { BUCKET_SOPORTE, clave, leerNuevoTicket, numeroDeClave, rutaInterna } from "@/lib/soporte";
import { volver } from "../compras/servidor";
import { atenderConAgente } from "@/lib/soporte/agenteCorrer";
import { mensajeDe } from "./datos";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
const listo = (ruta: string, msg: string): never => { revalidatePath("/soporte", "layout"); return volver(ruta, "ok", msg); };

export async function crearTicket(fd: FormData) {
  const desde = rutaInterna(texto(fd, "ruta_origen"));
  const ruta = `/soporte/nuevo${desde ? `?desde=${encodeURIComponent(desde)}` : ""}`;
  const r = leerNuevoTicket((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const foto = fd.get("foto");
  const archivo = foto instanceof File && foto.size > 0 ? foto : null;
  const problema = validarFoto(archivo);
  if (problema) return volver(ruta, "error", problema);
  const { supabase, perfil } = await obtenerPerfil();
  // La captura se sube primero; si el alta falla, se borra para no dejarla suelta.
  let captura: string | null = null;
  if (archivo) {
    captura = rutaFoto(perfil.id, crypto.randomUUID(), archivo.type);
    const { error } = await supabase.storage.from(BUCKET_SOPORTE).upload(captura, archivo, { contentType: archivo.type, upsert: false });
    if (error) return volver(ruta, "error", "No se pudo subir la captura. Intenta de nuevo o mándalo sin captura.");
  }
  const { data, error } = await supabase.rpc("crear_ticket", { p_datos: { ...r.datos, captura } });
  if (error) {
    if (captura) await supabase.storage.from(BUCKET_SOPORTE).remove([captura]);
    return volver(ruta, "error", mensajeDe(error));
  }
  // El agente corre después de responder, con la sesión de quien reporta. Si el ticket no quedó pendiente, no hace nada.
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (token) after(() => atenderConAgente({ numero: Number(data), token, rol: perfil.rol, sucursalId: perfil.sucursal_id ?? null }));
  listo(`/soporte/${data}`, `${clave(Number(data))} recibido. Aquí verás la respuesta.`);
}

export async function comentarTicket(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = numero ? `/soporte/${numero}` : "/soporte";
  if (!numero) return volver(ruta, "error", "Ticket no encontrado.");
  const { supabase } = await obtenerPerfil();
  const { error } = await supabase.rpc("comentar_ticket", { p_numero: numero, p_texto: texto(fd, "comentario") });
  if (error) return volver(ruta, "error", mensajeDe(error));
  listo(ruta, "Comentario enviado.");
}

/** Detalle (todos los campos) o tablero (solo estado). Una clave ausente no cambia. */
export async function cambiarTicket(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = rutaInterna(texto(fd, "volver_a")) ?? (numero ? `/soporte/${numero}` : "/soporte");
  if (!numero) return volver(ruta, "error", "Ticket no encontrado.");
  const datos: Record<string, string> = {};
  for (const c of ["estado", "prioridad", "responsable", "comentario"]) if (fd.has(c)) datos[c] = texto(fd, c);
  const { supabase } = await obtenerPerfil();
  const { error } = await supabase.rpc("cambiar_ticket", { p_numero: numero, p_revision: Number(texto(fd, "revision")), p_datos: datos });
  if (error) return volver(ruta, "error", mensajeDe(error));
  listo(ruta, `${clave(numero)} actualizado.`);
}

export async function guardarAjustes(fd: FormData) {
  const ruta = "/soporte/ajustes";
  const { supabase } = await obtenerPerfil();
  const { error } = await supabase.rpc("guardar_ajustes_soporte", {
    p_responsable: texto(fd, "responsable") || null,
    p_correos: texto(fd, "correos").split(/[\s,;]+/).filter(Boolean),
    p_avisar_nuevos: fd.get("avisar_nuevos") === "1",
    p_avisar_comentarios: fd.get("avisar_comentarios") === "1",
    p_agente_activo: fd.get("agente_activo") === "1",
    p_resumen_diario: fd.get("resumen_diario") === "1",
  });
  if (error) return volver(ruta, "error", mensajeDe(error));
  listo(ruta, "Ajustes guardados.");
}
