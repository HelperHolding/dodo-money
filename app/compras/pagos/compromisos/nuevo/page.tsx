import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { compromisoDesdeFactura } from "@/lib/compras/compromisos";
import { leerOpciones } from "../datos";
import { FormCompromiso } from "../FormCompromiso";

export default async function NuevoCompromiso({ searchParams }: { searchParams: Promise<{ error?: string; sucursal?: string; factura?: string }> }) {
  const { error, sucursal, factura } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/pagos/compromisos");
  const opciones = await leerOpciones(supabase);
  // "Hacer compromiso" desde una factura: sus datos llenan el formulario y se liga a la primera fecha.
  let desdeFactura: { id: string; datos: ReturnType<typeof compromisoDesdeFactura> } | undefined;
  if (factura) {
    const [{ data: f }, { data: conceptos }] = await Promise.all([
      supabase.from("facturas").select("id, proveedor_id, sucursal_id, subtotal, descuento, iva, retencion_iva, retencion_isr, vence_el").eq("id", factura)
        .maybeSingle<{ id: string; proveedor_id: string; sucursal_id: string | null; subtotal: number; descuento: number; iva: number; retencion_iva: number; retencion_isr: number; vence_el: string }>(),
      supabase.from("factura_conceptos").select("descripcion").eq("factura_id", factura).order("id").limit(1).returns<{ descripcion: string }[]>(),
    ]);
    if (f?.sucursal_id) desdeFactura = { id: f.id, datos: compromisoDesdeFactura({ ...f, sucursal_id: f.sucursal_id }, conceptos?.[0]?.descripcion ?? "") };
  }
  return <>
    <EncabezadoPagina titulo="Nuevo compromiso" descripcion="Algo que se paga sí o sí cada cierto tiempo: renta, fumigación, basura, trampas de grasa." />
    <Aviso error={error} />
    <FormCompromiso {...opciones} hoy={hoyCalendarioMX()} sucursalInicial={sucursal} desdeFactura={desdeFactura} />
  </>;
}
