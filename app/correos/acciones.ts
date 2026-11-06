"use server";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { limpiarHtml } from "@/lib/correos/html";
import { volver } from "../compras/servidor";
import { etiquetaDeFormulario } from "@/lib/correos/etiqueta";
import { mensajeDe } from "./datos";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
/** Solo rutas internas de un solo "/" (evita redirecciones a otros sitios desde un campo oculto). */
const rutaSegura = (r: string, otra: string) => (/^\/(?!\/)[^\\\x00-\x1f]*$/.test(r) ? r : otra);
async function cliente(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) volver(ruta, "error", "Solo marketing o administración puede hacer esto.");
  return supabase;
}
/** "2026-11-07T12:00" (hora de México del input datetime-local) → ISO con -06:00 (México ya no usa horario de verano). */
const isoMX = (local: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00-06:00` : null);

export async function guardarCampana(fd: FormData) {
  const id = texto(fd, "id") || null, ruta = id ? `/correos/${id}/editar` : "/correos/nueva";
  const sb = await cliente(ruta);
  const html = String(fd.get("html") ?? "").trim();
  if (html.length > 500_000) volver(ruta, "error", "El HTML pasa de 500 000 caracteres.");
  const etiqueta = etiquetaDeFormulario(String(fd.get("etiqueta") ?? ""));
  if (etiqueta === undefined) volver(ruta, "error", "Elige a quién va la campaña.");
  const limpio = limpiarHtml(html);
  const { data, error } = await sb.rpc("correo_guardar_campana", { p: { id, nombre: texto(fd, "nombre"), asunto: texto(fd, "asunto"), html: limpio.html, etiqueta } });
  if (error) volver(ruta, "error", mensajeDe(error));
  revalidatePath("/correos", "layout");
  volver(`/correos/${data}/editar`, "ok", limpio.quitados ? `Guardada. Se quitaron ${limpio.quitados} partes con scripts que los correos bloquean.` : "Guardada.");
}

export async function cambiarEstado(fd: FormData) {
  const id = texto(fd, "id"), accionTxt = texto(fd, "accion"), ruta = rutaSegura(texto(fd, "volver_a"), `/correos/${id}`);
  const sb = await cliente(ruta);
  const conFecha = accionTxt === "programar" && texto(fd, "cuando") === "fecha";
  const cuando = conFecha ? isoMX(texto(fd, "fecha")) : null;
  if (conFecha && !cuando) volver(ruta, "error", "Elige fecha y hora.");
  const { error } = await sb.rpc("correo_cambiar_estado", { p_id: id, p_accion: accionTxt, p_cuando: cuando });
  if (error) volver(ruta, "error", mensajeDe(error));
  revalidatePath("/correos", "layout");
  const msg: Record<string, string> = { programar: "Programada.", borrador: "Regresó a borrador.", cancelar: "Cancelada.", detener: "Detenida.", reanudar: "Reanudada.", reintentar: "Los que tenían problema vuelven a la cola." };
  volver(accionTxt === "programar" || accionTxt === "cancelar" ? `/correos/${id}` : ruta, "ok", msg[accionTxt] ?? "Listo.");
}

export async function mandarPrueba(fd: FormData) {
  const id = texto(fd, "id"), ruta = `/correos/${id}/editar`;
  const sb = await cliente(ruta);
  const correos = texto(fd, "correos").split(/[,;\s]+/).filter(Boolean);
  const { data, error } = await sb.rpc("correo_mandar_prueba", { p_id: id, p_correos: correos });
  if (error) volver(ruta, "error", mensajeDe(error));
  volver(ruta, "ok", `Prueba en camino a ${data} correo${data === 1 ? "" : "s"}; llega en menos de un minuto.`);
}
