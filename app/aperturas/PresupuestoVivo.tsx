import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pesos, porcentaje } from "@/lib/formato";
import type { ItemApertura, ProyectoApertura } from "@/lib/aperturas";
import { presupuestoVivo, type FilaVivo, type PresupuestoVivo as Vivo } from "@/lib/aperturas/presupuestoVivo";
import { filaCapex } from "@/app/finanzas/capex/datos";
import { leerTodo } from "@/lib/ventas/paginar";
import { CortePresupuesto } from "./CortePresupuesto";

// Presupuesto del proyecto desde CAPEX (HD-3). Solo para quien ve Finanzas: la página carga los datos una vez y los usa también en el KPI.
export type CargaVivo = { vivo: Vivo; sinCategoria: number | null; error: boolean };

const DIA = 86_400_000;
const masDias = (fecha: string, dias: number) => new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) + dias * DIA).toISOString().slice(0, 10);

/** Órdenes confirmadas y facturas no canceladas de la sucursal, hasta objetivo + 60 días, sin asignación CAPEX. Si algo falla devuelve null (la vista lo avisa). */
async function contarSinCategoria(db: SupabaseClient, p: Pick<ProyectoApertura, "sucursal_id" | "objetivo_hasta">): Promise<number | null> {
  try {
    const tope = masDias(p.objetivo_hasta, 60);
    // confirmada_en es timestamptz: corte al inicio del día siguiente al tope, hora del centro de México.
    const [asignadas, ordenes, facturas] = await Promise.all([
      leerTodo((d, h) => db.from("capex_asignaciones").select("orden_id, factura_id").order("id").range(d, h).returns<{ orden_id: string | null; factura_id: string | null }[]>()),
      leerTodo((d, h) => db.from("ordenes_compra").select("id").eq("sucursal_id", p.sucursal_id).eq("estado", "confirmada")
        .lt("confirmada_en", `${masDias(tope, 1)}T00:00:00-06:00`).order("id").range(d, h).returns<{ id: string }[]>()),
      leerTodo((d, h) => db.from("facturas").select("id").eq("sucursal_id", p.sucursal_id).neq("estado", "cancelada")
        .lte("fecha_emision", tope).order("id").range(d, h).returns<{ id: string }[]>()),
    ]);
    const conOrden = new Set(asignadas.map((a) => a.orden_id).filter(Boolean)), conFactura = new Set(asignadas.map((a) => a.factura_id).filter(Boolean));
    return ordenes.filter((o) => !conOrden.has(o.id)).length + facturas.filter((f) => !conFactura.has(f.id)).length;
  } catch {
    return null;
  }
}

export async function cargarPresupuestoVivo(db: SupabaseClient, p: Pick<ProyectoApertura, "id" | "sucursal_id" | "objetivo_hasta">, items: ItemApertura[]): Promise<CargaVivo> {
  const [{ data, error }, sinCategoria] = await Promise.all([
    db.from("capex_resumen").select("*").eq("proyecto_id", p.id).returns<Record<string, unknown>[]>(),
    contarSinCategoria(db, p),
  ]);
  if (error) return { vivo: presupuestoVivo([], []), sinCategoria, error: true };
  return { vivo: presupuestoVivo((data ?? []).map(filaCapex), items), sinCategoria, error: false };
}

function Tabla({ filas, total }: { filas: FilaVivo[]; total: FilaVivo }) {
  const celdas = (f: FilaVivo) => <>
    <td data-label="Categoría">{f.nombre}</td>
    <td data-label="Presupuesto">{f.presupuesto === null ? "Sin presupuesto" : pesos(f.presupuesto)}</td>
    <td data-label="Pagado">{pesos(f.pagado)}</td>
    <td data-label="Facturado">{pesos(f.facturado)}</td>
    <td data-label="Comprometido">{pesos(f.comprometido)}</td>
    <td data-label="Cotizado sin OC">{pesos(f.cotizado)}</td>
    <td data-label="Falta cotizar">{f.faltante === null ? "—" : pesos(f.faltante)}</td>
  </>;
  return <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla">
    <thead><tr><th>Categoría</th><th>Presupuesto</th><th>Pagado</th><th>Facturado</th><th>Comprometido</th><th>Cotizado sin OC</th><th>Falta cotizar</th></tr></thead>
    <tbody>{filas.map((f) => <tr key={f.clave}>{celdas(f)}</tr>)}<tr className="akton-subtotal">{celdas(total)}</tr></tbody>
  </table></div>;
}

export function PresupuestoVivo({ vivo, sinCategoria, proyectoId, items, error, puedeEditar }: CargaVivo & { proyectoId: string; items: ItemApertura[]; puedeEditar: boolean }) {
  const href = `/finanzas/capex/${proyectoId}`;
  if (error) return <>
    <p className="aviso aviso-error">No se pudo cargar el presupuesto vivo. <Link href={href}>Abrir en Finanzas</Link></p>
    <CortePresupuesto items={items} plegado={false} />
  </>;
  const aviso = sinCategoria === null
    ? <p className="akton-nota">No se pudo revisar si hay documentos sin categoría CAPEX.</p>
    : sinCategoria > 0 && <p className="akton-nota">{sinCategoria} {sinCategoria === 1 ? "documento" : "documentos"} de esta sucursal sin categoría CAPEX: no suman al presupuesto y «Falta cotizar» puede estar sobrestimado. <Link href={href}>{puedeEditar ? "Asignar categoría" : "Ver en Finanzas"}</Link></p>;
  const { categorias, total } = vivo;
  if (!vivo.conPresupuesto) return <>
    <p className="aviso">Sin presupuesto CAPEX aprobado para esta apertura. <Link href={href}>{puedeEditar ? "Capturarlo en Finanzas" : "Ver en Finanzas"}</Link></p>
    {(categorias.length > 0 || aviso) && <div className="akton"><section className="akton-tabla-marco" aria-labelledby="ap-vivo-mov">
      <h2 id="ap-vivo-mov" className="akton-titulo">Movimientos CAPEX de la apertura</h2>
      <p className="akton-subtitulo">Desde CAPEX · sin IVA · sin presupuesto aprobado</p>
      {categorias.length > 0 && <Tabla filas={categorias} total={total} />}
      {aviso}
    </section></div>}
    <CortePresupuesto items={items} plegado={false} />
  </>;
  const ejercido = total.comprometido + total.facturado;
  return <>
    <div className="akton"><section className="akton-tabla-marco" id="presupuesto-vivo" aria-labelledby="ap-vivo">
      <h2 id="ap-vivo" className="akton-titulo">Presupuesto del proyecto</h2>
      <p className="akton-subtitulo">Desde CAPEX · sin IVA · {pesos(total.presupuesto)} presupuestado · {porcentaje(total.presupuesto ? ejercido / total.presupuesto : null)} ejercido</p>
      <Tabla filas={categorias} total={total} />
      <p className="akton-nota">La falta por categoría supone que las compras se asignan a la misma categoría del presupuesto; el total compensa entre categorías.</p>
      {aviso}
    </section></div>
    <CortePresupuesto items={items} plegado />
  </>;
}
