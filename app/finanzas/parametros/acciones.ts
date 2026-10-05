"use server";

import { revalidatePath } from "next/cache";
import { numero } from "@/lib/formato";
import { clienteFinanzas, volver } from "../servidor";

const RUTA = "/finanzas/parametros";
const t = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
const CLAVES = ["regalias_pct", "rappi_pct", "dlocal_pct", "oxxo_pct", "oxxo_participacion", "netpay_pct", "amex_pct", "amex_participacion"];
const RENGLONES = ["alimento", "merma", "nomina_cocina", "nomina_gerencia", "repartidores", "agregadores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "regalias", "otros", "oficina"];

/** Valor nuevo de un parámetro desde una fecha (el valor se escribe en %). */
export async function guardarParametro(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const clave = t(fd, "clave"), vigente_desde = t(fd, "vigente_desde");
  const valor = numero(fd.get("valor")) / 100;
  if (!CLAVES.includes(clave)) volver(RUTA, "error", "Elige el parámetro.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigente_desde)) volver(RUTA, "error", "Elige desde cuándo aplica.");
  if (valor < 0 || valor > 1) volver(RUTA, "error", "El porcentaje va de 0 a 100.");
  const { error } = await supabase.from("pl_parametros").upsert({ clave, valor, vigente_desde }, { onConflict: "clave,vigente_desde" });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Parámetro guardado.");
}

/** Meta de un renglón de una sucursal: % de venta, monto fijo, % de venta Rappi o plantilla. */
export async function guardarMeta(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const sucursal_id = t(fd, "sucursal_id"), renglon = t(fd, "renglon"), tipo = t(fd, "tipo");
  const crudo = numero(fd.get("valor"));
  if (!RENGLONES.includes(renglon) || !["pct", "monto", "pct_rappi", "plantilla"].includes(tipo)) volver(RUTA, "error", "Revisa el renglón y el tipo de meta.");
  const valor = tipo === "pct" || tipo === "pct_rappi" ? crudo / 100 : crudo;
  if (valor < 0) volver(RUTA, "error", "La meta no puede ser negativa.");
  const { error } = await supabase.from("pl_metas").upsert({ sucursal_id, renglon, tipo, valor }, { onConflict: "sucursal_id,renglon" });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(`${RUTA}?sucursal=${sucursal_id}`, "ok", "Meta guardada.");
}
