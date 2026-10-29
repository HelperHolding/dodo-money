"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { CONCEPTOS, TIPOS, documentosRpc } from "@/lib/banca/conciliacion";
import { leerConciliacion } from "./datos";

const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const volver = (fd: FormData, aviso: { ok?: string; error?: string }): never => {
  const p = new URLSearchParams({ vista: "conciliacion" });
  for (const k of ["cuenta", "desde", "hasta"]) { const v = texto(fd, k); if (v && (k === "cuenta" ? UUID : FECHA).test(v)) p.set(k, v); }
  if (aviso.ok) p.set("ok", aviso.ok.slice(0, 300));
  if (aviso.error) p.set("error", aviso.error.slice(0, 300));
  revalidatePath("/banca");
  redirect(`/banca?${p}`);
};
const leerDocumentos = (s: string): unknown => { try { return JSON.parse(s || "[]"); } catch { throw Error("Revisa los datos de la conciliación."); } };
const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo conciliar.");

async function admin() {
  const { supabase, perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") throw Error("Solo administración concilia movimientos bancarios.");
  return supabase;
}

/** Una conciliación: movimientos, tipo, concepto, documentos y nota del formulario; la base valida y calcula montos. */
export async function conciliarMovimientos(fd: FormData) {
  let aviso: { ok?: string; error?: string };
  try {
    const db = await admin();
    const solicitud = texto(fd, "solicitud"), movimientos = texto(fd, "movimientos").split(",").filter(Boolean);
    const tipo = texto(fd, "tipo"), concepto = texto(fd, "concepto"), nota = texto(fd, "nota"), pago = texto(fd, "pago");
    // El formulario manual de pago manda el pago elegido en `pago`; las sugerencias mandan `documentos` ya armados.
    const documentos = tipo === "pago_proveedor" && UUID.test(pago) && !texto(fd, "documentos") ? [{ tipo: "pago", id: pago }] : leerDocumentos(texto(fd, "documentos"));
    if (!UUID.test(solicitud) || !movimientos.length || movimientos.length > 200 || !movimientos.every((m) => UUID.test(m))
      || !(TIPOS as readonly string[]).includes(tipo) || !CONCEPTOS.some((c) => c.clave === concepto) || !Array.isArray(documentos) || documentos.length > 200 || nota.length > 1000)
      throw Error("Revisa los datos de la conciliación.");
    const { error } = await db.rpc("conciliar_banca", { p_solicitud: solicitud, p_movimientos: movimientos, p_tipo: tipo, p_concepto: concepto, p_documentos: documentos, p_nota: nota });
    if (error) throw Error(error.message);
    aviso = { ok: "Conciliación guardada." };
  } catch (e) { aviso = { error: mensaje(e) }; }
  volver(fd, aviso);
}

/** Recalcula las sugerencias del periodo y confirma las exactas (con documento y diferencia 0); repetirla no duplica nada. */
export async function confirmarExactas(fd: FormData) {
  let aviso: { ok?: string; error?: string };
  try {
    const db = await admin();
    const cuentaId = texto(fd, "cuenta"), desde = texto(fd, "desde"), hasta = texto(fd, "hasta");
    if (!UUID.test(cuentaId) || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) throw Error("Revisa la cuenta y el periodo.");
    const { data: cuenta, error } = await db.from("banca_cuentas").select("id,rfc").eq("id", cuentaId).single<{ id: string; rfc: string }>();
    if (error || !cuenta) throw Error("No se encontró la cuenta.");
    const { sugerencias } = await leerConciliacion(db, cuenta, desde, hasta);
    let n = 0;
    const fallas: string[] = [];
    for (const s of sugerencias.filter((x) => x.exacta)) {
      const r = await db.rpc("conciliar_banca", { p_solicitud: randomUUID(), p_movimientos: s.movimientos, p_tipo: s.tipo, p_concepto: s.concepto, p_documentos: documentosRpc(s.documentos), p_nota: s.nota });
      if (r.error) fallas.push(r.error.message); else n++;
    }
    aviso = fallas.length ? { error: `${n} confirmadas; ${fallas.length} no: ${fallas[0]}` } : { ok: `${n} conciliaciones confirmadas.` };
  } catch (e) { aviso = { error: mensaje(e) }; }
  volver(fd, aviso);
}

export async function anularConciliacionBanca(fd: FormData) {
  let aviso: { ok?: string; error?: string };
  try {
    const db = await admin();
    const id = texto(fd, "id"), motivo = texto(fd, "motivo");
    if (!UUID.test(id)) throw Error("Conciliación inválida.");
    const { error } = await db.rpc("anular_conciliacion", { p_id: id, p_motivo: motivo });
    if (error) throw Error(error.message);
    aviso = { ok: "Conciliación anulada; sus movimientos vuelven a estar por conciliar." };
  } catch (e) { aviso = { error: mensaje(e) }; }
  volver(fd, aviso);
}
