import { aplicarConciliaciones } from "@/lib/ventas/conciliacion";
import { leerConciliaciones } from "./conciliacion/datos";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  costearProductos,
  type Categoria, type CierreDia, type Costo, type Periodo, type RenglonCosteo, type VentaDia, type VentaProducto,
} from "@/lib/ventas/calculos";
import type { TipoDesglose } from "@/lib/ventas/extraer";
import { leerTodo } from "@/lib/ventas/paginar";
import type { LineaPedido, Pedido } from "@/lib/ventas/pedidos";
import { cargarRappi } from "./rappi/datos";
import { combinarDiasRappi, ventasRappi } from "@/lib/ventas/rappi";

export type FilaDesglose = { tipo: TipoDesglose; pedidos: number; total: number };
export type DiaConDesglose = VentaDia & { importacion_id?: string; ventas_dia_desglose: FilaDesglose[] };

export type DatosVentas = {
  dias: DiaConDesglose[];
  renglones: RenglonCosteo[];
  /** El periodo anterior del mismo largo, para comparar indicadores y productos. */
  anterior: { dias: VentaDia[]; renglones: RenglonCosteo[] };
  cierres: CierreDia[];
};

/**
 * Qué sucursal se ve. Gerente: siempre la suya (la base de datos tampoco le deja ver otra).
 * Admin y corporativo: la pedida si existe, o todas (null).
 */
export function sucursalElegida(todas: boolean, pedida: string | undefined, propia: string | null, existe: (id: string) => boolean): string | null {
  return todas ? (pedida && existe(pedida) ? pedida : null) : propia;
}

/** Último día importado (de una sucursal o de cualquiera); null si no hay nada. */
export async function ultimoDiaConDatos(supabase: SupabaseClient, sucursal: string | null): Promise<string | null> {
  let q = supabase.from("ventas_dia").select("fecha");
  if (sucursal) q = q.eq("sucursal_id", sucursal);
  const { data, error } = await q.order("fecha", { ascending: false }).limit(1).maybeSingle<{ fecha: string }>();
  let qr=supabase.from("rappi_ordenes").select("fecha").eq("sumar",true).eq("estado","Finalizado");if(sucursal)qr=qr.eq("sucursal_id",sucursal);
  const rappi=await qr.order("fecha",{ascending:false}).limit(1).maybeSingle<{fecha:string}>();
  if(rappi.error)throw Error(rappi.error.message);
  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
  return [data?.fecha,rappi.data?.fecha].filter((x):x is string=>!!x).sort().at(-1)??null;
}

/** Venta por día desde una fecha (sumando sucursales si sucursal es null), para el calendario. */
export async function ventaDiariaDesde(supabase: SupabaseClient, sucursal: string | null, desde: string): Promise<Record<string, number>> {
  const filas = await leerTodo<{ fecha: string; total: number }>((inicio, fin) => {
    let q = supabase.from("ventas_dia").select("fecha, total").gte("fecha", desde);
    if (sucursal) q = q.eq("sucursal_id", sucursal);
    return q.order("sucursal_id").order("fecha").range(inicio, fin).returns<{ fecha: string; total: number }[]>();
  });
  const venta: Record<string, number> = {};
  for (const f of filas) venta[f.fecha] = Math.round(((venta[f.fecha] ?? 0) + Number(f.total)) * 100) / 100;
  const rappi=await leerTodo<{fecha:string;subtotal_restaurante:number}>((a,b)=>{let c=supabase.from("rappi_ordenes").select("fecha,subtotal_restaurante").gte("fecha",desde).eq("sumar",true).eq("estado","Finalizado");if(sucursal)c=c.eq("sucursal_id",sucursal);return c.order("rappi_id").range(a,b);});
  for(const f of rappi)venta[f.fecha]=Math.round(((venta[f.fecha]??0)+Number(f.subtotal_restaurante))*100)/100;
  return venta;
}

/** Días de un periodo con su desglose, en páginas ordenadas por la llave primaria. */
function leerDias(supabase: SupabaseClient, sucursal: string | null, p: Periodo) {
  return leerTodo<DiaConDesglose & { importacion_id: string }>((desde, hasta) => {
    let q = supabase.from("ventas_dia")
      .select("importacion_id, sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, ventas_dia_desglose(tipo, pedidos, total)")
      .gte("fecha", p.desde).lte("fecha", p.hasta);
    if (sucursal) q = q.eq("sucursal_id", sucursal);
    return q.order("sucursal_id").order("fecha").range(desde, hasta).returns<(DiaConDesglose & { importacion_id: string })[]>();
  });
}

/** Productos vendidos en un periodo, en páginas ordenadas por la llave primaria. */
function leerProductos(supabase: SupabaseClient, sucursal: string | null, p: Periodo) {
  return leerTodo<VentaProducto>((desde, hasta) => {
    let q = supabase.from("ventas_producto")
      .select("sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento")
      .gte("fecha", p.desde).lte("fecha", p.hasta);
    if (sucursal) q = q.eq("sucursal_id", sucursal);
    return q.order("sucursal_id").order("fecha").order("dodo_id").range(desde, hasta).returns<VentaProducto[]>();
  });
}

