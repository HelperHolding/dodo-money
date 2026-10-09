"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fechaEntregaValida } from "@/lib/compras/entregas";
import { leerRenglon } from "@/lib/compras/ordenes";
import { clienteAdmin, volver } from "../servidor";

const ruta = (id: string) => `/compras/ordenes/${id}`;
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const sucursalDe = (valor: string) => (valor === "oficina" || valor === "" ? null : valor);

export async function facturarOrden(fd:FormData) {
  const id=texto(fd,'id'),supabase=await clienteAdmin(ruta(id));
  const {data:factura,error}=await supabase.rpc('facturar_orden',{p_orden:id});
  if(error)volver(ruta(id),'error',error.message);
  revalidatePath('/compras','layout');
  volver(`/compras/facturas/${factura}`,'ok','Factura de la orden disponible. Revisa sus cuentas y registra el pago. Si está Sin CFDI, podrás sustituirla al recibir el XML.');
}

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

/** El admin ajusta cuándo se espera la entrega (el proveedor dio otro día). */
export async function cambiarEntregaEsperada(fd: FormData) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const fecha = texto(fd, "entrega_esperada");
  if (!fechaEntregaValida(fecha)) volver(ruta(id), "error", "Escribe la fecha en que se espera la entrega.");
  const { error } = await supabase.rpc("cambiar_entrega_esperada", { p_orden: id, p_fecha: fecha });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Entrega esperada actualizada.");
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

/** Recepción real, también anterior a la captura de la orden. */
export async function registrarRecepcionOrden(fd: FormData) {
 const id=texto(fd,"id"), db=await clienteAdmin(ruta(id));
 const renglones=fd.getAll("renglon").map(x=>({id:String(x),cantidad:Number(String(fd.get(`cantidad_${x}`)??"").replace(/[$,\s]/g,""))})).filter(x=>x.cantidad!==0);
 if(!renglones.length||renglones.some(x=>!Number.isFinite(x.cantidad)||x.cantidad<=0))volver(ruta(id),"error","Indica las cantidades recibidas; deja vacíos los renglones que no llegaron.");
 const {error}=await db.rpc("registrar_recepcion_orden",{p_orden:id,p_fecha:texto(fd,"fecha_recepcion"),p_motivo:texto(fd,"motivo"),p_renglones:renglones,p_lote:texto(fd,"lote")});
 if(error)volver(ruta(id),"error",error.message);
 listo(id,"Recepción registrada con su fecha real.");
}

export async function agregarNotaOrden(fd: FormData) {
 const id=texto(fd,"id"),supabase=await clienteAdmin(ruta(id));
 const {error}=await supabase.rpc("agregar_compra_nota",{p_solicitud:texto(fd,"solicitud"),p_tipo:"orden",p_id:id,p_texto:texto(fd,"nota")});
 if(error)volver(ruta(id),"error",error.message);
 revalidatePath("/compras","layout");
 volver(ruta(id),"ok","Nota interna guardada.");
}
