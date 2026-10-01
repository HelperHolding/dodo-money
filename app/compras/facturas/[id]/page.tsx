import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { cotejar, NOMBRE_COTEJO, NOMBRE_ESTADO_FACTURA, valorRecibido, vencida, type EstadoFactura } from "@/lib/compras/facturas";
import { avanceOrden, totalesOrden } from "@/lib/compras/ordenes";
import { nombreRegimen, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { asignarDestino, cambiarVencimientoFactura, cancelarFacturaAccion, ligarOrdenes, marcarRevisada } from "../acciones";

type Factura = {
  id: string; uuid: string; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha_emision: string;
  rfc_emisor: string; nombre_emisor: string; regimen_emisor: string; metodo_pago: string | null; forma_pago: string | null;
  subtotal: number; descuento: number; iva: number; retenciones: number; total: number; saldo: number; proveedor_id: string; sucursal_id: string | null;
  uuid_relacionado: string | null; vence_el: string; estado: EstadoFactura; revisada: boolean; revision_nota: string | null;
  xml_ruta: string; pdf_ruta: string | null; motivo_cancelacion: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null; regimen_fiscal: string } | null;
};
type Concepto = { id: number; descripcion: string; cantidad: number; unidad: string; valor_unitario: number; importe: number };
type Orden = { id: string; folio: string; estado: string; sucursales: { nombre: string } | null };
type Renglon = { orden_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number };
type Relacionada = { id: string; serie: string | null; folio: string | null; uuid: string; tipo: string; total: number; estado: EstadoFactura };

