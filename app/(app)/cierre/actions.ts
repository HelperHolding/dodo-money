"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeCerrarDia } from "@/lib/contexto";
import { hoyMX, numero } from "@/lib/formato";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { leerCorteRappi, problemaArchivoCorte, rutaCorteRappi } from "@/lib/rappi";
import { datosDelDia } from "./datos";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/cierre?${clave}=${encodeURIComponent(texto)}`);

export async function cerrarDia(formData: FormData) {
  const { supabase, perfil, sucursal, turno } = await obtenerContextoParaEscribir("/cierre");
  if (!puedeCerrarDia(perfil.rol)) volver("error", "Solo encargado, gerente o administrador puede cerrar el día.");
  if (turno) volver("error", "Hay un turno abierto. Ciérralo con su arqueo antes de cerrar el día.");

  const fecha = hoyMX();
  // Los datos de efectivo se recalculan en el servidor; no se toman del formulario.
  const d = await datosDelDia(supabase, sucursal.id, fecha);
  if (d.pendientes > 0) volver("error", "Hay movimientos de hoy sin confirmar. Confírmalos o recházalos antes de cerrar.");

  // Corte de Rappi (opcional): el total del reporte de Rappi y su foto o PDF.
  const corte = leerCorteRappi(String(formData.get("rappi_corte") ?? ""));
  if ("error" in corte) volver("error", corte.error);
  const rutaCorte = await subirCorte(supabase, sucursal.id, fecha, formData.get("rappi_corte_archivo"));

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
    rappi_corte: "monto" in corte ? corte.monto : null,
    rappi_corte_ruta: rutaCorte,
    deposito_banco: String(formData.get("deposito_banco") ?? "").trim() || null,
    deposito_ficha: String(formData.get("deposito_ficha") ?? "").trim() || null,
    deposito_fecha: formData.get("deposito_fecha") ? new Date(String(formData.get("deposito_fecha"))).toISOString() : null,
  });
  if (error) volver("error", error.code === "23505" ? "El día de hoy ya está cerrado." : error.message);
  revalidatePath("/", "layout");
  volver("ok", "Día cerrado.");
}

/** Sube la foto o PDF del corte de Rappi; devuelve su ruta, o null si no se adjuntó. Si falla, regresa con el error. */
async function subirCorte(supabase: Awaited<ReturnType<typeof obtenerContextoParaEscribir>>["supabase"], sucursalId: string, fecha: string, valor: FormDataEntryValue | null) {
  const archivo = valor instanceof File && valor.size > 0 ? valor : null;
  const problema = problemaArchivoCorte(archivo);
  if (problema) volver("error", problema);
  if (!archivo) return null;
  const ruta = rutaCorteRappi(sucursalId, fecha, crypto.randomUUID(), archivo.type);
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) volver("error", `No se pudo subir el corte de Rappi: ${error.message}`);
  return ruta;
}

/** El reporte de Rappi llegó después de cerrar: el gerente o el admin lo registran una sola vez. */
export async function registrarCorteRappi(formData: FormData) {
  const { supabase, perfil, sucursal } = await obtenerContextoParaEscribir("/cierre");
  if (!puedeCerrarDia(perfil.rol)) volver("error", "Solo encargado, gerente o administrador registra el corte de Rappi.");
  const corte = leerCorteRappi(String(formData.get("rappi_corte") ?? ""));
  if ("error" in corte) volver("error", corte.error);
  if (!("monto" in corte) || corte.monto === null) volver("error", "Escribe el total del corte de Rappi.");
  const fecha = String(formData.get("fecha") ?? "");
  const ruta = await subirCorte(supabase, sucursal.id, fecha, formData.get("rappi_corte_archivo"));
  const { error } = await supabase.rpc("registrar_corte_rappi", {
    p_cierre: String(formData.get("cierre_id") ?? ""), p_monto: (corte as { monto: number }).monto, p_ruta: ruta,
  });
  if (error) volver("error", error.message);
  revalidatePath("/", "layout");
  volver("ok", "Corte de Rappi registrado.");
}
