import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { CUENTAS_GASTO, CUENTAS_MEMO, NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { FormGastoManual } from "./FormGastoManual";

/** Gasto con proveedor que aún no tiene CFDI: prefactura, recibo o pago sin factura. */
export default async function NuevoGastoManual({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/facturas");
  const [{ data: proveedores }, { data: sucursales }] = await Promise.all([
    supabase.from("proveedores").select("id, razon_social, nombre_comercial, sucursal_id, cuenta_pl").eq("activo", true).order("razon_social")
      .returns<{ id: string; razon_social: string; nombre_comercial: string | null; sucursal_id: string | null; cuenta_pl: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  return (
    <>
      <div className="encabezado">
        <p><Link href="/compras/facturas">← Facturas</Link></p>
        <h1>Agregar gasto sin CFDI</h1>
        <p>Para una prefactura, un recibo o un pago sin factura. Se paga en Pagos y entra al P&L con la cuenta de cada renglón. Cuando llegue el CFDI, súbelo y elige qué gasto sustituye.</p>
      </div>
      <Aviso error={error} />
      <FormGastoManual hoy={hoyCalendarioMX()} sucursales={sucursales ?? []}
        proveedores={(proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre_comercial ?? p.razon_social, sucursal_id: p.sucursal_id, cuenta_pl: p.cuenta_pl }))}
        cuentas={[...CUENTAS_GASTO, ...CUENTAS_MEMO].map((c) => ({ clave: c, nombre: NOMBRE_CUENTA[c] }))} />
    </>
  );
}
