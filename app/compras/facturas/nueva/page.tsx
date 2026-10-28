import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {leerRazonesSociales} from "@/lib/compras/razonesSociales";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { CUENTAS_GASTO, CUENTAS_MEMO, NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import { hoyCalendarioMX, fechaTexto } from "@/lib/formato";
import type { InicioCubre } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { FormGastoManual } from "./FormGastoManual";

/** Gasto con proveedor que aún no tiene CFDI: prefactura, recibo o pago sin factura. */
export default async function NuevoGastoManual({ searchParams }: { searchParams: Promise<{ error?: string; proveedor?: string; sucursal?: string; compromiso?: string; vence?: string }> }) {
  const { error, proveedor, sucursal, compromiso, vence } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/facturas");
  // Desde un compromiso fijo: proveedor y sucursal ya puestos, y al guardar se liga a esa fecha.
  let inicial: { proveedor: string; sucursal: string; compromiso: string; vence: string; revision: number } | undefined;
  if (proveedor && sucursal && compromiso && vence) {
    const { data } = await supabase.from("compromiso_fechas").select("revision").eq("compromiso_id", compromiso).eq("vence", vence).maybeSingle<{ revision: number }>();
    inicial = { proveedor, sucursal, compromiso, vence, revision: data?.revision ?? 0 };
  }
  const [{ data: proveedores }, { data: sucursales }] = await Promise.all([
    supabase.from("proveedores").select("id, razon_social, nombre_comercial, sucursal_id, cuenta_pl, cubre_meses, cubre_inicio").eq("activo", true).order("razon_social")
      .returns<{ id: string; razon_social: string; nombre_comercial: string | null; sucursal_id: string | null; cuenta_pl: string | null; cubre_meses: number; cubre_inicio: InicioCubre }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const razones=await leerRazonesSociales(supabase);
  return (
    <>
      <EncabezadoPagina titulo="Agregar gasto sin CFDI" descripcion={`Para una prefactura, un recibo o un pago sin factura. Se paga en Pagos y entra al P&L con la cuenta de cada renglón. Cuando llegue el CFDI, súbelo y elige qué gasto sustituye.${inicial ? ` Al guardarlo se liga al compromiso del ${fechaTexto(inicial.vence)}.` : ""}`} />
      <Aviso error={error} />
      <FormGastoManual inicial={inicial} razones={razones} hoy={hoyCalendarioMX()} sucursales={sucursales ?? []}
        proveedores={(proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre_comercial ?? p.razon_social, sucursal_id: p.sucursal_id, cuenta_pl: p.cuenta_pl, cubre_meses: p.cubre_meses, cubre_inicio: p.cubre_inicio }))}
        cuentas={[...CUENTAS_GASTO, ...CUENTAS_MEMO].map((c) => ({ clave: c, nombre: NOMBRE_CUENTA[c] }))} />
    </>
  );
}
