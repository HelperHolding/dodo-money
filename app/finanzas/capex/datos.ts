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
