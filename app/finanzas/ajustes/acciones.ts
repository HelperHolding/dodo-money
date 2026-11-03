"use server";
import { revalidatePath } from "next/cache";
import { rutaVolver } from "@/lib/finanzas/ajustes";
import { clienteFinanzas, volver } from "../servidor";

const recalcular = () => { revalidatePath("/finanzas", "layout"); revalidatePath("/reporte/pl", "layout"); };

/** Captura un ajuste: el tope llega en % (5 → 0.05) y el monto en pesos con signo. */
export async function guardarAjustePL(fd: FormData) {
  const destino = rutaVolver(fd.get("volver"));
  const supabase = await clienteFinanzas(destino);
  const tipo = String(fd.get("tipo") ?? "");
  const texto = String(fd.get("valor") ?? "").trim().replace(/[$\s,]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(texto)) volver(destino, "error", "Escribe el valor con números y hasta dos decimales.");
  const n = Number(texto);
  const { error } = await supabase.rpc("guardar_ajuste_pl", {
    p_solicitud: fd.get("solicitud"), p_sucursal: fd.get("sucursal_id"), p_mes: fd.get("mes"), p_renglon: fd.get("renglon"),
    p_tipo: tipo, p_valor: tipo === "tope_pct" ? Math.round(n * 100) / 10000 : n, p_nota: fd.get("nota"),
  });
  if (!error) recalcular();
  volver(destino, error ? "error" : "ok", error?.message ?? "Ajuste guardado: el P&L muestra Real y Ajustado.");
}

export async function anularAjustePL(fd: FormData) {
  const destino = rutaVolver(fd.get("volver"));
  const supabase = await clienteFinanzas(destino);
  const { error } = await supabase.rpc("anular_ajuste_pl", { p_id: fd.get("id"), p_motivo: fd.get("motivo") });
  if (!error) recalcular();
  volver(destino, error ? "error" : "ok", error?.message ?? "Ajuste anulado.");
}
