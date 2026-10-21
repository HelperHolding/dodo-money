import { Icono } from "@/components/Icono";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { SelectorVista } from "@/components/SelectorVista";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos, fechaMX, hoyCalendarioMX } from "@/lib/formato";
import { estadoEntrega } from "@/lib/compras/entregas";
import { avanceOrden, ESTADOS_ORDEN, filtrarOrdenes, NOMBRE_AVANCE, NOMBRE_ESTADO_ORDEN, totalesOrden, type EstadoOrden } from "@/lib/compras/ordenes";
import type { TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerVista } from "@/lib/vista";

type Orden = {
  id: string; folio: string; estado: EstadoOrden; grupo_id: string; creado_en: string; sucursal_id: string | null; proveedor_id: string;
  entrega_esperada: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; sucursales: { nombre: string } | null;
};
type Renglon = { orden_id: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number };

export default async function Ordenes({ searchParams }: {
  searchParams: Promise<{ estado?: string; proveedor?: string; sucursal?: string; vista?: string; ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { estado, proveedor = "", sucursal = "", ok, error } = params;
  const vista = leerVista(params.vista);
  const { supabase, perfil } = await obtenerPerfil();
  const filtro = (ESTADOS_ORDEN as readonly string[]).includes(estado ?? "") ? (estado as EstadoOrden) : undefined;
  const [ordenes, renglones, { data: proveedores }, { data: sucursales }] = await Promise.all([
    leerTodo<Orden>((d, h) => supabase.from("ordenes_compra")
      .select("id, folio, estado, grupo_id, creado_en, sucursal_id, proveedor_id, entrega_esperada, proveedores(razon_social, nombre_comercial), sucursales(nombre)")
      .order("creado_en", { ascending: false }).order("id").range(d, h).returns<Orden[]>()),
    leerTodo<Renglon>((d, h) => supabase.from("renglones_recibido").select("orden_id, cantidad, precio, tasa_iva, recibido")
      .order("orden_id").order("id").range(d, h).returns<Renglon[]>()),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").order("razon_social")
      .returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const renglonesDe = new Map<string, Renglon[]>();
  for (const r of renglones) renglonesDe.set(r.orden_id, [...(renglonesDe.get(r.orden_id) ?? []), r]);
  const porGrupo = new Map<string, number>();
  for (const o of ordenes) porGrupo.set(o.grupo_id, (porGrupo.get(o.grupo_id) ?? 0) + 1);
  const hoy = hoyCalendarioMX();
  /** "llega vie 9 de oct" / "atrasada desde vie 9 de oct" / "sin fecha de entrega" para las confirmadas sin recibir completas. */
  const textoEntrega = (o: Orden, rs: Renglon[]) => {
    if (o.estado !== "confirmada") return null;
    const e = estadoEntrega(o.entrega_esperada, avanceOrden(rs) === "completa", hoy);
    if (e === "recibida") return null;
    if (e === "sin_fecha") return { texto: "sin fecha de entrega", alerta: false };
    return { texto: e === "atrasada" ? `atrasada desde ${fechaTexto(o.entrega_esperada!)}` : `llega ${fechaTexto(o.entrega_esperada!)}`, alerta: e === "atrasada" };
  };
  const visibles = filtrarOrdenes(ordenes, { estado: filtro, proveedor: proveedor || undefined, sucursal: sucursal || undefined });

  return (
    <>
      <EncabezadoPagina titulo="Órdenes de compra" descripcion="Cada documento empieza como cotización y, al confirmarlo, es la orden de compra que ve la sucursal."
        acciones={puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/ordenes/nueva"><Icono nombre="mas" />Nueva cotización</Link>} />
      <Aviso ok={ok} error={error} />
      <form className="barra-filtros compras-listado" role="search">
        {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
        <div className="barra-filtros">
          <div className="campo">
            <label htmlFor="f-estado" className="solo-lector">Estado</label>
            <select id="f-estado" name="estado" defaultValue={filtro ?? ""}>
              <option value="">Abiertas</option>
              {ESTADOS_ORDEN.map((e) => <option key={e} value={e}>{NOMBRE_ESTADO_ORDEN[e]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="f-proveedor" className="solo-lector">Proveedor</label>
            <select id="f-proveedor" name="proveedor" defaultValue={proveedor}>
              <option value="">Todos los proveedores</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="f-sucursal" className="solo-lector">Para</label>
            <select id="f-sucursal" name="sucursal" defaultValue={sucursal}>
              <option value="">Para todas las sucursales</option>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              <option value="oficina">Oficina</option>
            </select>
          </div>
        </div>
        <button className="boton boton-secundario boton-compacto" type="submit">Filtrar</button>
      </form>
      <SelectorVista ruta="/compras/ordenes" params={params} vista={vista} />
      {!visibles.length && <EstadoVacio icono="carrito" titulo="No hay órdenes con ese filtro" descripcion="Cambia el estado, el proveedor o la sucursal." />}
      {vista === "lista" && visibles.length > 0 && (
        <ul className="lista-filas" style={{ "--columnas": 4 } as React.CSSProperties}>
          <li className="fila fila-encabezado" aria-hidden="true"><span>Orden</span><span>Proveedor</span><span>Para</span><span>Estado</span><span>Total</span></li>
          {visibles.map((o) => {
            const rs = renglonesDe.get(o.id) ?? [];
            return (
              <li key={o.id} className="fila" data-alerta={o.estado === "cancelada" ? "si" : undefined}>
                <div className="fila-nombre">
                  <Link href={`/compras/ordenes/${o.id}`}>{o.folio}</Link>
                  <small>{fechaTexto(fechaMX(o.creado_en))}</small>
                  {textoEntrega(o, rs) && <small className={textoEntrega(o, rs)!.alerta ? "nota-estado" : undefined}>{textoEntrega(o, rs)!.texto}</small>}
                </div>
                <div className="fila-datos">
                  <span>{o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</span>
                  <span>{o.sucursales?.nombre ?? "Oficina"}</span>
                  <span>{NOMBRE_ESTADO_ORDEN[o.estado]}{o.estado === "confirmada" ? ` · ${NOMBRE_AVANCE[avanceOrden(rs)].toLowerCase()}` : ""}</span>
                  <span>{pesos(totalesOrden(rs).total)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {vista === "tarjetas" && <div className="tarjetas">
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
                {textoEntrega(o, rs) && <><dt>Entrega</dt><dd className={textoEntrega(o, rs)!.alerta ? "celda-alerta" : undefined}>{textoEntrega(o, rs)!.texto}</dd></>}
                <dt>Creada</dt><dd>{fechaTexto(fechaMX(o.creado_en))}</dd>
                {(porGrupo.get(o.grupo_id) ?? 0) > 1 && <><dt>Alternativas</dt><dd><Link href={`/compras/ordenes/${o.id}/comparar`}>Comparar {porGrupo.get(o.grupo_id)}</Link></dd></>}
              </dl>
            </article>
          );
        })}
      </div>}
    </>
  );
}
