"use server";

import { revalidatePath } from "next/cache";
import { numero } from "@/lib/formato";
import { clienteFinanzas, volver } from "../servidor";

const RUTA = "/finanzas/nomina";
const t = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
const sucursal = (v: string) => (v === "oficina" || !v ? null : v);

/** Alta o cambio de un puesto: se guarda como versión nueva con su fecha de vigencia (personas 0 = se quita). */
export async function guardarPuesto(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const puesto = t(fd, "puesto"), renglon = t(fd, "renglon"), vigente_desde = t(fd, "vigente_desde");
  const personas = Math.round(numero(fd.get("personas"))), sueldo = numero(fd.get("sueldo")), bono = numero(fd.get("bono"));
  const pct_cargas = numero(fd.get("pct_cargas")) / 100;
  if (!puesto) volver(RUTA, "error", "Escribe el puesto.");
  if (renglon !== "cocina" && renglon !== "gerencia") volver(RUTA, "error", "Elige si es cocina o gerencia.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigente_desde)) volver(RUTA, "error", "Elige desde cuándo aplica.");
  if (personas < 0 || sueldo < 0 || bono < 0 || pct_cargas < 0 || pct_cargas > 1) volver(RUTA, "error", "Revisa personas, sueldo, cargas (0 a 100 %) y bono.");
  const { error } = await supabase.from("nomina_plantilla").insert(
    { sucursal_id: sucursal(t(fd, "sucursal_id")), puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde },
  );
  if (error) volver(RUTA, "error", error.code === "23505" ? "Ya hay una versión de ese puesto con esa fecha; usa otra fecha." : error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Puesto guardado.");
}

export async function agregarAjuste(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const mes = t(fd, "mes"), renglon = t(fd, "renglon"), concepto = t(fd, "concepto");
  const monto = numero(fd.get("monto"));
  if (!/^\d{4}-\d{2}$/.test(mes)) volver(RUTA, "error", "Elige el mes.");
  if (renglon !== "cocina" && renglon !== "gerencia") volver(RUTA, "error", "Elige si es cocina o gerencia.");
  if (!concepto || !monto) volver(RUTA, "error", "Escribe el concepto y el monto (negativo si resta).");
  const { error } = await supabase.from("nomina_ajustes").insert({ sucursal_id: sucursal(t(fd, "sucursal_id")), mes: `${mes}-01`, renglon, monto, concepto });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Ajuste agregado.");
}

export async function quitarAjuste(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const { error } = await supabase.from("nomina_ajustes").delete().eq("id", t(fd, "id"));
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Ajuste quitado.");
}
