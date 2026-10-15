"use server";
import {revalidatePath} from "next/cache";
import {clienteAdmin} from "../servidor";
import {leerArticulo} from "@/lib/compras/proveedores";

export async function crearArticuloDesdeCotizacion(ordenId:string,fd:FormData) {
  const supabase=await clienteAdmin(`/compras/ordenes/${ordenId}`);
  const {data:orden,error:problema}=await supabase.from("ordenes_compra").select("id,estado").eq("id",ordenId).maybeSingle();
  if(problema||!orden||!["borrador","enviada"].includes(orden.estado))return {error:"La cotización ya no permite agregar artículos."};
  const r=leerArticulo(c=>String(fd.get(c)??""));
  if("error" in r)return {error:r.error};
  const {data,error}=await supabase.from("articulos").insert(r.datos).select("id,nombre,unidad").single();
  if(error)return {error:error.code==="23505"?"Ya existe un artículo con ese nombre o ID de Dodo IS. Selecciónalo del catálogo.":"No se pudo crear el artículo. Intenta nuevamente."};
  revalidatePath("/compras","layout");
  return {articulo:data as {id:string;nombre:string;unidad:string}};
}
