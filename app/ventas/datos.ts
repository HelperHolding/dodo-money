import type { SupabaseClient } from "@supabase/supabase-js";
import {
  costearProductos,
  type Categoria, type CierreDia, type Costo, type Periodo, type RenglonCosteo, type VentaDia, type VentaProducto,
} from "@/lib/ventas/calculos";
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

/**
 * Todo lo del periodo, en páginas de 1000 (Supabase corta ahí sin avisar), ordenado por la llave primaria para que
 * cada página sea barata. El costeo se calcula aquí con el catálogo y los costos, que son tablas chicas.
 * sucursal null = todas las sucursales visibles.
 */
export async function datosVentas(supabase: SupabaseClient, sucursal: string | null, p: Periodo, anterior: Periodo): Promise<DatosVentas> {
  const [dias, ventas, catalogo, costos, previos, cierres] = await Promise.all([
    leerTodo<DiaConDesglose>((desde, hasta) => {
      let q = supabase.from("ventas_dia")
        .select("sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, ventas_dia_desglose(tipo, pedidos, total)")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("sucursal_id").order("fecha").range(desde, hasta).returns<DiaConDesglose[]>();
    }),
    leerTodo<VentaProducto>((desde, hasta) => {
      let q = supabase.from("ventas_producto")
        .select("sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("sucursal_id").order("fecha").order("dodo_id").range(desde, hasta).returns<VentaProducto[]>();
    }),
    leerTodo<{ dodo_id: number; categoria: Categoria | null }>((desde, hasta) =>
      supabase.from("productos_venta").select("dodo_id, categoria").order("dodo_id").range(desde, hasta)
        .returns<{ dodo_id: number; categoria: Categoria | null }[]>()),
    leerTodo<Costo & { dodo_id: number }>((desde, hasta) =>
      supabase.from("costos_producto").select("dodo_id, costo, vigente_desde").lte("vigente_desde", p.hasta)
        .order("dodo_id").order("vigente_desde").range(desde, hasta).returns<(Costo & { dodo_id: number })[]>()),
    leerTodo<{ dodo_id: number; importe: number }>((desde, hasta) => {
      let q = supabase.from("ventas_producto").select("dodo_id, importe").gte("fecha", anterior.desde).lte("fecha", anterior.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("sucursal_id").order("fecha").order("dodo_id").range(desde, hasta).returns<{ dodo_id: number; importe: number }[]>();
    }),
    leerTodo<CierreDia>((desde, hasta) => {
      let q = supabase.from("cierres_dia").select("sucursal_id, fecha, efectivo, tarjeta, app, rappi, iva, transacciones")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("sucursal_id").order("fecha").range(desde, hasta).returns<CierreDia[]>();
    }),
  ]);
  return { dias, renglones: costearProductos(ventas, dias, catalogo, costos), anterior: previos, cierres };
}
