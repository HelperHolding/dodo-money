"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { leerArticulo, leerDesactivacion, leerProveedor, type DatosArticulo, type DatosProveedor } from "@/lib/compras/proveedores";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";

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
