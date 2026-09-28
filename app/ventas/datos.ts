import type { SupabaseClient } from "@supabase/supabase-js";
import type { CierreDia, Periodo, RenglonCosteo, VentaDia } from "@/lib/ventas/calculos";
import type { TipoDesglose } from "@/lib/ventas/extraer";
import { leerTodo } from "@/lib/ventas/paginar";

export type FilaDesglose = { tipo: TipoDesglose; pedidos: number; total: number };
export type DiaConDesglose = VentaDia & { ventas_dia_desglose: FilaDesglose[] };

export type DatosVentas = {
  dias: DiaConDesglose[];
  renglones: RenglonCosteo[];
  /** Importe por producto del periodo anterior, para el cambio del top 10. */
  anterior: { dodo_id: number; importe: number }[];
  cierres: CierreDia[];
};

/** Último día importado (de una sucursal o de cualquiera); null si no hay nada. */
export async function ultimoDiaConDatos(supabase: SupabaseClient, sucursal: string | null): Promise<string | null> {
  let q = supabase.from("ventas_dia").select("fecha");
  if (sucursal) q = q.eq("sucursal_id", sucursal);
  const { data, error } = await q.order("fecha", { ascending: false }).limit(1).maybeSingle<{ fecha: string }>();
  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
  return data?.fecha ?? null;
}

/** Todo lo del periodo, en páginas de 1000 (Supabase corta ahí sin avisar). null = todas las sucursales visibles. */
export async function datosVentas(supabase: SupabaseClient, sucursal: string | null, p: Periodo, anterior: Periodo): Promise<DatosVentas> {
  const [dias, renglones, previos, cierres] = await Promise.all([
    leerTodo<DiaConDesglose>((desde, hasta) => {
      let q = supabase.from("ventas_dia")
        .select("sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, ventas_dia_desglose(tipo, pedidos, total)")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").range(desde, hasta).returns<DiaConDesglose[]>();
    }),
    leerTodo<RenglonCosteo>((desde, hasta) => {
      let q = supabase.from("ventas_producto_costeo")
        .select("fecha, dodo_id, nombre, categoria, cantidad, importe, importe_sin_descuento, importe_neto, costo_unitario")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").order("dodo_id").range(desde, hasta).returns<RenglonCosteo[]>();
    }),
    leerTodo<{ dodo_id: number; importe: number }>((desde, hasta) => {
      let q = supabase.from("ventas_producto").select("dodo_id, importe").gte("fecha", anterior.desde).lte("fecha", anterior.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").order("dodo_id").range(desde, hasta).returns<{ dodo_id: number; importe: number }[]>();
    }),
    leerTodo<CierreDia>((desde, hasta) => {
      let q = supabase.from("cierres_dia").select("sucursal_id, fecha, efectivo, tarjeta, app, rappi, iva, transacciones")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").range(desde, hasta).returns<CierreDia[]>();
    }),
  ]);
  return { dias, renglones, anterior: previos, cierres };
}
