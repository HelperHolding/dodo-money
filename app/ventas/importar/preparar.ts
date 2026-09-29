import type { SupabaseClient } from "@supabase/supabase-js";
import { tamanoPorNombre } from "@/lib/ventas/calculos";
import { extraerDatosBrutos } from "@/lib/ventas/datosBrutos";
import { buscarSucursal, type Desglose, type Montos } from "@/lib/ventas/extraer";
import { leerTodo } from "@/lib/ventas/paginar";
import { ivaDe, resumirDias } from "@/lib/ventas/pedidos";
import { leerHojas } from "@/lib/ventas/xlsx";

/** Lo que ve el admin antes de guardar. Sin los pedidos: esos se quedan en el servidor. */
export type Revision = {
  archivo: string;
  periodo: { desde: string; hasta: string };
  dias: {
    sucursal: { id: string; nombre: string };
    fecha: string;
    resumen: Montos;
    ticket: number | null;
    personal: { pedidos: number; monto: number };
    cancelados: { pedidos: number; monto: number };
    yaImportado: { total: number } | null;
  }[];
  totales: { pedidos: number; total: number; personal: number; cancelados: number };
  /** Productos que no están en el catálogo (entran sin categoría ni costo). */
  nuevos: string[];
  sinCategoria: string[];
  sinCosto: string[];
  diasYaImportados: number;
};

/** Lo que se manda a importar_datos_brutos. */
export type Carga = { dias: unknown[]; pedidos: unknown[]; productos: unknown[] };

