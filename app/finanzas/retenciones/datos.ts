import type { SupabaseClient } from "@supabase/supabase-js";
import { porMes, retencionesDePagos } from "@/lib/finanzas/retenciones";
import type { Aplicacion, Entero } from "@/lib/finanzas/retenciones";
import { leerTodo } from "@/lib/ventas/paginar";

export async function cargarRetenciones(supabase: SupabaseClient, hoy: string) {
  const [aplicaciones, enteros] = await Promise.all([
    leerTodo<Aplicacion>((desde, hasta) => supabase.from("pago_aplicaciones")
      .select("pago_id, monto, pagos!inner(fecha, anulado_en), facturas!inner(id, serie, folio, uuid, total, tipo, estado, retencion_iva, retencion_isr, proveedores(razon_social, nombre_comercial, rfc))")
      .is("pagos.anulado_en", null).eq("facturas.tipo", "ingreso").neq("facturas.estado", "cancelada")
      .order("pago_id").order("factura_id").range(desde, hasta).returns<Aplicacion[]>()),
    leerTodo<Entero>((desde, hasta) => supabase.from("enteros_retenciones")
      .select("id, mes, fecha, iva, isr, operacion, acuse_ruta, anulado_en, motivo_anulacion")
      .order("id").range(desde, hasta).returns<Entero[]>()),
  ]);
  return porMes(retencionesDePagos(aplicaciones), enteros, hoy);
}