/**
 * Todo lo del periodo y del anterior, en páginas de 1000 (Supabase corta ahí sin avisar). El costeo se calcula
 * aquí con el catálogo y los costos, que son tablas chicas. sucursal null = todas las sucursales visibles.
 */
export async function datosVentas(supabase: SupabaseClient, sucursal: string | null, p: Periodo, anterior: Periodo): Promise<DatosVentas> {
  const [diasDodo, ventas, diasAnterioresDodo, ventasAnteriores, catalogo, costos, cierres, actualRappi, anteriorRappi] = await Promise.all([
    leerDias(supabase, sucursal, p),
    leerProductos(supabase, sucursal, p),
    leerDias(supabase, sucursal, anterior),
    leerProductos(supabase, sucursal, anterior),
    leerTodo<{ dodo_id: number; categoria: Categoria | null }>((desde, hasta) =>
      supabase.from("productos_venta").select("dodo_id, categoria").order("dodo_id").range(desde, hasta)
        .returns<{ dodo_id: number; categoria: Categoria | null }[]>()),
    leerTodo<Costo & { dodo_id: number }>((desde, hasta) =>
      supabase.from("costos_producto").select("dodo_id, costo, vigente_desde").lte("vigente_desde", p.hasta)
        .order("dodo_id").order("vigente_desde").range(desde, hasta).returns<(Costo & { dodo_id: number })[]>()),
    leerTodo<CierreDia>((desde, hasta) => {
      let q = supabase.from("cierres_dia").select("sucursal_id, fecha, efectivo, tarjeta, app, rappi, iva, transacciones")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("sucursal_id").order("fecha").range(desde, hasta).returns<CierreDia[]>();
    }),
    cargarRappi(supabase,sucursal,p.desde,p.hasta),
    cargarRappi(supabase,sucursal,anterior.desde,anterior.hasta),
  ]);
  const rappi=ventasRappi(actualRappi.ordenes,actualRappi.catalogo),previo=ventasRappi(anteriorRappi.ordenes,anteriorRappi.catalogo);
  const [concActual,concAnterior] = await Promise.all([leerConciliaciones(supabase,p.desde,p.hasta),leerConciliaciones(supabase,anterior.desde,anterior.hasta)]);
  const dias=combinarDiasRappi(aplicarConciliaciones(diasDodo,concActual.filas),rappi.dias),diasAnteriores=combinarDiasRappi(aplicarConciliaciones(diasAnterioresDodo,concAnterior.filas),previo.dias);
  return {
    dias,
    renglones: [...costearProductos(ventas,diasDodo,catalogo,costos),...costearProductos(rappi.productos,rappi.dias,catalogo,costos)],
    anterior: { dias: diasAnteriores, renglones: [...costearProductos(ventasAnteriores,diasAnterioresDodo,catalogo,costos),...costearProductos(previo.productos,previo.dias,catalogo,costos)] },
    cierres,
  };
}

/** Pedidos del periodo y sus productos (solo existen para días importados con Datos brutos), en páginas. */
export async function datosPedidos(supabase: SupabaseClient, sucursal: string | null, p: Periodo): Promise<{ pedidos: (Pedido & { sucursal_id: string })[]; lineas: LineaPedido[] }> {
  const [pedidos, lineas,datosRappi] = await Promise.all([
    leerTodo<Pedido & { sucursal_id: string }>((desde, hasta) => {
      let q = supabase.from("pedidos")
        .select("dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, para_llevar, estado, total, total_sin_descuento, agregador, inicio_coccion, listo, entregado")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("dodo_id").range(desde, hasta).returns<(Pedido & { sucursal_id: string })[]>();
    }),
    leerTodo<LineaPedido>((desde, hasta) => {
      let q = supabase.from("pedido_productos")
        .select("pedido_id, nombre, precio, combo, pedidos!inner(fecha, sucursal_id)")
        .gte("pedidos.fecha", p.desde).lte("pedidos.fecha", p.hasta);
      if (sucursal) q = q.eq("pedidos.sucursal_id", sucursal);
      return q.order("pedido_id").order("renglon").range(desde, hasta).returns<LineaPedido[]>();
    }),
    cargarRappi(supabase,sucursal,p.desde,p.hasta),
  ]);
  const rappi=ventasRappi(datosRappi.ordenes,datosRappi.catalogo);
  return {
    // Postgres devuelve la hora como "13:05:00" y los montos pueden llegar como texto.
    pedidos: [...pedidos.map((x) => ({ ...x, hora: x.hora.slice(0, 5), total: Number(x.total), total_sin_descuento: Number(x.total_sin_descuento) })),...rappi.pedidos],
    lineas: [...lineas.map((l) => ({ pedido_id: l.pedido_id, nombre: l.nombre, precio: Number(l.precio), combo: l.combo })),...rappi.lineas],
  };
}
