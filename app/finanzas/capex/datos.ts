import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import type { FilaCapex } from "@/lib/finanzas/capex";

export type ProyectoCapex = { id: string; sucursal_id: string; sucursal: string; responsable: string; objetivo_desde: string; objetivo_hasta: string };
type ProyectoBd = Omit<ProyectoCapex, "sucursal"> & { sucursales: { nombre: string } | null };

const num = (v: unknown) => Number(v ?? 0);
const numONull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const filaCapex = (x: Record<string, unknown>): FilaCapex => ({
  proyecto_id: String(x.proyecto_id), categoria: String(x.categoria), presupuesto: numONull(x.presupuesto),
  comprometido: num(x.comprometido), facturado: num(x.facturado), pagado: num(x.pagado), pagado_con_iva: num(x.pagado_con_iva),
  por_pagar_con_iva: num(x.por_pagar_con_iva), por_ejercer: numONull(x.por_ejercer), desviacion: numONull(x.desviacion),
});
const proyecto = (p: ProyectoBd): ProyectoCapex => ({ id: p.id, sucursal_id: p.sucursal_id, sucursal: p.sucursales?.nombre ?? "Sucursal", responsable: p.responsable, objetivo_desde: p.objetivo_desde, objetivo_hasta: p.objetivo_hasta });

export async function cargarProyectosCapex(db: SupabaseClient, id?: string): Promise<ProyectoCapex[]> {
  let q = db.from("apertura_proyectos").select("id, sucursal_id, responsable, objetivo_desde, objetivo_hasta, sucursales(nombre)").order("objetivo_desde");
  if (id) q = q.eq("id", id);
  const { data, error } = await q.returns<ProyectoBd[]>();
  if (error) throw new Error(`No se pudieron cargar las aperturas: ${error.message}`);
  return (data ?? []).map(proyecto);
}

export async function cargarResumenCapex(db: SupabaseClient) {
  const [proyectos, filas, historico, sucursales] = await Promise.all([
    cargarProyectosCapex(db),
    leerTodo((d, h) => db.from("capex_resumen").select("*").order("proyecto_id").order("categoria").range(d, h).returns<Record<string, unknown>[]>()),
    leerTodo((d, h) => db.from("capex_historico").select("sucursal_id, categoria, monto").order("sucursal_id").order("categoria").range(d, h).returns<{ sucursal_id: string; categoria: string; monto: number }[]>()),
    db.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const nombre = new Map((sucursales.data ?? []).map((s) => [s.id, s.nombre]));
  return {
    proyectos,
    filas: filas.map(filaCapex),
    historico: historico.map((x) => ({ sucursal_id: x.sucursal_id, sucursal: nombre.get(x.sucursal_id) ?? "Sucursal", categoria: x.categoria, monto: Number(x.monto) })),
  };
}
export type Revision = { revision: number; categoria: string; monto: number; motivo: string; aprobado_en: string; aprobador: string };
export type DocumentoCapex = { id: string; tipo: "orden" | "factura"; documento_id: string; folio: string; proveedor: string; estado: string; categoria: string; monto: number; egreso: boolean };
export type SinCategorizar = { id: string; nombre: string; tipo: "orden" | "factura"; documento_id: string };

type AsignacionBd = {
  id: string; categoria: string; monto: number; orden_id: string | null; factura_id: string | null;
  ordenes_compra: { folio: string; estado: string; proveedores: { razon_social: string } | null } | null;
  facturas: { serie: string | null; folio: string | null; estado: string; tipo: string; proveedores: { razon_social: string } | null } | null;
};

export async function cargarDetalleCapex(db: SupabaseClient, id: string) {
  const [proyecto] = await cargarProyectosCapex(db, id);
  if (!proyecto) return null;
  const [filas, revisiones, asignaciones, items, todas] = await Promise.all([
    db.from("capex_resumen").select("*").eq("proyecto_id", id).returns<Record<string, unknown>[]>(),
    db.from("capex_presupuestos").select("revision, categoria, monto, motivo, aprobado_en, perfiles(nombre)").eq("proyecto_id", id).order("revision", { ascending: false })
      .returns<{ revision: number; categoria: string; monto: number; motivo: string; aprobado_en: string; perfiles: { nombre: string } | null }[]>(),
    db.from("capex_asignaciones").select("id, categoria, monto, orden_id, factura_id, ordenes_compra(folio, estado, proveedores(razon_social)), facturas(serie, folio, estado, tipo, proveedores(razon_social))")
      .eq("proyecto_id", id).order("creado_en").returns<AsignacionBd[]>(),
    db.from("apertura_items").select("id, nombre, orden_id, factura_id").eq("proyecto_id", id).or("orden_id.not.is.null,factura_id.not.is.null")
      .returns<{ id: string; nombre: string; orden_id: string | null; factura_id: string | null }[]>(),
    db.from("capex_asignaciones").select("orden_id, factura_id").returns<{ orden_id: string | null; factura_id: string | null }[]>(),
  ]);
  for (const r of [filas, revisiones, asignaciones, items, todas]) if (r.error) throw new Error(`No se pudo cargar el CAPEX: ${r.error.message}`);
  const asignados = new Set((todas.data ?? []).flatMap((a) => [a.orden_id, a.factura_id]).filter(Boolean));
  return {
    proyecto,
    filas: (filas.data ?? []).map(filaCapex),
    revisiones: (revisiones.data ?? []).map((r) => ({ revision: r.revision, categoria: r.categoria, monto: Number(r.monto), motivo: r.motivo, aprobado_en: r.aprobado_en, aprobador: r.perfiles?.nombre ?? "Administración" })),
    documentos: (asignaciones.data ?? []).map((a): DocumentoCapex => a.orden_id
      ? { id: a.id, tipo: "orden", documento_id: a.orden_id, folio: a.ordenes_compra?.folio ?? "Orden", proveedor: a.ordenes_compra?.proveedores?.razon_social ?? "", estado: a.ordenes_compra?.estado ?? "", categoria: a.categoria, monto: Number(a.monto), egreso: false }
      : { id: a.id, tipo: "factura", documento_id: a.factura_id!, folio: [a.facturas?.serie, a.facturas?.folio].filter(Boolean).join("-") || "Factura", proveedor: a.facturas?.proveedores?.razon_social ?? "", estado: a.facturas?.estado ?? "", categoria: a.categoria, monto: Number(a.monto), egreso: a.facturas?.tipo === "egreso" }),
    sinCategorizar: (items.data ?? []).flatMap((i): SinCategorizar[] => [
      ...(i.orden_id && !asignados.has(i.orden_id) ? [{ id: `${i.id}-o`, nombre: i.nombre, tipo: "orden" as const, documento_id: i.orden_id }] : []),
      ...(i.factura_id && !asignados.has(i.factura_id) ? [{ id: `${i.id}-f`, nombre: i.nombre, tipo: "factura" as const, documento_id: i.factura_id }] : []),
    ]),
  };
}
