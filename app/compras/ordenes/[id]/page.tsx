import { HistorialCompra } from "@/components/HistorialCompra";
import {AdjuntarDocumento,AdjuntosCompra} from "../../adjuntos/Componentes";
import { agregarNotaOrden } from "../acciones";
import { FichaPestanas } from "@/components/FichaPestanas";
import { randomUUID } from "node:crypto";
import { Fragment } from "react";
import { avanceFacturacion, nombreFactura } from "@/lib/compras/facturas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { fechaTexto, pesos, fechaMX, hora, hoyCalendarioMX } from "@/lib/formato";
import { estadoEntrega, NOMBRE_ESTADO_ENTREGA } from "@/lib/compras/entregas";
import {
  accionesDe, avanceOrden, avanceRenglon, NOMBRE_AVANCE, NOMBRE_ESTADO_ORDEN, precioDistinto, recibidoDeMas, totalesOrden, type EstadoOrden,
} from "@/lib/compras/ordenes";
import { NOMBRE_TASA_IVA, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import {
  agregarRenglon, anularRecepcionApp, cancelarOrden, cerrarOrden, confirmarOrden, copiarOrden, editarOrden, editarRenglon, enviarOrden, quitarRenglon, cambiarEntregaEsperada, facturarOrden, registrarRecepcionOrden,
} from "../acciones";
import { CamposRenglon } from "../CamposRenglon";

type Orden = {
  id: string; folio: string; estado: EstadoOrden; grupo_id: string; proveedor_id: string; sucursal_id: string | null; notas: string | null;
  motivo: string | null; creado_en: string; confirmada_en: string | null; entrega_esperada: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; sucursales: { nombre: string } | null;
};
type Renglon = { id: string; articulo_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number; articulos: { unidad: string; tipo: string } | null };
type RecDodo = { id: string; orden_renglon_id: string; fecha: string; cantidad: number; unidad: string; precio: number };
type RecApp = { id: string; orden_renglon_id: string; fecha: string; cantidad: number; anulada_en: string | null; motivo_anulacion: string | null; foto_path: string | null; nota: string | null; conciliada_en: string | null };
type Evento = { id: number; evento: string; nota: string | null; en: string; perfiles: { nombre: string } | null };

const CLAVE_EVENTO: Record<string, string> = {
  creada: "Creada", editada: "Editada", enviada: "Enviada al proveedor", confirmada: "Confirmada como orden de compra", copiada: "Creada como alternativa",
  cancelada: "Cancelada", cerrada: "Cerrada", recibido: "Recibido en sucursal", "recepción anulada": "Recepción anulada",
  facturada: "Factura ligada", reabierta: "Reabierta", entrega: "Entrega esperada cambiada a",
};

const NOMBRE_AVANCE_FACTURA = { nada: "Sin facturar", parcial: "Facturada en parte", completa: "Facturada completa" } as const;

export default async function DetalleOrden({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string;recibir?:string }> }) {
  const [{ id }, { ok, error,recibir }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: o, error: errorOrden } = await supabase.from("ordenes_compra")
    .select("id, folio, estado, grupo_id, proveedor_id, sucursal_id, notas, motivo, creado_en, confirmada_en, entrega_esperada, proveedores(razon_social, nombre_comercial), sucursales(nombre)")
    .eq("id", id).maybeSingle<Orden>();
  if (errorOrden) throw new Error(errorOrden.message);
  if (!o) notFound();

  const [{ data: renglones }, { data: historial }, { data: grupo }] = await Promise.all([
    supabase.from("renglones_recibido").select("id, articulo_id, descripcion, cantidad, precio, tasa_iva, recibido, articulos(unidad, tipo)")
      .eq("orden_id", id).order("creado_en").order("id").returns<Renglon[]>(),
    supabase.from("orden_historial").select("id, evento, nota, en, perfiles(nombre)").eq("orden_id", id).order("en").returns<Evento[]>(),
    supabase.from("ordenes_compra").select("id").eq("grupo_id", o.grupo_id).returns<{ id: string }[]>(),
  ]);
  const rs = renglones ?? [];
  const ids = rs.map((r) => r.id);
  const [{ data: recDodo }, { data: recApp }] = ids.length
    ? await Promise.all([
      supabase.from("recepciones_dodo").select("id, orden_renglon_id, fecha, cantidad, unidad, precio").in("orden_renglon_id", ids).order("fecha").returns<RecDodo[]>(),
      supabase.from("recepciones_app").select("id, orden_renglon_id, fecha, cantidad, anulada_en, motivo_anulacion, foto_path, nota, conciliada_en").in("orden_renglon_id", ids).order("recibido_en").returns<RecApp[]>(),
    ])
    : [{ data: [] as RecDodo[] }, { data: [] as RecApp[] }];

  // Fotos de recepción: enlaces firmados por una hora (el bucket es privado).
  const rutasFoto = (recApp ?? []).flatMap((x) => (x.foto_path ? [x.foto_path] : []));
  const { data: firmadas } = rutasFoto.length ? await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(rutasFoto, 3600) : { data: [] };
  const urlFoto = new Map((firmadas ?? []).flatMap((f) => (f.path && f.signedUrl ? [[f.path, f.signedUrl] as const] : [])));

  const {data:notas,error:errorNotas}=await supabase.from("compra_notas").select("id,texto,creado_en,perfiles!usuario_id(nombre)").eq("orden_id",id).order("creado_en").returns<{id:string;texto:string;creado_en:string;perfiles:{nombre:string}|null}[]>();
  if(errorNotas)throw Error("No se pudieron consultar las notas de la orden.");
  const edita = puedeEditarCompras(perfil.rol);
  const hayRecepciones = rs.some((r) => Number(r.recibido) > 0);
  const acciones = edita ? accionesDe(o.estado, hayRecepciones) : [];
  // Lo recibido solo tiene sentido en una orden ya confirmada (o cerrada).
  const conRecepcion = o.estado !== "borrador" && o.estado !== "enviada";
  const puedeEditar = acciones.includes("editar");
  const t = totalesOrden(rs);
  const { data: facturasLigadas, error:errorFacturas } = await supabase.from("factura_ordenes")
    .select("facturas_saldo!inner(id, serie, folio, uuid, neto, estado, tipo)").eq("orden_id", o.id)
    .returns<{ facturas_saldo: { id: string; serie: string | null; folio: string | null; uuid: string | null; neto: number; estado: string; tipo: string } }[]>();
  if(errorFacturas)throw Error('No se pudieron consultar las facturas de esta orden.');
  const facturas = (facturasLigadas ?? []).map((x) => x.facturas_saldo).filter((x) => x.estado !== "cancelada" && x.tipo === "ingreso");
  const facturado = facturas.reduce((s, x) => s + Number(x.neto), 0);

  // Para editar y copiar: artículos activos, proveedores activos, sucursales y últimos precios de este proveedor.
  const [articulos, proveedores, sucursales, precios, surtidos] = await Promise.all([
    supabase.from("articulos").select("id, nombre, unidad").eq("activo", true).order("nombre").returns<{ id: string; nombre: string; unidad: string }[]>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("precios_proveedor").select("articulo_id, precio").eq("proveedor_id", o.proveedor_id).returns<{ articulo_id: string; precio: number }[]>(),
    supabase.from("articulo_proveedores").select("articulo_id").eq("proveedor_id", o.proveedor_id).returns<{ articulo_id: string }[]>(),
  ]);
  const preciosPorArticulo = Object.fromEntries((precios.data ?? []).map((p) => [p.articulo_id, Number(p.precio)]));

  return (
    <>
      <div className="encabezado ficha-encabezado">
        <h1>{o.folio} · {o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</h1>
        <p>{NOMBRE_ESTADO_ORDEN[o.estado]} · para {o.sucursales?.nombre ?? "Oficina"}{o.motivo ? ` · ${o.motivo}` : ""}</p>
      </div>
      <div className="ficha-indicadores"><div><small>Estado del documento</small><strong className="ficha-estado" data-estado={o.estado}>{NOMBRE_ESTADO_ORDEN[o.estado]}</strong></div><div><small>Total de la orden</small><strong>{pesos(t.total)}</strong></div><div><small>Facturado</small><strong>{pesos(facturado)}</strong></div><div><small>Recepción</small><strong>{NOMBRE_AVANCE[avanceOrden(rs)]}</strong></div></div>
      <section className="seccion orden-acciones-encabezado" aria-label="Acciones de la orden">
        {edita && o.estado === "confirmada" && (
          <details className="orden-programar-entrega"><summary>Programar entrega</summary><form action={cambiarEntregaEsperada} className="acciones">
            <input type="hidden" name="id" value={o.id} />
            <div className="campo">
              <label htmlFor="entrega_esperada">{o.entrega_esperada ? "Cambiar la entrega esperada" : "Poner la entrega esperada"}</label>
              <input id="entrega_esperada" name="entrega_esperada" type="date" defaultValue={o.entrega_esperada ?? ""} required />
            </div>
            <BotonEnviar className="boton boton-secundario" pendiente="Guardando…">Guardar fecha</BotonEnviar>
          </form></details>
        )}
        <div className="acciones">
          {edita&&<AdjuntarDocumento tipo="orden" id={o.id}/>}
          {edita && o.estado === 'confirmada' && facturas.length===0 && <form action={facturarOrden}><input type="hidden" name="id" value={o.id}/><BotonEnviar pendiente="Creando factura…" confirmar={`Crear una prefactura sin CFDI por ${pesos(t.total)}, copiando el proveedor, la sucursal y los renglones de esta orden. Después podrás registrar el pago. ¿Continuar?`}>Crear factura para pagar</BotonEnviar></form>}
          {edita && facturas.map(f=><Link key={f.id} className="boton" href={`/compras/facturas/${f.id}`}>Ver {nombreFactura(f)} y pagos</Link>)}
          {edita && o.estado === "confirmada" && <details id="recepcion-orden" open={recibir==="1"} className="orden-accion-desplegable"><summary className="boton boton-secundario">Registrar recepción</summary><form action={registrarRecepcionOrden} className="formulario orden-accion-formulario">
 <input type="hidden" name="id" value={o.id}/><input type="hidden" name="lote" value={randomUUID()}/>
 <label className="campo">Fecha real de recepción<input type="date" name="fecha_recepcion" required max={hoyCalendarioMX()} defaultValue={hoyCalendarioMX()}/></label>
 <label className="campo">Motivo / nota de recepción<textarea name="motivo" required maxLength={1000} placeholder="Por ejemplo: entrega del 7 de octubre capturada hoy"/></label>
 <p className="saldo-nota">No necesitas haber pagado la factura. Puedes registrar días anteriores. Esto confirma la recepción en DODO MX; no registra entradas en Dodo IS. Deja vacíos los artículos que no llegaron.</p>
 {rs.map(r=><label className="campo" key={r.id}>{r.descripcion} · pendiente {Math.max(0,Number(r.cantidad)-Number(r.recibido))} {r.articulos?.unidad}<input type="hidden" name="renglon" value={r.id}/><input name={`cantidad_${r.id}`} type="number" min="0" step="0.001" inputMode="decimal" placeholder="Cantidad recibida"/></label>)}
 <BotonEnviar pendiente="Registrando…">Guardar recepción</BotonEnviar>
 </form></details>}
          <Link className="boton boton-secundario" href={`/orden-compra/${o.id}`} target="_blank">Ver PDF</Link>
          {(grupo?.length ?? 0) > 1 && <Link className="boton boton-secundario" href={`/compras/ordenes/${o.id}/comparar`}>Comparar {grupo!.length} cotizaciones</Link>}
        </div>
      {acciones.length > 0 && (
        <div className="orden-acciones-secundarias" aria-labelledby="t-acciones">
          <h2 id="t-acciones" className="solo-lector">Más acciones</h2>
          <div className="acciones">
            {acciones.includes("enviar") && (
              <form action={enviarOrden}><input type="hidden" name="id" value={o.id} /><BotonEnviar className="boton boton-secundario">Marcar como enviada</BotonEnviar></form>
            )}
            {acciones.includes("confirmar") && (
              <form action={confirmarOrden}>
                <input type="hidden" name="id" value={o.id} />
                <BotonEnviar confirmar="¿Confirmar como orden de compra? Los renglones ya no cambian y se cancelan las otras cotizaciones del grupo.">Confirmar orden de compra</BotonEnviar>
              </form>
            )}
          </div>
          {acciones.includes("copiar") && (
            <details><summary>Otra cotización</summary><form action={copiarOrden} className="formulario">
              <input type="hidden" name="id" value={o.id} />
              <div className="campo">
                <label htmlFor="otro">Pedir lo mismo a otro proveedor</label>
                <select id="otro" name="proveedor_id" required defaultValue="">
                  <option value="" disabled>Elige…</option>
                  {(proveedores.data ?? []).filter((p) => p.id !== o.proveedor_id).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
                </select>
              </div>
              <BotonEnviar className="boton boton-secundario">Crear cotización alternativa</BotonEnviar>
            </form></details>
          )}
          {puedeEditar && (
            <details>
              <summary>Editar datos</summary>
              <form action={editarOrden} className="formulario">
                <input type="hidden" name="id" value={o.id} />
                <div className="rejilla">
                  <div className="campo">
                    <label htmlFor="e-prov">Proveedor</label>
                    <select id="e-prov" name="proveedor_id" defaultValue={o.proveedor_id}>
                      {(proveedores.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor="e-suc">Para</label>
                    <select id="e-suc" name="sucursal_id" defaultValue={o.sucursal_id ?? "oficina"}>
                      {(sucursales.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      <option value="oficina">Oficina</option>
                    </select>
                  </div>
                </div>
                <div className="campo"><label htmlFor="e-notas">Notas</label><textarea id="e-notas" name="notas" rows={2} defaultValue={o.notas ?? ""} /></div>
                <BotonEnviar>Guardar</BotonEnviar>
              </form>
            </details>
          )}
          {(["cancelar", "cerrar"] as const).filter((a) => acciones.includes(a)).map((a) => (
            <details key={a}>
              <summary>{a === "cancelar" ? "Cancelar" : "Cerrar la orden"}</summary>
              <form action={a === "cancelar" ? cancelarOrden : cerrarOrden} className="formulario">
                <input type="hidden" name="id" value={o.id} />
                <div className="campo">
                  <label htmlFor={`motivo-${a}`}>Motivo</label>
                  <input id={`motivo-${a}`} name="motivo" required placeholder={a === "cerrar" ? "Ej. lo que falta ya no llegará" : "Ej. el proveedor no surtió"} />
                </div>
                <BotonEnviar className="boton boton-alerta">{a === "cancelar" ? "Cancelar" : "Cerrar"}</BotonEnviar>
              </form>
            </details>
          ))}
        </div>
      )}

      </section>
      <Aviso ok={ok} error={error} />
      <div className="detalle-con-lado compra-ficha-lado"><div className="detalle-principal">
      <FichaPestanas pestanas={[
        {id:"renglones", titulo:`Artículos (${rs.length})`, contenido:<>      <section className="seccion" aria-labelledby="t-renglones">
        <h2 id="t-renglones">Renglones</h2>
        {!rs.length && <p className="vacio">Agrega el primer artículo.</p>}
        <div className="tabla-contenedor">
          <table className="tabla tabla-tarjetas tabla-renglones">
            <thead>
              <tr>
                <th>#</th><th>Artículo</th><th className="monto">Cantidad</th><th className="monto">Precio</th><th>IVA</th><th className="monto">Importe</th>
                {conRecepcion && <th>Recibido</th>}
              </tr>
            </thead>
            <tbody>
              {rs.map((r, i) => {
                const avance = avanceRenglon(Number(r.cantidad), Number(r.recibido));
                const deMas = recibidoDeMas(Number(r.cantidad), Number(r.recibido));
                const dodo = (recDodo ?? []).filter((x) => x.orden_renglon_id === r.id);
                const precioOtro = dodo.some((x) => precioDistinto(Number(r.precio), Number(x.precio)));
                const app = (recApp ?? []).filter((x) => x.orden_renglon_id === r.id);
                const alerta = deMas || precioOtro;
                return (
                  <tr key={r.id} className={alerta ? "fila-alerta" : undefined}>
                    <td data-label="#">{i + 1}</td>
                    <td data-label="Artículo">
                      <span className="celda-pila">
                        <strong>{r.descripcion}</strong>
                        {precioOtro && <small className="nota-estado">Dodo IS trae otro precio</small>}
                        {conRecepcion && (dodo.length > 0 || app.length > 0) && (
                          <details>
                            <summary className="saldo-nota">Recepciones ({dodo.length + app.length})</summary>
                            <ul className="lista-simple">
                              {dodo.map((x) => <li key={x.id}>Dodo IS · {fechaTexto(x.fecha)} · {x.cantidad} {x.unidad} · {pesos(x.precio)}{precioDistinto(Number(r.precio), Number(x.precio)) ? ` (orden: ${pesos(r.precio)})` : ""}</li>)}
                              {app.map((x) => (
                                <li key={x.id}>DODO MX · {fechaTexto(x.fecha)} · {x.cantidad}{x.conciliada_en ? " · conciliada con Dodo IS" : ""}{x.nota ? ` · ${x.nota}` : ""}{x.anulada_en ? ` · anulada: ${x.motivo_anulacion}` : ""}
                                  {x.foto_path && urlFoto.get(x.foto_path) ? <> · <a href={urlFoto.get(x.foto_path)} target="_blank" rel="noreferrer">ver foto</a></> : null}</li>
                              ))}
                            </ul>
                            {edita && app.filter((x) => !x.anulada_en).map((x) => (
                              <form key={x.id} action={anularRecepcionApp} className="form-motivo">
                                <input type="hidden" name="id" value={o.id} />
                                <input type="hidden" name="recepcion_id" value={x.id} />
                                <label className="solo-lector" htmlFor={`m-${x.id}`}>Motivo para anular ({fechaTexto(x.fecha)} · {x.cantidad})</label>
                                <input id={`m-${x.id}`} name="motivo" required placeholder={`Motivo para anular la del ${fechaTexto(x.fecha)}`} />
                                <BotonEnviar className="boton boton-alerta" pendiente="…">Anular</BotonEnviar>
                              </form>
                            ))}
                          </details>
                        )}
                        {puedeEditar && (
                          <details>
                            <summary className="saldo-nota">Editar</summary>
                            <form action={editarRenglon} className="form-motivo">
                              <input type="hidden" name="orden_id" value={o.id} />
                              <input type="hidden" name="renglon_id" value={r.id} />
                              <label className="solo-lector" htmlFor={`c-${r.id}`}>Cantidad</label>
                              <input id={`c-${r.id}`} name="cantidad" inputMode="decimal" defaultValue={r.cantidad} required placeholder="Cantidad" />
                              <label className="solo-lector" htmlFor={`p-${r.id}`}>Precio sin IVA</label>
                              <input id={`p-${r.id}`} name="precio" inputMode="decimal" defaultValue={r.precio} placeholder="Precio sin IVA" />
                              <label htmlFor={`iva-${r.id}`}>IVA del renglón</label>
                              <select id={`iva-${r.id}`} name="tasa_iva" defaultValue={r.tasa_iva} required><option value="16">IVA 16 %</option><option value="0">IVA 0 %</option><option value="exento">Exento</option></select>
                              <BotonEnviar pendiente="…">Guardar</BotonEnviar>
                            </form>
                            <form action={quitarRenglon} className="acciones">
                              <input type="hidden" name="orden_id" value={o.id} />
                              <input type="hidden" name="renglon_id" value={r.id} />
                              <BotonEnviar className="boton boton-secundario" confirmar="¿Quitar este renglón de la cotización?">Quitar renglón</BotonEnviar>
                            </form>
                          </details>
                        )}
                      </span>
                    </td>
                    <td data-label="Cantidad" className="monto">{r.cantidad} {r.articulos?.unidad}</td>
                    <td data-label="Precio" className="monto">{Number(r.precio) > 0 ? pesos(r.precio) : "Por cotizar"}</td>
                    <td data-label="IVA" style={{ whiteSpace: "nowrap" }}>{r.tasa_iva === "exento" ? "Exento" : `${r.tasa_iva} %`}</td>
                    <td data-label="Importe" className="monto">{pesos(Number(r.cantidad) * Number(r.precio))}</td>
                    {conRecepcion && (
                      <td data-label="Recibido" className={deMas ? "celda-alerta" : undefined}>
                        {r.recibido} {r.articulos?.unidad} · {NOMBRE_AVANCE[avance].toLowerCase()}{deMas ? " · de más" : ""}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {rs.length > 0 && (
              <tfoot>
                <tr><td colSpan={5} data-label="">Subtotal</td><td data-label="Subtotal" className="monto">{pesos(t.subtotal)}</td>{conRecepcion && <td data-label="" />}</tr>
                <tr><td colSpan={5} data-label="">IVA</td><td data-label="IVA" className="monto">{pesos(t.iva)}</td>{conRecepcion && <td data-label="" />}</tr>
                <tr className="fila-total"><td colSpan={5} data-label="">Total</td><td data-label="Total" className="monto">{pesos(t.total)}</td>{conRecepcion && <td data-label="" />}</tr>
              </tfoot>
            )}
          </table>
        </div>
        {puedeEditar && (
          <form action={agregarRenglon} className="formulario">
            <input type="hidden" name="orden_id" value={o.id} />
            <CamposRenglon articulos={articulos.data ?? []} precios={preciosPorArticulo} surtidos={(surtidos.data ?? []).map((s) => s.articulo_id)} />
            <BotonEnviar>Agregar renglón</BotonEnviar>
          </form>
        )}
      </section>

</>},
        {id:"seguimiento", titulo:"Recepción y facturación", contenido:<>      <section className="seccion">
        <dl className="tarjeta-datos">
          {o.estado === "confirmada" && <><dt>Recepción</dt><dd>{NOMBRE_AVANCE[avanceOrden(rs)]}</dd></>}
          {o.estado === "confirmada" && (() => {
            const estado = estadoEntrega(o.entrega_esperada, avanceOrden(rs) === "completa", hoyCalendarioMX());
            return (
              <><dt>Entrega esperada</dt>
                <dd className={estado === "atrasada" ? "celda-alerta" : undefined}>
                  {o.entrega_esperada ? fechaTexto(o.entrega_esperada) : "Sin fecha"}
                  {estado === "atrasada" || estado === "hoy" ? ` · ${NOMBRE_ESTADO_ENTREGA[estado].toLowerCase()}` : ""}
                </dd></>
            );
          })()}
          {(o.estado === "confirmada" || o.estado === "cerrada") && (
            <><dt>Facturación</dt><dd>{NOMBRE_AVANCE_FACTURA[avanceFacturacion(t.total, facturado)]} · {pesos(facturado)} de {pesos(t.total)}
              {facturas.map((x) => <Fragment key={x.id}> · <Link href={`/compras/facturas/${x.id}`}>{nombreFactura(x)}</Link></Fragment>)}</dd></>
          )}
          {o.estado === "confirmada" && avanceOrden(rs) === "completa" && avanceFacturacion(t.total, facturado) === "completa" && (
            <><dt>Lista</dt><dd>Recibida y facturada: ya se puede cerrar.</dd></>
          )}
          {o.notas && <><dt>Notas</dt><dd>{o.notas}</dd></>}
        </dl>
      </section>

</>},
        {id:"adjuntos",titulo:"Adjuntos",contenido:<AdjuntosCompra tipo="orden" id={o.id}/>},
      ]} /></div><HistorialCompra id={o.id} edita={edita} accion={agregarNotaOrden} eventos={[
 ...(historial??[]).map(h=>({id:`evento-${h.id}`,en:h.en,titulo:CLAVE_EVENTO[h.evento]??h.evento,nota:h.nota,autor:h.perfiles?.nombre})),
 ...(notas??[]).map(n=>({id:`nota-${n.id}`,en:n.creado_en,titulo:"Nota interna",nota:n.texto,autor:n.perfiles?.nombre})),
 ]}/></div>
    </>
  );
}
