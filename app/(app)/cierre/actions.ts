"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeGestionar } from "@/lib/contexto";
import { hoyMX, numero } from "@/lib/formato";
import { datosDelDia } from "./datos";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/cierre?${clave}=${encodeURIComponent(texto)}`);

export async function cerrarDia(formData: FormData) {
  const { supabase, perfil, sucursal, turno } = await obtenerContextoParaEscribir("/cierre");
  if (!puedeGestionar(perfil.rol)) volver("error", "Solo el gerente cierra el día.");
  if (turno) volver("error", "Hay un turno abierto. Ciérralo con su arqueo antes de cerrar el día.");

  const fecha = hoyMX();
  // Los datos de efectivo se recalculan en el servidor; no se toman del formulario.
  const d = await datosDelDia(supabase, sucursal.id, fecha);
  if (d.pendientes > 0) volver("error", "Hay movimientos de hoy sin confirmar. Confírmalos o recházalos antes de cerrar.");

  const { error } = await supabase.from("cierres_dia").insert({
    sucursal_id: sucursal.id,
    fecha,
    efectivo: numero(formData.get("efectivo")),
    tarjeta: numero(formData.get("tarjeta")),
    app: numero(formData.get("app")),
    rappi: numero(formData.get("rappi")),
    descuentos: numero(formData.get("descuentos")),
    iva: numero(formData.get("iva")),
    transacciones: Math.round(numero(formData.get("transacciones"))),
    boveda_inicial: d.bovedaInicial,
    retiros_dia: d.retiros,
    aperturas_dia: d.aperturas,
    deposito_dia: d.depositos,
    gastos_boveda_dia: d.gastosBoveda,
    boveda_contado: numero(formData.get("boveda_contado")),
    cambios_autorizado: Number(sucursal.fondo_cambios),
    cambios_contado: numero(formData.get("cambios_contado")),
    diferencia_turnos: d.diferenciaTurnos,
    deposito_banco: String(formData.get("deposito_banco") ?? "").trim() || null,
    deposito_ficha: String(formData.get("deposito_ficha") ?? "").trim() || null,
    deposito_fecha: formData.get("deposito_fecha") ? new Date(String(formData.get("deposito_fecha"))).toISOString() : null,
  });
  if (error) volver("error", error.code === "23505" ? "El día de hoy ya está cerrado." : error.message);
  revalidatePath("/", "layout");
  volver("ok", "Día cerrado.");
}
