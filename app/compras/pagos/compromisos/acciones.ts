"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { leerCompromiso } from "@/lib/compras/compromisos";
import { MAX_ADJUNTO, validarAdjunto } from "@/lib/compras/adjuntos";
import { clienteAdmin, volver } from "../../servidor";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();

export async function guardarCompromiso(fd: FormData) {
  const id = texto(fd, "id");
  const ruta = id ? `/compras/pagos/compromisos/${id}/editar` : "/compras/pagos/compromisos/nuevo";
  const supabase = await clienteAdmin(ruta);
  const r = leerCompromiso((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { data, error } = await supabase.rpc("guardar_compromiso", { p_id: id || null, p_revision: Number(texto(fd, "revision") || 0), p_datos: r.datos });
  if (error) return volver(ruta, "error", error.message);
  revalidatePath("/compras/pagos", "layout");
  volver(`/compras/pagos/compromisos/${data}`, "ok", "Compromiso guardado.");
}

const rutaDe = (fd: FormData) => `/compras/pagos/compromisos/${texto(fd, "compromiso_id")}`;
const base = (fd: FormData) => ({ p_compromiso: texto(fd, "compromiso_id"), p_vence: texto(fd, "vence"), p_revision: Number(texto(fd, "revision") || 0) });
/** Como `volver`, pero regresa a la tarjeta de la fecha: el ancla va después del aviso. */
const aFecha = (fd: FormData, clave: "ok" | "error", msg: string): never =>
  redirect(`${rutaDe(fd)}?${clave}=${encodeURIComponent(msg)}#fecha-${texto(fd, "vence")}`);
const hecho = (fd: FormData, msg: string) => { revalidatePath("/compras/pagos", "layout"); aFecha(fd, "ok", msg); };

export async function ligarFactura(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("ligar_factura_compromiso", { ...base(fd), p_factura: texto(fd, "factura_id") || null });
  if (error) return aFecha(fd, "error", error.message);
  hecho(fd, texto(fd, "factura_id") ? "Factura ligada. Ya no se cuenta como previsto." : "Factura quitada de la fecha.");
}

export async function comprobarServicio(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("comprobar_servicio_compromiso", { ...base(fd), p_estado: texto(fd, "servicio"), p_fecha: texto(fd, "servicio_fecha") || null, p_nota: texto(fd, "servicio_nota") });
  if (error) return aFecha(fd, "error", error.message);
  hecho(fd, "Servicio actualizado.");
}

export async function omitirFecha(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("omitir_fecha_compromiso", { ...base(fd), p_motivo: texto(fd, "motivo") });
  if (error) return aFecha(fd, "error", error.message);
  hecho(fd, texto(fd, "motivo") ? "Fecha omitida." : "Omisión quitada.");
}

export async function subirEvidencia(fd: FormData) {
  const ruta = rutaDe(fd), supabase = await clienteAdmin(ruta);
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || !archivo.size || archivo.size > MAX_ADJUNTO) return aFecha(fd, "error", "Elige una foto o PDF de hasta 4 MB.");
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let formato: ReturnType<typeof validarAdjunto>;
  try { formato = validarAdjunto(archivo.name, bytes); } catch (e) { return aFecha(fd, "error", e instanceof Error ? e.message : "Archivo inválido."); }
  const sha = createHash("sha256").update(bytes).digest("hex"), solicitud = texto(fd, "solicitud");
  const { data, error } = await supabase.rpc("preparar_evidencia_compromiso", { p_id: solicitud, p_compromiso: texto(fd, "compromiso_id"), p_vence: texto(fd, "vence"), p_nombre: formato.nombre, p_extension: formato.extension, p_mime: formato.mime, p_bytes: bytes.length, p_sha256: sha });
  if (error) return aFecha(fd, "error", error.message);
  const ev = data as { ruta: string; disponible: boolean };
  if (!ev.disponible) {
    const subido = await supabase.storage.from("adjuntos-compras").upload(ev.ruta, bytes, { contentType: formato.mime, upsert: false });
    if (subido.error) {
      // Reintento tras una respuesta perdida: si ya está el mismo archivo, se confirma.
      const previo = await supabase.storage.from("adjuntos-compras").download(ev.ruta);
      if (previo.error || !previo.data || createHash("sha256").update(new Uint8Array(await previo.data.arrayBuffer())).digest("hex") !== sha) return aFecha(fd, "error", "No se pudo subir el archivo. Vuelve a intentarlo.");
    }
    const { error: e2 } = await supabase.rpc("confirmar_evidencia_compromiso", { p_id: solicitud });
    if (e2) return aFecha(fd, "error", "El archivo se subió pero no se pudo confirmar. Vuelve a intentarlo.");
  }
  hecho(fd, "Evidencia guardada.");
}
