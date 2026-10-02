"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { leerArticulo, leerDesactivacion, leerProveedor, leerSeleccionProveedores, type DatosArticulo, type DatosProveedor } from "@/lib/compras/proveedores";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { extensionDocumento, leerDocumento, MAX_BYTES_DOCUMENTO, rutaDocumento } from "@/lib/compras/documentos";
import { hoyCalendarioMX } from "@/lib/formato";

const volver = (ruta: string, clave: "ok" | "error", texto: string): never =>
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent(texto)}`);

async function clienteAdmin(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}

/** Alta (sin id) o edición (con id) de un proveedor. */
export async function guardarProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = id ? `/compras/proveedores/${id}` : "/compras/proveedores/nuevo";
  const supabase = await clienteAdmin(ruta);
  const r = leerProveedor((c) => (c === "categorias" ? fd.getAll("categorias").join(",") : String(fd.get(c) ?? "")));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: DatosProveedor };

  const { data, error } = id
    ? await supabase.from("proveedores").update(datos).eq("id", id).select("id").single()
    : await supabase.from("proveedores").insert(datos).select("id").single();
  if (error) volver(ruta, "error", error.code === "23505" ? `Ya hay un proveedor con el RFC ${datos.rfc}.` : error.message);

  revalidatePath("/compras", "layout");
  volver(`/compras/proveedores/${data!.id}`, "ok", id ? "Proveedor actualizado." : "Proveedor dado de alta.");
}

/** Sube una versión nueva de un documento del proveedor; las anteriores quedan en el historial. */
export async function subirDocumentoProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = `/compras/proveedores/${id}`;
  const supabase = await clienteAdmin(ruta);
  const r = leerDocumento(String(fd.get("tipo") ?? ""), String(fd.get("fecha") ?? ""), hoyCalendarioMX());
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { tipo: Parameters<typeof rutaDocumento>[1]; fecha: string } };
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) volver(ruta, "error", "Elige el archivo del documento.");
  const f = archivo as File;
  const extension = extensionDocumento(f.type);
  if (!extension) volver(ruta, "error", "El documento debe ser PDF o foto (JPG, PNG o WebP).");
  if (f.size > MAX_BYTES_DOCUMENTO) volver(ruta, "error", "El archivo pesa más de 4 MB. Si es foto, tómala con menos resolución o súbela como PDF.");

  const destino = rutaDocumento(id, datos.tipo, datos.fecha, crypto.randomUUID(), extension!);
  const { error: errorArchivo } = await supabase.storage.from("documentos-proveedores").upload(destino, f, { contentType: f.type, upsert: false });
  if (errorArchivo) volver(ruta, "error", `No se pudo subir el archivo: ${errorArchivo.message}`);
  const { error } = await supabase.from("documentos_proveedor").insert({ proveedor_id: id, tipo: datos.tipo, fecha: datos.fecha, ruta: destino });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", "Documento guardado.");
}

export async function cambiarActivoProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = `/compras/proveedores/${id}`;
  const supabase = await clienteAdmin(ruta);
  const r = leerDesactivacion(String(fd.get("activo") ?? ""), String(fd.get("motivo") ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { activo: boolean; motivo_desactivacion: string | null } };
  const { error } = await supabase.from("proveedores").update(datos).eq("id", id);
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", datos.activo ? "Proveedor reactivado." : "Proveedor desactivado. Su historial se conserva.");
}

/** Alta (sin id) o edición (con id) de un artículo; regresa a su tarjeta. */
export async function guardarArticulo(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const r = leerArticulo((c) => String(fd.get(c) ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: DatosArticulo };
  const { data, error } = id
    ? await supabase.from("articulos").update(datos).eq("id", id).select("id").single()
    : await supabase.from("articulos").insert(datos).select("id").single();
  if (error) {
    volver(ruta, "error", error.code === "23505"
      ? (error.message.includes("dodo_insumo_id") ? "Ese ID de insumo de Dodo IS ya está en otro artículo." : `Ya hay un artículo llamado ${datos.nombre}.`)
      : error.message);
  }
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(id ? "Artículo actualizado." : "Artículo dado de alta.")}#a-${data!.id}`);
}

/** Proveedores que surten un artículo (casillas) y cuál es el principal. Reemplaza los que tenía. */
export async function guardarProveedoresArticulo(fd: FormData) {
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const id = String(fd.get("id") ?? "");
  const r = leerSeleccionProveedores(fd.getAll("proveedores").map(String), String(fd.get("principal") ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { proveedores: string[]; principal: string | null } };
  const { error } = await supabase.rpc("guardar_proveedores_articulo", { p_articulo: id, p_proveedores: datos.proveedores, p_principal: datos.principal });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(datos.proveedores.length ? "Proveedores del artículo guardados." : "El artículo quedó sin proveedores.")}#a-${id}`);
}

export async function cambiarActivoArticulo(fd: FormData) {
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const id = String(fd.get("id") ?? "");
  const r = leerDesactivacion(String(fd.get("activo") ?? ""), String(fd.get("motivo") ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { activo: boolean; motivo_desactivacion: string | null } };
  const { error } = await supabase.from("articulos").update(datos).eq("id", id);
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(datos.activo ? "Artículo reactivado." : "Artículo desactivado.")}#a-${id}`);
}
