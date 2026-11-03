"use server";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { SOLO_CONSULTA, esCorporativo } from "@/lib/roles";
import { clave, leerNuevaTarea, numeroDeClave } from "@/lib/tareas";
import { volver } from "../compras/servidor";
import { mensajeDe } from "./datos";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
/** Solo rutas internas de un solo "/": sin barra invertida ni caracteres de control (evita "/\\evil.com"). */
const rutaSegura = (r: string, otra: string) => (/^\/(?!\/)[^\\\x00-\x1f]*$/.test(r) ? r : otra);

async function cliente(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (esCorporativo(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}
const listo = (ruta: string, msg: string): never => { revalidatePath("/tareas", "layout"); revalidatePath("/"); return volver(ruta, "ok", msg); };

export async function crearTarea(fd: FormData) {
  const ruta = rutaSegura(texto(fd, "volver_a"), "/tareas/nueva");
  const supabase = await cliente(ruta);
  const r = leerNuevaTarea((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { data, error } = await supabase.rpc("crear_tarea", { p_datos: r.datos });
  if (error) return volver(ruta, "error", mensajeDe(error));
  listo(`/tareas/${data}`, `${clave(Number(data))} creada y asignada.`);
}

export async function moverTarea(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = rutaSegura(texto(fd, "volver_a"), numero ? `/tareas/${numero}` : "/tareas");
  if (!numero) return volver(ruta, "error", "Tarea no encontrada.");
  const supabase = await cliente(ruta);
  const { error } = await supabase.rpc("mover_tarea", {
    p_numero: numero, p_revision: Number(texto(fd, "revision")), p_estado: texto(fd, "estado"), p_comentario: texto(fd, "comentario"),
  });
  if (error) return volver(ruta, "error", mensajeDe(error));
  listo(ruta, `${clave(numero)} actualizada.`);
}

export async function actualizarTarea(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = numero ? `/tareas/${numero}` : "/tareas";
  if (!numero) return volver(ruta, "error", "Tarea no encontrada.");
  const supabase = await cliente(ruta);
  const r = leerNuevaTarea((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { titulo, descripcion, prioridad, vence, asignado_a } = r.datos;
  const { error } = await supabase.rpc("actualizar_tarea", {
    p_numero: numero, p_revision: Number(texto(fd, "revision")), p_datos: { titulo, descripcion, prioridad, vence, asignado_a },
  });
  if (error) return volver(ruta, "error", mensajeDe(error));
  listo(ruta, "Cambios guardados.");
}

export async function comentarTarea(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = numero ? `/tareas/${numero}` : "/tareas";
  if (!numero) return volver(ruta, "error", "Tarea no encontrada.");
  const supabase = await cliente(ruta);
  const { error } = await supabase.rpc("comentar_tarea", { p_numero: numero, p_texto: texto(fd, "comentario") });
  if (error) return volver(ruta, "error", mensajeDe(error));
  listo(ruta, "Comentario agregado.");
}
