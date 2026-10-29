import type { SupabaseClient } from "@supabase/supabase-js";
import { contarAlertas, ventanaAlertas, type Alertas, type FilaCumplimiento, type Obligacion } from "@/lib/cumplimiento";

export type ObligacionConNombres = Obligacion & {
  sucursales: { nombre: string } | null; razones_sociales: { razon_social: string } | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};
export const ambitoTexto = (o: ObligacionConNombres) => o.sucursales?.nombre ?? o.razones_sociales?.razon_social ?? o.razon_social_rfc ?? "Sin ámbito";
export const proveedorTexto = (o: ObligacionConNombres) => o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social ?? "Sin proveedor";

export async function leerFilas(supabase: SupabaseClient, desde: string, hasta: string, hoy: string): Promise<FilaCumplimiento[]> {
  const { data, error } = await supabase.rpc("cumplimiento_en_rango", { p_desde: desde, p_hasta: hasta, p_hoy: hoy });
  if (error) throw new Error(error.message);
  return (data ?? []) as FilaCumplimiento[];
}

/** Contadores de la franja de alertas (inicio y calendario), en la misma ventana que los avisos de n8n. */
export async function leerAlertas(supabase: SupabaseClient, hoy: string): Promise<Alertas> {
  const { desde, hasta } = ventanaAlertas(hoy);
  return contarAlertas(await leerFilas(supabase, desde, hasta, hoy), hoy);
}

export async function leerObligaciones(supabase: SupabaseClient, id?: string): Promise<ObligacionConNombres[]> {
  let q = supabase.from("cumplimiento_obligaciones").select("*, sucursales(nombre), razones_sociales(razon_social), proveedores(razon_social, nombre_comercial)").order("nombre").order("id");
  if (id) q = q.eq("id", id);
  const { data, error } = await q.returns<ObligacionConNombres[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => ({ ...o, monto_estimado: o.monto_estimado === null ? null : Number(o.monto_estimado) }));
}

/** Sucursales y razones sociales activas en una sola lista (`s:<id>` / `r:<RFC>`), y proveedores activos. */
export async function leerOpciones(supabase: SupabaseClient) {
  const [{ data: sucursales }, { data: razones }, { data: proveedores }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("razones_sociales").select("rfc, razon_social").eq("activa", true).order("razon_social").returns<{ rfc: string; razon_social: string }[]>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
  ]);
  return {
    ambitos: [...(sucursales ?? []).map((s) => ({ valor: `s:${s.id}`, nombre: `Sucursal · ${s.nombre}` })), ...(razones ?? []).map((r) => ({ valor: `r:${r.rfc}`, nombre: `Razón social · ${r.razon_social}` }))],
    proveedores: (proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre_comercial ?? p.razon_social })),
  };
}
