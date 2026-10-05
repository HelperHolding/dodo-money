"use server";

import { revalidatePath } from "next/cache";
import { esCuentaGasto } from "@/lib/finanzas/cuentas";
import { numero } from "@/lib/formato";
import { clienteFinanzas, volver } from "../servidor";

const RUTA = "/finanzas/gastos";
const t = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();

export async function agregarGastoMes(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const mes = t(fd, "mes"), cuenta = t(fd, "cuenta"), concepto = t(fd, "concepto"), suc = t(fd, "sucursal_id");
  const monto = numero(fd.get("monto"));
  if (!/^\d{4}-\d{2}$/.test(mes)) volver(RUTA, "error", "Elige el mes.");
  if (!esCuentaGasto(cuenta)) volver(RUTA, "error", "Elige la cuenta.");
  if (!concepto || !monto) volver(RUTA, "error", "Escribe el concepto y el monto sin IVA.");
  const { error } = await supabase.from("gastos_mes").insert({ sucursal_id: suc === "oficina" || !suc ? null : suc, mes: `${mes}-01`, cuenta, monto, concepto });
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(`${RUTA}?mes=${mes}`, "ok", "Gasto agregado.");
}

export async function quitarGastoMes(fd: FormData) {
  const supabase = await clienteFinanzas(RUTA);
  const { error } = await supabase.from("gastos_mes").delete().eq("id", t(fd, "id"));
  if (error) volver(RUTA, "error", error.message);
  revalidatePath("/finanzas", "layout");
  volver(RUTA, "ok", "Gasto quitado.");
}
