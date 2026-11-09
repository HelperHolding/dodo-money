import type { SupabaseClient } from "@supabase/supabase-js";
import { pesos } from "@/lib/formato";
import { CATEGORIAS_CAPEX, nombreCategoriaCapex, sugerirAsignacion, type RenglonCapex } from "@/lib/finanzas/capex";
import { guardarCapexDocumento } from "./acciones";

type Props = { db: SupabaseClient; tipo: "orden" | "factura"; id: string; sucursalId: string | null; subtotal: number; cancelado: boolean; uuidRelacionado?: string | null; puedeEditar: boolean };

export async function capexVisible(db: SupabaseClient, sucursalId: string | null) {
  if (!sucursalId) return false;
  const { count } = await db.from("apertura_proyectos").select("id", { count: "exact", head: true }).eq("sucursal_id", sucursalId);
  return (count ?? 0) > 0;
}

/** Bloque "CAPEX de apertura" en el detalle de una orden o factura de Compras. */
export async function BloqueCapex({ db, tipo, id, sucursalId, subtotal, cancelado, uuidRelacionado, puedeEditar }: Props) {
  const campo = tipo === "orden" ? "orden_id" : "factura_id";
  const [{ data: proyectos }, { data: actuales }, { data: items }, { data: ordenes }, { data: relacionada }] = await Promise.all([
    db.from("apertura_proyectos").select("id, sucursales(nombre)").eq("sucursal_id", sucursalId ?? "").returns<{ id: string; sucursales: { nombre: string } | null }[]>(),
    db.from("capex_asignaciones").select("proyecto_id, categoria, monto, nota").eq(campo, id).returns<RenglonCapex[]>(),
    db.from("apertura_items").select("categoria").eq(campo, id).returns<{ categoria: string | null }[]>(),
    tipo === "factura" ? db.from("factura_ordenes").select("orden_id").eq("factura_id", id).returns<{ orden_id: string }[]>() : Promise.resolve({ data: [] as { orden_id: string }[] }),
    tipo === "factura" && uuidRelacionado ? db.from("facturas").select("id").eq("uuid", uuidRelacionado).returns<{ id: string }[]>() : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  const ids = (proyectos ?? []).map((p) => p.id);
  const fuente = (ordenes ?? []).length ? { col: "orden_id", ids: (ordenes ?? []).map((o) => o.orden_id) } : (relacionada ?? []).length ? { col: "factura_id", ids: (relacionada ?? []).map((f) => f.id) } : null;
  const base = fuente ? (await db.from("capex_asignaciones").select("proyecto_id, categoria, monto").in(fuente.col, fuente.ids).returns<RenglonCapex[]>()).data ?? [] : [];
  const renglones = (actuales ?? []).map((r) => ({ ...r, monto: Number(r.monto) }));
  const sugerido = renglones.length === 0;
  const filas = sugerido ? sugerirAsignacion({ subtotal, proyectos: ids, categoriasItems: (items ?? []).map((i) => i.categoria), base: base.map((b) => ({ ...b, monto: Number(b.monto) })) }) : renglones;
  const asignado = renglones.reduce((a, r) => a + Math.round(r.monto * 100), 0) / 100;
  const nombre = (p: string) => (proyectos ?? []).find((x) => x.id === p)?.sucursales?.nombre ?? "Apertura";
  const vacias = Math.max(2, 4 - filas.length);
  const total = filas.length + vacias;
  return (
    <section className="seccion" aria-labelledby="t-capex"><h2 id="t-capex">CAPEX de apertura</h2>
      <p>Asignado {pesos(asignado)} de {pesos(subtotal)} sin IVA · sin asignar {pesos(Math.max(0, subtotal - asignado))}. Lo que no se asigna no cuenta en el reporte de CAPEX.</p>
      {renglones.length > 0 && <ul>{renglones.map((r) => <li key={r.proyecto_id + r.categoria}>{nombre(r.proyecto_id)} · {nombreCategoriaCapex(r.categoria)} · {pesos(r.monto)}{r.nota && ` · ${r.nota}`}</li>)}</ul>}
      {cancelado && <p>Documento cancelado: no cuenta en el CAPEX.</p>}
      {puedeEditar && !cancelado && <form action={guardarCapexDocumento} className="formulario">
        {sugerido && filas.length > 0 && <p className="saldo-nota">Sugerencia sin guardar: revisa la categoría y el monto antes de guardar.</p>}
        <input type="hidden" name="tipo" value={tipo} /><input type="hidden" name="documento" value={id} /><input type="hidden" name="filas" value={total} />
        {Array.from({ length: total }, (_, i) => { const r = filas[i]; return <fieldset key={i}><legend>Renglón {i + 1}</legend>
          <label>Apertura<select name={`proyecto_${i}`} defaultValue={r?.proyecto_id ?? ids[0]}>{(proyectos ?? []).map((p) => <option key={p.id} value={p.id}>{p.sucursales?.nombre ?? "Apertura"}</option>)}</select></label>
          <label>Categoría<select name={`categoria_${i}`} defaultValue={r?.categoria ?? "otros"}>{CATEGORIAS_CAPEX.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</select></label>
          <label>Monto sin IVA<input name={`monto_${i}`} inputMode="decimal" defaultValue={r?.monto ?? ""} /></label>
          <label>Nota<input name={`nota_${i}`} maxLength={500} defaultValue={r?.nota ?? ""} /></label>
        </fieldset>; })}
        <label>Motivo del cambio<input name="motivo" required minLength={5} maxLength={2000} placeholder="Por qué se asigna así" /></label>
        <button className="boton">Guardar CAPEX</button>
        <small className="saldo-nota">Deja el monto vacío para quitar un renglón; todos vacíos quita la marca CAPEX.</small>
      </form>}
    </section>
  );
}
