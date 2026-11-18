"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas } from "@/lib/roles";
import { CATEGORIAS_CAPEX, leerRenglones, type RenglonCapex } from "@/lib/finanzas/capex";

const volver = (ruta: string, clave: "ok" | "error", texto: string) => redirect(`${ruta}?${clave}=${encodeURIComponent(texto)}`);

export async function aprobarPresupuesto(fd: FormData) {
  const proyecto = String(fd.get("proyecto") ?? "");
  const ruta = `/finanzas/capex/${proyecto}`;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver(ruta, "error", "Solo administración aprueba el presupuesto.");
  const montos: Record<string, number> = {};
  for (const c of CATEGORIAS_CAPEX) {
    const texto = String(fd.get(`monto_${c.clave}`) ?? "").replace(/[$,\s]/g, "");
    if (!texto) continue;
    const n = Number(texto);
    if (!Number.isFinite(n)) volver(ruta, "error", `El monto de ${c.nombre} no es un número.`);
    montos[c.clave] = Math.round(n * 100) / 100;
  }
  const { error } = await supabase.rpc("aprobar_capex_presupuesto", { p_proyecto: proyecto, p_revision_actual: Number(fd.get("revision") ?? 0), p_montos: montos, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) volver(ruta, "error", error.message);
  revalidatePath(ruta);
  revalidatePath("/finanzas/capex");
  volver(ruta, "ok", "Presupuesto aprobado.");
}

export async function guardarCapexDocumento(fd: FormData) {
  const tipo = fd.get("tipo") === "orden" ? "orden" : "factura";
  const documento = String(fd.get("documento") ?? "");
  const ruta = `/compras/${tipo === "orden" ? "ordenes" : "facturas"}/${documento}`;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver(ruta, "error", "Solo administración asigna CAPEX.");
  let renglones: RenglonCapex[] = [];
  try { renglones = leerRenglones(fd, Math.min(Number(fd.get("filas") ?? 0), 20)); }
  catch (e) { volver(ruta, "error", (e as Error).message); }
  const { error } = await supabase.rpc("guardar_capex_asignacion", { p_tipo: tipo, p_documento: documento, p_renglones: renglones, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) volver(ruta, "error", error.message);
  revalidatePath(ruta);
  revalidatePath("/finanzas/capex", "layout");
  volver(ruta, "ok", "CAPEX guardado.");
}
