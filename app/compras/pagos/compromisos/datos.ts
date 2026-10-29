import type { SupabaseClient } from "@supabase/supabase-js";
import { impuestosDe, type Compromiso, type FechaCompromiso } from "@/lib/compras/compromisos";
import { calcularGasto } from "@/lib/compras/gastoManual";

export type CompromisoConNombres = Compromiso & { sucursales: { nombre: string } | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null };
export const proveedorDe = (c: CompromisoConNombres) => c.proveedores?.nombre_comercial ?? c.proveedores?.razon_social ?? "Proveedor";
export const sucursalDe = (c: CompromisoConNombres) => c.sucursales?.nombre ?? "Sucursal";
/** Subtotal, IVA, retenciones y total a pagar del compromiso (mismo cálculo que el gasto sin CFDI). */
export const importesDe = (c: Pick<Compromiso, "monto_estimado" | "iva" | "ret_iva" | "ret_isr">) => calcularGasto([{ importe: c.monto_estimado }], impuestosDe(c));

export async function leerCompromisos(supabase: SupabaseClient, id?: string): Promise<CompromisoConNombres[]> {
  let q = supabase.from("compromisos").select("*, sucursales(nombre), proveedores(razon_social, nombre_comercial)").order("inicio").order("id");
  if (id) q = q.eq("id", id);
  const { data, error } = await q.returns<CompromisoConNombres[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ ...c, monto_estimado: Number(c.monto_estimado), iva: Number(c.iva) }));
}

/** Fechas calculadas de todos los compromisos en el rango, con lo guardado de cada una. */
export async function leerFechas(supabase: SupabaseClient, desde: string, hasta: string): Promise<FechaCompromiso[]> {
  const { data, error } = await supabase.rpc("compromisos_en_rango", { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  return ((data ?? []) as FechaCompromiso[]).map((f) => ({ ...f, factura_saldo: f.factura_saldo === null ? null : Number(f.factura_saldo) }));
}

export async function leerOpciones(supabase: SupabaseClient) {
  const [{ data: sucursales }, { data: proveedores }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
  ]);
  return { sucursales: sucursales ?? [], proveedores: (proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre_comercial ?? p.razon_social })) };
}
