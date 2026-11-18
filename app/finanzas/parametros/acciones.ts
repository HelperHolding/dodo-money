"use server";

import { revalidatePath } from "next/cache";
import { numero } from "@/lib/formato";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas, SOLO_CONSULTA } from "@/lib/roles";
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

/**
 * Metas de venta mensual (sin IVA) por sucursal; un solo formulario por mes. Vacío = no se toca; 0 quita la meta.
 * Con «Copiar mes anterior» (copiar=1), las sucursales que quedaron vacías toman la meta del mes anterior.
 */
export async function guardarMetasVenta(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver(RUTA, "error", SOLO_CONSULTA);
  const mes = t(fd, "mes");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) volver(RUTA, "error", "Mes inválido.");
  const aqui = `${RUTA}?mes_meta=${mes}`;
  const ahora = new Date().toISOString();
  const campos = [...fd.entries()].filter(([k]) => k.startsWith("monto_")).map(([k, v]) => ({ sucursal_id: k.slice(6), valor: String(v).trim() }));
  const fila = (sucursal_id: string, monto: number) => ({ sucursal_id, mes: `${mes}-01`, monto, actualizado_en: ahora, actualizado_por: perfil.id });
  const filas = campos.filter((c) => c.valor !== "").map((c) => fila(c.sucursal_id, Number(c.valor.replace(/[,$\s]/g, ""))));
  if (filas.some((f) => !Number.isFinite(f.monto) || f.monto < 0)) volver(aqui, "error", "Revisa los montos: deben ser números positivos.");
  const vacias = campos.filter((c) => c.valor === "").map((c) => c.sucursal_id);
  if (t(fd, "copiar") === "1" && vacias.length) {
    const anterior = new Date(Date.parse(`${mes}-01T00:00:00Z`) - 86_400_000).toISOString().slice(0, 7);
    const { data, error } = await supabase.from("ventas_metas").select("sucursal_id, monto").eq("mes", `${anterior}-01`).in("sucursal_id", vacias);
    if (error) volver(aqui, "error", "No se pudieron leer las metas del mes anterior.");
    for (const m of (data ?? []) as { sucursal_id: string; monto: number }[]) filas.push(fila(m.sucursal_id, Number(m.monto)));
  }
  if (!filas.length) volver(aqui, "ok", "No hay montos que guardar.");
  const { error } = await supabase.from("ventas_metas").upsert(filas, { onConflict: "sucursal_id,mes" });
  if (error) volver(aqui, "error", "No se pudieron guardar las metas de venta.");
  revalidatePath(RUTA);
  revalidatePath("/ventas/bi");
  volver(aqui, "ok", "Metas de venta guardadas.");
}