export default async function DetalleFactura({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: f } = await supabase.from("facturas_saldo")
    .select("id, uuid, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, metodo_pago, forma_pago, subtotal, descuento, iva, retenciones, total, saldo, proveedor_id, sucursal_id, uuid_relacionado, vence_el, estado, revisada, revision_nota, xml_ruta, pdf_ruta, motivo_cancelacion, proveedores(razon_social, nombre_comercial, regimen_fiscal)")
    .eq("id", id).maybeSingle<Factura>();
  if (!f) notFound();

  const [{ data: conceptos }, { data: ligas }, { data: candidatas }, { data: sucursales }, { data: relacionadas }] = await Promise.all([
    supabase.from("factura_conceptos").select("id, descripcion, cantidad, unidad, valor_unitario, importe").eq("factura_id", id).order("id").returns<Concepto[]>(),
    supabase.from("factura_ordenes").select("orden_id").eq("factura_id", id).returns<{ orden_id: string }[]>(),
    supabase.from("ordenes_compra").select("id, folio, estado, sucursales(nombre)").eq("proveedor_id", f.proveedor_id).in("estado", ["confirmada", "cerrada"])
      .order("confirmada_en", { ascending: false }).limit(50).returns<Orden[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    f.tipo === "ingreso"
      ? supabase.from("facturas").select("id, serie, folio, uuid, tipo, total, estado").eq("uuid_relacionado", f.uuid).returns<Relacionada[]>()
      : supabase.from("facturas").select("id, serie, folio, uuid, tipo, total, estado").eq("uuid", f.uuid_relacionado ?? "").returns<Relacionada[]>(),
  ]);
  const ligadas = (ligas ?? []).map((l) => l.orden_id);
  const { data: renglones } = ligadas.length
    ? await supabase.from("renglones_recibido").select("orden_id, descripcion, cantidad, precio, tasa_iva, recibido").in("orden_id", ligadas).returns<Renglon[]>()
    : { data: [] as Renglon[] };
  // Todas las facturas vigentes ligadas a esas órdenes (para el cotejo del grupo).
  const { data: delGrupo } = ligadas.length
    ? await supabase.from("factura_ordenes").select("factura_id, facturas_saldo!inner(saldo, estado, tipo)").in("orden_id", ligadas)
      .returns<{ factura_id: string; facturas_saldo: { saldo: number; estado: string; tipo: string } }[]>()
    : { data: [] as { factura_id: string; facturas_saldo: { saldo: number; estado: string; tipo: string } }[] };
  const facturado = [...new Map((delGrupo ?? []).filter((x) => x.facturas_saldo.estado !== "cancelada" && x.facturas_saldo.tipo === "ingreso")
    .map((x) => [x.factura_id, Number(x.facturas_saldo.saldo)])).values()].reduce((s, v) => s + v, 0);
  const rs = renglones ?? [];
  const cotejo = cotejar({
    tieneOrdenes: ligadas.length > 0, ordenado: totalesOrden(rs).total, recibido: valorRecibido(rs),
    recepcionCompleta: rs.length > 0 && avanceOrden(rs) === "completa", facturado,
  });

  const firmar = async (ruta: string | null) => (ruta ? (await supabase.storage.from("facturas").createSignedUrl(ruta, 3600)).data?.signedUrl ?? null : null);
  const [urlXml, urlPdf] = await Promise.all([firmar(f.xml_ruta), firmar(f.pdf_ruta)]);
  const edita = puedeEditarCompras(perfil.rol) && f.estado !== "cancelada";
  const regimenDistinto = f.proveedores && f.regimen_emisor && f.regimen_emisor !== f.proveedores.regimen_fiscal;
  const hoy = hoyMX();

  return (
    <>
      <div className="encabezado">
        <h1>{f.tipo === "egreso" ? "Nota de crédito" : "Factura"} {f.serie ?? ""}{f.folio ?? ""} · {f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social}</h1>
        <p>{NOMBRE_ESTADO_FACTURA[f.estado]}{f.motivo_cancelacion ? ` · ${f.motivo_cancelacion}` : ""} · UUID {f.uuid}</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Emitida</dt><dd>{fechaTexto(f.fecha_emision)} · {f.metodo_pago ?? "sin método"}{f.forma_pago ? ` · forma ${f.forma_pago}` : ""}</dd>
          <dt>Subtotal</dt><dd>{pesos(f.subtotal)}{Number(f.descuento) ? ` · descuento ${pesos(f.descuento)}` : ""}</dd>
          <dt>IVA</dt><dd>{pesos(f.iva)}{Number(f.retenciones) ? ` · retenciones ${pesos(f.retenciones)}` : ""}</dd>
          <dt>Total</dt><dd><strong>{pesos(f.total)}</strong>{f.tipo === "ingreso" ? ` · saldo ${pesos(f.saldo)}` : ""}</dd>
          {f.tipo === "ingreso" && <><dt>Vence</dt><dd>{fechaTexto(f.vence_el)}{vencida(f, hoy) ? " · vencida" : ""}</dd></>}
          <dt>Emisor</dt><dd>{f.nombre_emisor} · {f.rfc_emisor} · {f.regimen_emisor} {nombreRegimen(f.regimen_emisor)}</dd>
          {regimenDistinto && <><dt>Aviso</dt><dd>El régimen del XML ({f.regimen_emisor}) no es el de la cartera ({f.proveedores!.regimen_fiscal}).</dd></>}
          {f.revisada && <><dt>Revisada</dt><dd>{f.revision_nota}</dd></>}
        </dl>
        <div className="acciones">
          {urlXml && <a className="boton boton-secundario" href={urlXml} target="_blank" rel="noreferrer">Ver XML</a>}
          {urlPdf && <a className="boton boton-secundario" href={urlPdf} target="_blank" rel="noreferrer">Ver PDF</a>}
        </div>
      </section>

      {f.tipo === "ingreso" && (
        <section className="seccion" aria-labelledby="t-cotejo">
          <h2 id="t-cotejo">Cotejo</h2>
          <p className={NOMBRE_COTEJO[cotejo].alerta ? "aviso aviso-error" : "aviso aviso-ok"}>{NOMBRE_COTEJO[cotejo].texto}</p>
          {ligadas.length > 0 && (
            <dl className="tarjeta-datos">
              <dt>Ordenado</dt><dd>{pesos(totalesOrden(rs).total)}</dd>
              <dt>Recibido</dt><dd>{pesos(valorRecibido(rs))}</dd>
              <dt>Facturado</dt><dd>{pesos(facturado)}</dd>
            </dl>
          )}
          {edita && (
            <form action={ligarOrdenes} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <fieldset className="campo">
                <legend>Órdenes de compra de este proveedor</legend>
                {!(candidatas ?? []).length && <p className="vacio">Este proveedor no tiene órdenes confirmadas.</p>}
                {(candidatas ?? []).map((o) => (
                  <label key={o.id}><input type="checkbox" name="ordenes" value={o.id} defaultChecked={ligadas.includes(o.id)} /> {o.folio} · {o.sucursales?.nombre ?? "Oficina"}{o.estado === "cerrada" ? " · cerrada" : ""}</label>
                ))}
              </fieldset>
              <BotonEnviar>Guardar órdenes</BotonEnviar>
            </form>
          )}
          {!ligadas.length && edita && (
            <form action={asignarDestino} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo">
                <label htmlFor="destino">Sin orden: ¿a dónde se carga?</label>
                <select id="destino" name="sucursal_id" defaultValue={f.sucursal_id ?? "oficina"}>
                  {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  <option value="oficina">Oficina</option>
                </select>
              </div>
              <BotonEnviar className="boton boton-secundario">Guardar destino</BotonEnviar>
            </form>
          )}
        </section>
      )}

      {(relacionadas ?? []).length > 0 && (
        <section className="seccion">
          <h2>{f.tipo === "ingreso" ? "Notas de crédito" : "Factura que corrige"}</h2>
          <dl className="tarjeta-datos">
            {(relacionadas ?? []).map((n) => (
              <Fragment key={n.id}><dt><Link href={`/compras/facturas/${n.id}`}>{n.serie ?? ""}{n.folio ?? n.uuid.slice(0, 8)}</Link></dt><dd>{pesos(n.total)} · {NOMBRE_ESTADO_FACTURA[n.estado]}</dd></Fragment>
            ))}
          </dl>
        </section>
      )}
      {f.tipo === "egreso" && !(relacionadas ?? []).length && f.uuid_relacionado && (
        <p className="aviso aviso-error">La factura que corrige ({f.uuid_relacionado}) aún no se sube. Cuando se suba, su saldo ya restará esta nota.</p>
      )}

      <Plegable id="t-conceptos" titulo="Conceptos del XML" resumen={`${conceptos?.length ?? 0}`}>
        <dl className="tarjeta-datos">
          {(conceptos ?? []).map((c) => <Fragment key={c.id}><dt>{c.cantidad} {c.unidad}</dt><dd>{c.descripcion} · {pesos(c.valor_unitario)} · {pesos(c.importe)}</dd></Fragment>)}
        </dl>
        {rs.length > 0 && (
          <>
            <h3>Renglones de las órdenes</h3>
            <dl className="tarjeta-datos">
              {rs.map((r, i) => <Fragment key={i}><dt>{r.cantidad} pedidos · {r.recibido} recibidos</dt><dd>{r.descripcion} · {pesos(r.precio)}</dd></Fragment>)}
            </dl>
          </>
        )}
      </Plegable>

      {edita && (
        <section className="seccion">
          <h2>Acciones</h2>
          {!f.revisada && NOMBRE_COTEJO[cotejo].alerta && f.tipo === "ingreso" && (
            <form action={marcarRevisada} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="nota">Revisada: ¿qué verificaste?</label><input id="nota" name="nota" required placeholder="Ej. el proveedor aplicó un aumento autorizado" /></div>
              <BotonEnviar className="boton boton-secundario">Marcar como revisada</BotonEnviar>
            </form>
          )}
          {f.tipo === "ingreso" && (f.estado === "por_pagar" || f.estado === "parcial") && (
            <form action={cambiarVencimientoFactura} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="vence">Vencimiento</label><input id="vence" name="vence_el" type="date" defaultValue={f.vence_el} required /></div>
              <BotonEnviar className="boton boton-secundario">Cambiar vencimiento</BotonEnviar>
            </form>
          )}
          <details>
            <summary>Cancelar</summary>
            <form action={cancelarFacturaAccion} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="motivo">Motivo</label><input id="motivo" name="motivo" required placeholder="Ej. el proveedor la canceló en el SAT" /></div>
              <BotonEnviar className="boton boton-alerta" confirmar="¿Cancelar esta factura? Se quitan sus ligas a órdenes.">Cancelar factura</BotonEnviar>
            </form>
          </details>
        </section>
      )}
    </>
  );
}
