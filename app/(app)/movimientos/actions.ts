"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { numero } from "@/lib/formato";
import { RUTAS, type TipoCaja, type TipoMovimiento } from "@/lib/tipos";

const volverCon = (ruta: string, clave: "ok" | "error", texto: string) =>
  redirect(`${ruta}?${clave}=${encodeURIComponent(texto)}`);

export async function registrarMovimiento(formData: FormData) {
  const { supabase, sucursal, cajaPorTipo, turno } = await obtenerContextoParaEscribir("/movimientos");
  const tipo = String(formData.get("tipo")) as TipoMovimiento;
  const ruta = RUTAS[tipo];
  if (!ruta) volverCon("/movimientos", "error", "Elige el tipo de movimiento.");

  const origenTipo = String(formData.get("origen")) as TipoCaja;
  const destinoTipo = String(formData.get("destino")) as TipoCaja;
  const origen = cajaPorTipo[origenTipo];
  const destino = cajaPorTipo[destinoTipo];
  const monto = numero(formData.get("monto"));
  const folio = String(formData.get("folio") ?? "").trim() || null;

  if (!origen || !destino || origen.id === destino.id) volverCon("/movimientos", "error", "Elige de qué caja sale y a cuál entra.");
  if (!ruta.origen.includes(origenTipo) || !ruta.destino.includes(destinoTipo))
    volverCon("/movimientos", "error", "Esa ruta no está permitida para este tipo de movimiento.");
  if (monto <= 0) volverCon("/movimientos", "error", "Escribe un monto mayor a cero.");
  if (tipo === "deposito_banco" && !folio) volverCon("/movimientos", "error", "Escribe el número de ficha del depósito.");

  const { error } = await supabase.from("movimientos").insert({
    sucursal_id: sucursal.id,
    turno_id: turno?.id ?? null,
    tipo,
    caja_origen_id: origen!.id,
    caja_destino_id: destino!.id,
    monto,
    folio,
    nota: String(formData.get("nota") ?? "").trim() || null,
  });
  if (error) volverCon("/movimientos", "error", error.message);

  revalidatePath("/", "layout");
  volverCon("/movimientos", "ok", "Movimiento registrado. Falta que otra persona confirme que recibió el efectivo.");
}

/** Confirmar y Rechazar van en formularios separados: la decisión no depende de qué botón envió el formulario. */
async function resolverMovimiento(formData: FormData, aceptar: boolean) {
  const { supabase } = await obtenerContextoParaEscribir("/movimientos");
  const volver = String(formData.get("volver") ?? "/movimientos");
  const id = String(formData.get("id") ?? "");
  if (!id) volverCon(volver, "error", "No se identificó el movimiento. Recarga la página e intenta de nuevo.");
  const { error } = await supabase.rpc("confirmar_movimiento", { p_id: id, p_aceptar: aceptar });
  if (error) volverCon(volver, "error", error.message);
  revalidatePath("/", "layout");
  volverCon(volver, "ok", aceptar ? "Movimiento confirmado." : "Movimiento rechazado. No afecta ningún saldo.");
}

export async function confirmarMovimiento(formData: FormData) {
  await resolverMovimiento(formData, true);
}

export async function rechazarMovimiento(formData: FormData) {
  await resolverMovimiento(formData, false);
}
