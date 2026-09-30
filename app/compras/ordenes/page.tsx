import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { avanceOrden, ESTADOS_ORDEN, NOMBRE_AVANCE, NOMBRE_ESTADO_ORDEN, totalesOrden, type EstadoOrden } from "@/lib/compras/ordenes";
import type { TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";

type Orden = {
  id: string; folio: string; estado: EstadoOrden; grupo_id: string; creado_en: string; sucursal_id: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; sucursales: { nombre: string } | null;
};
type Renglon = { orden_id: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number };

export default async function Ordenes({ searchParams }: { searchParams: Promise<{ estado?: string; ok?: string; error?: string }> }) {
  const { estado, ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const filtro = (ESTADOS_ORDEN as readonly string[]).includes(estado ?? "") ? (estado as EstadoOrden) : undefined;
  const [ordenes, renglones] = await Promise.all([
    leerTodo<Orden>((d, h) => supabase.from("ordenes_compra")
      .select("id, folio, estado, grupo_id, creado_en, sucursal_id, proveedores(razon_social, nombre_comercial), sucursales(nombre)")
      .order("creado_en", { ascending: false }).order("id").range(d, h).returns<Orden[]>()),
    leerTodo<Renglon>((d, h) => supabase.from("renglones_recibido").select("orden_id, cantidad, precio, tasa_iva, recibido")
      .order("orden_id").order("id").range(d, h).returns<Renglon[]>()),
  ]);
  const renglonesDe = new Map<string, Renglon[]>();
  for (const r of renglones) renglonesDe.set(r.orden_id, [...(renglonesDe.get(r.orden_id) ?? []), r]);
  const porGrupo = new Map<string, number>();
  for (const o of ordenes) porGrupo.set(o.grupo_id, (porGrupo.get(o.grupo_id) ?? 0) + 1);
  const visibles = ordenes.filter((o) => (filtro ? o.estado === filtro : o.estado !== "cancelada" && o.estado !== "cerrada"));

  return (
    <>
      <div className="encabezado">
        <h1>Órdenes de compra</h1>
        <p>Cada documento empieza como cotización y, al confirmarlo, es la orden de compra que ve la sucursal.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <nav className="acciones" aria-label="Filtros">
        <Link className="boton boton-secundario" href="/compras/ordenes" aria-current={!filtro ? "page" : undefined}>Abiertas</Link>
        {ESTADOS_ORDEN.map((e) => (
          <Link key={e} className="boton boton-secundario" href={`/compras/ordenes?estado=${e}`} aria-current={filtro === e ? "page" : undefined}>
            {NOMBRE_ESTADO_ORDEN[e]}
          </Link>
        ))}
        {puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/ordenes/nueva">Nueva cotización</Link>}
      </nav>
      {!visibles.length && <p className="vacio">No hay órdenes con ese filtro.</p>}
      <div className="tarjetas">
        {visibles.map((o) => {
          const rs = renglonesDe.get(o.id) ?? [];
          const avance = avanceOrden(rs);
          return (
            <article key={o.id} className="tarjeta" data-alerta={o.estado === "cancelada" ? "si" : undefined}>
              <div className="tarjeta-encabezado">
                <div>
                  <h3><Link href={`/compras/ordenes/${o.id}`}>{o.folio}</Link> · {o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</h3>
                  <p className="tarjeta-estado">{NOMBRE_ESTADO_ORDEN[o.estado]}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Para</dt><dd>{o.sucursales?.nombre ?? "Oficina"}</dd>
                <dt>Total</dt><dd>{pesos(totalesOrden(rs).total)} · {rs.length} renglones</dd>
                {o.estado === "confirmada" && <><dt>Recepción</dt><dd>{NOMBRE_AVANCE[avance]}</dd></>}
                <dt>Creada</dt><dd>{fechaTexto(o.creado_en.slice(0, 10))}</dd>
                {(porGrupo.get(o.grupo_id) ?? 0) > 1 && <><dt>Alternativas</dt><dd><Link href={`/compras/ordenes/${o.id}/comparar`}>Comparar {porGrupo.get(o.grupo_id)}</Link></dd></>}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
