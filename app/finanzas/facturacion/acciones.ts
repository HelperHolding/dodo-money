"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas } from "@/lib/roles";
import { facturapi } from "@/lib/facturacion/servidor";

const volver = (q: string): never => redirect(`/finanzas/facturacion?${q}`);
const err = (m: string) => `error=${encodeURIComponent(m)}`;
const ok = (m: string) => `ok=${encodeURIComponent(m)}`;

export async function cancelarFactura(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) return volver(err("Solo administración puede cancelar."));
  const id = String(fd.get("id")), motivo = fd.get("motivo") === "03" ? "03" : "02";
  const { data: f } = await supabase.from("facturas_clientes").select("facturapi_id, estado").eq("id", id).single();
  if (!f || f.estado !== "timbrada" || !f.facturapi_id) return volver(err("La factura no está timbrada."));
  const r = await facturapi().cancelar(f.facturapi_id as string, motivo);
  if (!r.ok) return volver(err(`Facturapi no canceló: ${r.mensaje}`));
  if (r.valor.status !== "canceled") return volver(err("La cancelación quedó pendiente de que el cliente la acepte en el SAT. Revisa más tarde."));
  const { error } = await supabase.rpc("facturacion_registrar_cancelacion", { p_id: id, p_motivo: motivo });
  if (error) return volver(err(error.message));
  revalidatePath("/finanzas/facturacion");
  return volver(ok("Factura cancelada. El cliente puede volver a facturar su ticket."));
}

export async function reenviarFactura(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) return volver(err("Solo administración puede reenviar."));
  const { data: f } = await supabase.from("facturas_clientes").select("facturapi_id, correo").eq("id", String(fd.get("id"))).eq("estado", "timbrada").single();
  if (!f || !f.facturapi_id) return volver(err("La factura no está timbrada."));
  const r = await facturapi().enviarCorreo(f.facturapi_id as string, f.correo as string);
  return volver(r.ok ? ok(`Reenviada a ${f.correo}.`) : err("No se pudo reenviar."));
}
