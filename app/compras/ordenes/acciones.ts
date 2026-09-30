"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leerRenglon } from "@/lib/compras/ordenes";
import { clienteAdmin, volver } from "../servidor";

const ruta = (id: string) => `/compras/ordenes/${id}`;
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const sucursalDe = (valor: string) => (valor === "oficina" || valor === "" ? null : valor);

function listo(id: string, mensaje: string): never {
  revalidatePath("/compras", "layout");
  revalidatePath("/recepciones");
  return volver(ruta(id), "ok", mensaje);
}

export async function crearOrden(fd: FormData) {
  const destino = "/compras/ordenes/nueva";
  const supabase = await clienteAdmin(destino);
  const proveedor_id = texto(fd, "proveedor_id");
  if (!proveedor_id) volver(destino, "error", "Elige el proveedor.");
  const { data, error } = await supabase.from("ordenes_compra")
    .insert({ proveedor_id, sucursal_id: sucursalDe(texto(fd, "sucursal_id")), notas: texto(fd, "notas") || null })
    .select("id").single();
  if (error) volver(destino, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(ruta(data!.id));
}

export async function editarOrden(fd: FormData) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.rpc("editar_orden", {
    p_id: id, p_proveedor: texto(fd, "proveedor_id"), p_sucursal: sucursalDe(texto(fd, "sucursal_id")), p_notas: texto(fd, "notas"),
  });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Cotización actualizada.");
}

export async function agregarRenglon(fd: FormData) {
  const id = texto(fd, "orden_id");
  const supabase = await clienteAdmin(ruta(id));
  const r = leerRenglon((c) => texto(fd, c));
  if ("error" in r) volver(ruta(id), "error", r.error);
  const { datos } = r as { datos: { articulo_id: string; cantidad: number; precio: number } };
  const { data: articulo } = await supabase.from("articulos").select("nombre, tasa_iva, activo").eq("id", datos.articulo_id)
    .maybeSingle<{ nombre: string; tasa_iva: string; activo: boolean }>();
  if (!articulo?.activo) volver(ruta(id), "error", "Elige un artículo activo.");
  const { error } = await supabase.from("orden_renglones").insert({
    orden_id: id, articulo_id: datos.articulo_id, descripcion: articulo!.nombre, cantidad: datos.cantidad, precio: datos.precio, tasa_iva: articulo!.tasa_iva,
  });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Renglón agregado.");
}

export async function editarRenglon(fd: FormData) {
  const id = texto(fd, "orden_id");
  const supabase = await clienteAdmin(ruta(id));
  const r = leerRenglon((c) => (c === "articulo_id" ? "x" : texto(fd, c)));
  if ("error" in r) volver(ruta(id), "error", r.error);
  const { datos } = r as { datos: { cantidad: number; precio: number } };
  const { error } = await supabase.from("orden_renglones").update({ cantidad: datos.cantidad, precio: datos.precio })
    .eq("id", texto(fd, "renglon_id")).eq("orden_id", id);
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Renglón actualizado.");
}

export async function quitarRenglon(fd: FormData) {
  const id = texto(fd, "orden_id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.from("orden_renglones").delete().eq("id", texto(fd, "renglon_id")).eq("orden_id", id);
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Renglón quitado.");
}

async function llamar(fd: FormData, funcion: string, argumentos: Record<string, unknown>, mensaje: string) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.rpc(funcion, { p_id: id, ...argumentos });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, mensaje);
}

export async function enviarOrden(fd: FormData) {
  await llamar(fd, "enviar_orden", {}, "Cotización marcada como enviada al proveedor.");
}
export async function confirmarOrden(fd: FormData) {
  await llamar(fd, "confirmar_orden", {}, "Orden de compra confirmada. Ya la ve la sucursal.");
}
export async function cancelarOrden(fd: FormData) {
  await llamar(fd, "cancelar_orden", { p_motivo: texto(fd, "motivo") }, "Orden cancelada.");
}
export async function cerrarOrden(fd: FormData) {
  await llamar(fd, "cerrar_orden", { p_motivo: texto(fd, "motivo") }, "Orden cerrada.");
}

export async function copiarOrden(fd: FormData) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { data, error } = await supabase.rpc("copiar_orden", { p_id: id, p_proveedor: texto(fd, "proveedor_id") });
  if (error) volver(ruta(id), "error", error.message);
  listo(String(data), "Cotización alternativa creada con los mismos renglones. Captura los precios de este proveedor.");
}

export async function anularRecepcionApp(fd: FormData) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.rpc("anular_recepcion", { p_id: texto(fd, "recepcion_id"), p_motivo: texto(fd, "motivo") });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Recepción anulada.");
}
