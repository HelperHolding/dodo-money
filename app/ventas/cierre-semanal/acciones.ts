"use server";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarFinanzas, SOLO_CONSULTA } from "@/lib/roles";
import { semanaDe } from "@/lib/ventas/cierreSemanal";
import { volver } from "@/app/finanzas/servidor";
import { cargarCierreSemanal } from "./datos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Aprueba la semana de una sucursal. Los totales NO vienen del formulario: se recalculan aquí con las mismas
 * consultas que la pantalla y esa copia es la que se guarda.
 */
export async function aprobarSemana(fd: FormData) {
  const sucursal = String(fd.get("sucursal") ?? "");
  const semanaPedida = String(fd.get("semana") ?? "");
  const destino = `/ventas/cierre-semanal?${new URLSearchParams({ sucursal, semana: semanaPedida })}`;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver(destino, "error", SOLO_CONSULTA);
  if (!UUID.test(sucursal) || !/^\d{4}-\d{2}-\d{2}$/.test(semanaPedida) || Number.isNaN(Date.parse(`${semanaPedida}T00:00:00Z`)) || semanaDe(semanaPedida) !== semanaPedida) {
    volver(destino, "error", "Elige una sucursal y una semana válidas.");
  }
  const nota = String(fd.get("nota") ?? "").trim();
  if (nota.length > 500) volver(destino, "error", "La nota admite hasta 500 caracteres.");
  const domingo = new Date(Date.parse(`${semanaPedida}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10);
  if (domingo >= hoyCalendarioMX()) volver(destino, "error", "La semana aún no termina.");

  let totales;
  try {
    totales = (await cargarCierreSemanal(supabase, sucursal, semanaPedida)).cierre;
  } catch (e) {
    return volver(destino, "error", e instanceof Error ? e.message : "No se pudo recalcular el cierre.");
  }
  const { error } = await supabase.rpc("aprobar_cierre_semanal", { p_sucursal: sucursal, p_semana: semanaPedida, p_totales: totales, p_nota: nota || null });
  if (!error) revalidatePath("/ventas/cierre-semanal");
  volver(destino, error ? "error" : "ok", error?.message ?? "Semana aprobada: se guardó una copia de los totales.");
}
