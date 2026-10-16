import { notFound, redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import type { DatosEmpresa } from "@/lib/compras/empresa";
import { puedeVerCompras } from "@/lib/roles";
import { FormatoOrden, type Orden, type Renglon } from "./Formato";

export const dynamic = "force-dynamic";

/** Documento para mandar al proveedor: fuera del layout para que se imprima limpio. */
export default async function OrdenImprimible({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  const [{ data: o }, { data: renglones }] = await Promise.all([
    supabase.from("ordenes_compra")
      .select("rfc_receptor, folio, estado, notas, creado_en, confirmada_en, entrega_esperada, proveedores(razon_social, nombre_comercial, rfc, contacto_nombre, telefono, correo, numero_cliente, dias_credito), sucursales(nombre)")
      .eq("id", id).maybeSingle<Orden & {rfc_receptor:string}>(),
    supabase.from("orden_renglones").select("id, descripcion, cantidad, precio, tasa_iva, articulos(nombre, unidad)")
      .eq("orden_id", id).order("creado_en").order("id").returns<Renglon[]>(),
  ]);
  if (!o) notFound();
  const {data:empresa}=await supabase.from("razones_sociales").select("rfc,razon_social,regimen_fiscal,codigo_postal,domicilio,correo_compras").eq("rfc",o.rfc_receptor).maybeSingle<DatosEmpresa>();
  return <FormatoOrden o={o} renglones={renglones ?? []} empresa={empresa ?? null} />;
}
