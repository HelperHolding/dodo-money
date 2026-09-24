"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { hoyMX, numero } from "@/lib/formato";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/caja-chica?${clave}=${encodeURIComponent(texto)}`);

export async function registrarGasto(formData: FormData) {
  const { supabase, sucursal } = await obtenerContexto();
  const comprobante = String(formData.get("comprobante"));
  const uuid = String(formData.get("uuid_cfdi") ?? "").trim() || null;
  const monto = numero(formData.get("monto"));
  const concepto = String(formData.get("concepto") ?? "").trim();

  if (!concepto) volver("error", "Escribe en qué se gastó.");
  if (monto <= 0) volver("error", "Escribe un monto mayor a cero.");
  if (comprobante === "cfdi" && !uuid) volver("error", "Con factura, escribe el folio fiscal (UUID) del CFDI.");

  const { error } = await supabase.from("gastos_caja_chica").insert({
    sucursal_id: sucursal.id,
    fecha: String(formData.get("fecha") || hoyMX()),
    concepto,
    proveedor: String(formData.get("proveedor") ?? "").trim() || null,
    monto,
    comprobante,
    uuid_cfdi: uuid,
  });
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", "Gasto registrado.");
}

export async function solicitarReposicion(formData: FormData) {
  const { supabase, sucursal, cajaPorTipo, turno } = await obtenerContexto();
  const monto = numero(formData.get("monto"));
  if (monto <= 0) volver("error", "No hay gastos por reponer.");
  if (!cajaPorTipo.banco || !cajaPorTipo.caja_chica) volver("error", "Faltan las cajas de banco o caja chica en esta sucursal.");

  const { error } = await supabase.from("movimientos").insert({
    sucursal_id: sucursal.id,
    turno_id: turno?.id ?? null,
    tipo: "reposicion_caja_chica",
    caja_origen_id: cajaPorTipo.banco!.id,
    caja_destino_id: cajaPorTipo.caja_chica!.id,
    monto,
    nota: "Reposición por gastos comprobados",
  });
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", "Reposición solicitada. La confirma el gerente cuando el efectivo llegue a la caja chica.");
}
