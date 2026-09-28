import type { SupabaseClient } from "@supabase/supabase-js";
import { tamanoPorNombre, type Tamano } from "@/lib/ventas/calculos";
import {
  buscarSucursal, extraerProductos, extraerVentas, revisarPar,
  type Desglose, type Montos, type ProductoVendido,
} from "@/lib/ventas/extraer";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerPrimeraHoja } from "@/lib/ventas/xlsx";

export type Revision = {
  sucursal: { id: string; nombre: string };
  fecha: string;
  resumen: Montos & { venta_m2: number | null };
  desglose: Desglose[];
  productos: (ProductoVendido & { tamano: Tamano | null })[];
  archivos: { ventas: string; productos: string };
  sumaProductos: number;
  diferencia: number;
  cuadra: boolean;
  ticket: number | null;
  yaImportado: { total: number } | null;
  /** Nombres de productos que no están en el catálogo (entran sin categoría ni costo). */
  nuevos: string[];
  sinCategoria: string[];
  sinCosto: string[];
};

/** Un reporte diario pesa unos KB; más de 2 MB no es un reporte de un día. */
const MAX_BYTES = 2 * 1024 * 1024;

async function archivo(fd: FormData, campo: string, etiqueta: string) {
  const f = fd.get(campo);
  if (!(f instanceof File) || f.size === 0) throw new Error(`Falta el archivo de ${etiqueta}.`);
  if (f.size > MAX_BYTES) throw new Error(`El archivo de ${etiqueta} pesa más de 2 MB; no parece un reporte de un día.`);
  return { nombre: f.name, datos: new Uint8Array(await f.arrayBuffer()) };
}

/** Lee y valida los dos archivos sin guardar nada. Lanza Error con un mensaje para el admin. */
export async function prepararImportacion(supabase: SupabaseClient, fd: FormData): Promise<Revision> {
  const av = await archivo(fd, "ventas", "Ventas");
  const ap = await archivo(fd, "productos", "Productos");
  const ventas = extraerVentas(leerPrimeraHoja(av.datos));
  const productos = extraerProductos(leerPrimeraHoja(ap.datos));
  const par = revisarPar(ventas, productos);

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const sucursal = buscarSucursal(ventas.sucursal, sucursales ?? []);
  if (!sucursal) throw new Error(`El reporte es de la sucursal ${ventas.sucursal} y no existe en la app.`);

  const ids = productos.productos.map((p) => p.dodo_id);
  const [previo, catalogo, costos] = await Promise.all([
    supabase.from("ventas_dia").select("total").eq("sucursal_id", sucursal.id).eq("fecha", ventas.fecha).maybeSingle<{ total: number }>(),
    supabase.from("productos_venta").select("dodo_id, categoria").in("dodo_id", ids).returns<{ dodo_id: number; categoria: string | null }[]>(),
    leerTodo<{ dodo_id: number }>((desde, hasta) => supabase.from("costos_producto").select("dodo_id")
      .in("dodo_id", ids).lte("vigente_desde", ventas.fecha).order("dodo_id").order("vigente_desde").range(desde, hasta)
      .returns<{ dodo_id: number }[]>()),
  ]);
  const fallo = previo.error ?? catalogo.error;
  if (fallo) throw new Error(`No se pudo revisar el catálogo: ${fallo.message}`);

  const categoria = new Map((catalogo.data ?? []).map((c) => [c.dodo_id, c.categoria]));
  const conCosto = new Set(costos.map((c) => c.dodo_id));
  const nombres = (cumple: (p: ProductoVendido) => boolean) => productos.productos.filter(cumple).map((p) => p.nombre);

  return {
    sucursal,
    fecha: ventas.fecha,
    resumen: ventas.resumen,
    desglose: ventas.desglose,
    productos: productos.productos.map((p) => ({ ...p, tamano: tamanoPorNombre(p.nombre) })),
    archivos: { ventas: av.nombre, productos: ap.nombre },
    ...par,
    ticket: ventas.resumen.pedidos ? ventas.resumen.total / ventas.resumen.pedidos : null,
    yaImportado: previo.data ? { total: Number(previo.data.total) } : null,
    nuevos: nombres((p) => !categoria.has(p.dodo_id)),
    sinCategoria: nombres((p) => categoria.has(p.dodo_id) && !categoria.get(p.dodo_id)),
    sinCosto: nombres((p) => categoria.has(p.dodo_id) && !conCosto.has(p.dodo_id)),
  };
}
