import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mermasDe } from "@/lib/dodois/cliente";
import { costoDesdeCatalogo, precioDesdeRecepciones, precioMasaBOM, traducirMermas } from "@/lib/dodois/mermas";
import type { VersionBOM } from "@/lib/finanzas/referenciaMerma";
import { leerTodo } from "@/lib/ventas/paginar";

export type ResultadoMermas = { sucursal: string; sucursal_id: string; desde: string; hasta: string; estado: "ok" | "error"; filas: number; costo: number; sinCosto: number; mensaje: string };
type Sucursal = { id: string; nombre: string; dodois_unit_id: string };
const siguiente = (f: string) => new Date(Date.parse(`${f}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Trae de Dodo IS las bajas de cada sucursal ligada en la ventana, las costea con el precio de recepción (un producto
 * sin precio completo toma el costo del catálogo; una masa por pieza, el peso y precio del BOM) y reemplaza esos días. `guardar` decide la función: la del cron (service_role, sin usuario) o la de la app (admin con sesión).
 */
export async function sincronizarMermas(
  lector: SupabaseClient, token: string, sucursales: readonly Sucursal[], ventana: { desde: string; hasta: string },
  guardar: (dias: unknown[], filas: unknown[], huella: string) => Promise<{ error: { message: string } | null }>,
): Promise<ResultadoMermas[]> {
  const recepciones = await leerTodo<{ sucursal_id: string; dodo_insumo_id: string; fecha: string; precio: number }>((d, h) =>
    lector.from("recepciones_dodo").select("sucursal_id, dodo_insumo_id, fecha, precio").lte("fecha", ventana.hasta).gt("precio", 0)
      .order("id").range(d, h));
  // Respaldo de productos: costo teórico del catálogo (receta + periférico), ligado por el id de producto de Dodo IS.
  // Respaldo de masas por pieza: peso de la bola y precio por kg en la versión del BOM vigente a la fecha.
  const [codigos, costos, versionesBOM] = await Promise.all([
    leerTodo<{ dodo_uuid: string; dodo_id: number | null }>((d, h) => lector.from("productos_codigos").select("dodo_uuid, dodo_id").order("dodo_uuid").range(d, h)),
    leerTodo<{ dodo_id: number; costo: number; vigente_desde: string }>((d, h) =>
      lector.from("costos_producto").select("dodo_id, costo, vigente_desde").lte("vigente_desde", ventana.hasta).order("dodo_id").order("vigente_desde").range(d, h)),
    leerTodo<Pick<VersionBOM, "id" | "vigente_desde" | "actualizado_en" | "modelo">>((d, h) =>
      lector.from("bom_versiones").select("id, vigente_desde, actualizado_en, modelo").lte("vigente_desde", ventana.hasta).order("id").range(d, h)),
  ]);
  const costoProducto = costoDesdeCatalogo(codigos, costos), precioRespaldo = precioMasaBOM(versionesBOM);
  const resultados: ResultadoMermas[] = [];
  for (const s of sucursales) {
    const base = { sucursal: s.nombre, sucursal_id: s.id, desde: ventana.desde, hasta: ventana.hasta };
    try {
      const api = await mermasDe(token, s.dodois_unit_id, { from: `${ventana.desde}T00:00:00`, to: `${siguiente(ventana.hasta)}T00:00:00` });
      const { dias, filas } = traducirMermas({
        sucursalId: s.id, unitId: s.dodois_unit_id, desde: ventana.desde, hasta: ventana.hasta, ...api,
        precio: precioDesdeRecepciones(recepciones, s.id), costoProducto, precioRespaldo,
      });
      const huella = createHash("sha256").update(JSON.stringify({ dias, filas })).digest("hex");
      const { error } = await guardar(dias, filas, huella);
      if (error) throw new Error(error.message);
      const sinCosto = filas.filter((f) => f.sin_costo).length;
      resultados.push({
        ...base, estado: "ok", filas: filas.length, costo: centavos(filas.reduce((t, f) => t + f.costo, 0)), sinCosto,
        mensaje: `${ventana.desde} a ${ventana.hasta}: ${api.productos.length} bajas de productos y ${api.insumos.length} de insumos${sinCosto ? `; ${sinCosto} renglones sin precio de recepción` : ""}`,
      });
    } catch (e) {
      resultados.push({ ...base, estado: "error", filas: 0, costo: 0, sinCosto: 0, mensaje: (e as Error).message });
    }
  }
  return resultados;
}