/** Un Datos brutos de una semana pesa ~120 KB; 4 MB alcanza para varios meses de varias sucursales. */
const MAX_BYTES = 4 * 1024 * 1024;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Lee y valida el archivo sin guardar nada. Lanza Error con un mensaje para el admin. */
export async function prepararImportacion(supabase: SupabaseClient, fd: FormData): Promise<{ revision: Revision; carga: Carga }> {
  const f = fd.get("archivo");
  if (!(f instanceof File) || f.size === 0) throw new Error("Falta el archivo de Datos brutos.");
  if (f.size > MAX_BYTES) throw new Error("El archivo pesa más de 4 MB; exporta un periodo más corto.");
  const archivo = extraerDatosBrutos(leerHojas(new Uint8Array(await f.arrayBuffer())));

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre, m2_comedor")
    .returns<{ id: string; nombre: string; m2_comedor: number | null }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const sucursalDe = new Map<string, { id: string; nombre: string; m2_comedor: number | null }>();
  for (const nombre of new Set(archivo.pedidos.map((p) => p.sucursal))) {
    const s = buscarSucursal(nombre, sucursales ?? []);
    if (!s) throw new Error(`La sucursal ${nombre} del archivo no existe en la app.`);
    sucursalDe.set(nombre, s);
  }

  const resumen = resumirDias(archivo.pedidos, archivo.productos);
  const fechas = resumen.map((d) => d.fecha).sort();
  const periodo = { desde: fechas[0], hasta: fechas[fechas.length - 1] };
  const ids = [...new Set([...sucursalDe.values()].map((s) => s.id))];

  const [previos, catalogo, codigos, costos] = await Promise.all([
    supabase.from("ventas_dia").select("sucursal_id, fecha, total").in("sucursal_id", ids)
      .gte("fecha", periodo.desde).lte("fecha", periodo.hasta)
      .returns<{ sucursal_id: string; fecha: string; total: number }[]>(),
    leerTodo<{ dodo_id: number; nombre: string; categoria: string | null }>((desde, hasta) =>
      supabase.from("productos_venta").select("dodo_id, nombre, categoria").order("dodo_id").range(desde, hasta)
        .returns<{ dodo_id: number; nombre: string; categoria: string | null }[]>()),
    leerTodo<{ dodo_uuid: string; dodo_id: number }>((desde, hasta) =>
      supabase.from("productos_codigos").select("dodo_uuid, dodo_id").order("dodo_uuid").range(desde, hasta)
        .returns<{ dodo_uuid: string; dodo_id: number }[]>()),
    leerTodo<{ dodo_id: number }>((desde, hasta) =>
      supabase.from("costos_producto").select("dodo_id").lte("vigente_desde", periodo.hasta)
        .order("dodo_id").order("vigente_desde").range(desde, hasta).returns<{ dodo_id: number }[]>()),
  ]);
  if (previos.error) throw new Error(`No se pudo revisar qué días ya estaban importados: ${previos.error.message}`);
  const previo = new Map((previos.data ?? []).map((v) => [`${v.sucursal_id}|${v.fecha}`, Number(v.total)]));

  // Empate con el catálogo igual que en la base de datos: por código; si no, por nombre (el de menor número si se
  // repite). Todos los códigos de un mismo nombre van al mismo producto (versión normal y "T").
  const porId = new Map(catalogo.map((c) => [c.dodo_id, c]));
  const porCodigo = new Map(codigos.flatMap((k) => (porId.has(k.dodo_id) ? [[k.dodo_uuid, porId.get(k.dodo_id)!] as const] : [])));
  const porNombre = new Map<string, (typeof catalogo)[number]>();
  for (const c of catalogo) if (!porNombre.has(c.nombre.toLowerCase())) porNombre.set(c.nombre.toLowerCase(), c);
  const conCosto = new Set(costos.map((c) => c.dodo_id));
  const nuevos = new Set<string>(), sinCategoria = new Set<string>(), sinCosto = new Set<string>();
  for (const x of archivo.productos) {
    const c = porCodigo.get(x.dodo_uuid) ?? porNombre.get(x.nombre.toLowerCase());
    if (!c) { nuevos.add(x.nombre); continue; }
    if (!c.categoria) sinCategoria.add(c.nombre);
    if (!conCosto.has(c.dodo_id)) sinCosto.add(c.nombre);
  }

  const dias = resumen.map((d) => {
    const s = sucursalDe.get(d.sucursal)!;
    return { d, s, anterior: previo.get(`${s.id}|${d.fecha}`) };
  });
  const lineasDe = new Map<string, number[]>();
  for (const x of archivo.productos) lineasDe.set(x.pedido_id, [...(lineasDe.get(x.pedido_id) ?? []), x.precio]);

  const revision: Revision = {
    archivo: f.name,
    periodo,
    dias: dias.map(({ d, s, anterior }) => ({
      sucursal: { id: s.id, nombre: s.nombre },
      fecha: d.fecha,
      resumen: d.resumen,
      ticket: d.resumen.pedidos ? d.resumen.total / d.resumen.pedidos : null,
      personal: d.personal,
      cancelados: d.cancelados,
      yaImportado: anterior === undefined ? null : { total: anterior },
    })),
    totales: {
      pedidos: resumen.reduce((s, d) => s + d.resumen.pedidos, 0),
      total: redondear(resumen.reduce((s, d) => s + d.resumen.total, 0)),
      personal: resumen.reduce((s, d) => s + d.personal.pedidos, 0),
      cancelados: resumen.reduce((s, d) => s + d.cancelados.pedidos, 0),
    },
    nuevos: [...nuevos].sort(),
    sinCategoria: [...sinCategoria].sort(),
    sinCosto: [...sinCosto].filter((n) => !nuevos.has(n)).sort(),
    diasYaImportados: dias.filter((x) => x.anterior !== undefined).length,
  };

  const carga: Carga = {
    dias: dias.map(({ d, s }) => ({
      sucursal_id: s.id,
      fecha: d.fecha,
      resumen: {
        ...d.resumen,
        venta_m2: s.m2_comedor ? redondear(d.resumen.total / Number(s.m2_comedor)) : null,
        suma_productos: d.productos.suma,
        productos: d.productos.piezas,
      },
      desglose: d.desglose satisfies Desglose[],
    })),
    pedidos: archivo.pedidos.map(({ sucursal, ...p }) => ({
      ...p,
      sucursal_id: sucursalDe.get(sucursal)!.id,
      iva: ivaDe(lineasDe.get(p.dodo_id) ?? []),
    })),
    productos: archivo.productos.map((x) => ({ ...x, tamano: tamanoPorNombre(x.nombre) })),
  };
  return { revision, carga };
}
