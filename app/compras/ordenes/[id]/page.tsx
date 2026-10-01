import { Fragment } from "react";
import { avanceFacturacion } from "@/lib/compras/facturas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { fechaTexto, pesos } from "@/lib/formato";
import {
  accionesDe, avanceOrden, avanceRenglon, NOMBRE_AVANCE, NOMBRE_ESTADO_ORDEN, precioDistinto, recibidoDeMas, totalesOrden, type EstadoOrden,
} from "@/lib/compras/ordenes";
import { NOMBRE_TASA_IVA, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import {
  agregarRenglon, anularRecepcionApp, cancelarOrden, cerrarOrden, confirmarOrden, copiarOrden, editarOrden, editarRenglon, enviarOrden, quitarRenglon,
} from "../acciones";
import { CamposRenglon } from "../CamposRenglon";

type Orden = {
  id: string; folio: string; estado: EstadoOrden; grupo_id: string; proveedor_id: string; sucursal_id: string | null; notas: string | null;
  motivo: string | null; creado_en: string; confirmada_en: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; sucursales: { nombre: string } | null;
};
type Renglon = { id: string; articulo_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number; articulos: { unidad: string; tipo: string } | null };
type RecDodo = { id: string; orden_renglon_id: string; fecha: string; cantidad: number; unidad: string; precio: number };
type RecApp = { id: string; orden_renglon_id: string; fecha: string; cantidad: number; anulada_en: string | null; motivo_anulacion: string | null; foto_path: string | null };
type Evento = { id: number; evento: string; nota: string | null; en: string; perfiles: { nombre: string } | null };

const CLAVE_EVENTO: Record<string, string> = {
  creada: "Creada", editada: "Editada", enviada: "Enviada al proveedor", confirmada: "Confirmada como orden de compra", copiada: "Creada como alternativa",
  cancelada: "Cancelada", cerrada: "Cerrada", recibido: "Recibido en sucursal", "recepción anulada": "Recepción anulada",
};

const NOMBRE_AVANCE_FACTURA = { nada: "Sin facturar", parcial: "Facturada en parte", completa: "Facturada completa" } as const;

export default async function DetalleOrden({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: o, error: errorOrden } = await supabase.from("ordenes_compra")
    .select("id, folio, estado, grupo_id, proveedor_id, sucursal_id, notas, motivo, creado_en, confirmada_en, proveedores(razon_social, nombre_comercial), sucursales(nombre)")
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
      supabase.from("recepciones_app").select("id, orden_renglon_id, fecha, cantidad, anulada_en, motivo_anulacion, foto_path").in("orden_renglon_id", ids).order("recibido_en").returns<RecApp[]>(),
    ])
    : [{ data: [] as RecDodo[] }, { data: [] as RecApp[] }];

  // Fotos de recepción: enlaces firmados por una hora (el bucket es privado).
  const rutasFoto = (recApp ?? []).flatMap((x) => (x.foto_path ? [x.foto_path] : []));
  const { data: firmadas } = rutasFoto.length ? await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(rutasFoto, 3600) : { data: [] };
  const urlFoto = new Map((firmadas ?? []).flatMap((f) => (f.path && f.signedUrl ? [[f.path, f.signedUrl] as const] : [])));

  const edita = puedeEditarCompras(perfil.rol);
  const hayRecepciones = rs.some((r) => Number(r.recibido) > 0);
  const acciones = edita ? accionesDe(o.estado, hayRecepciones) : [];
  const puedeEditar = acciones.includes("editar");
  const t = totalesOrden(rs);
  const { data: facturasLigadas } = await supabase.from("factura_ordenes")
    .select("facturas_saldo!inner(id, serie, folio, uuid, neto, estado, tipo)").eq("orden_id", o.id)
    .returns<{ facturas_saldo: { id: string; serie: string | null; folio: string | null; uuid: string; neto: number; estado: string; tipo: string } }[]>();
  const facturas = (facturasLigadas ?? []).map((x) => x.facturas_saldo).filter((x) => x.estado !== "cancelada" && x.tipo === "ingreso");
  const facturado = facturas.reduce((s, x) => s + Number(x.neto), 0);

  // Para editar y copiar: artículos activos, proveedores activos, sucursales y últimos precios de este proveedor.
  const [articulos, proveedores, sucursales, precios] = await Promise.all([
    supabase.from("articulos").select("id, nombre, unidad").eq("activo", true).order("nombre").returns<{ id: string; nombre: string; unidad: string }[]>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("precios_proveedor").select("articulo_id, precio").eq("proveedor_id", o.proveedor_id).returns<{ articulo_id: string; precio: number }[]>(),
  ]);
  const preciosPorArticulo = Object.fromEntries((precios.data ?? []).map((p) => [p.articulo_id, Number(p.precio)]));

  return (
    <>
      <div className="encabezado">
        <h1>{o.folio} · {o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</h1>
        <p>{NOMBRE_ESTADO_ORDEN[o.estado]} · para {o.sucursales?.nombre ?? "Oficina"}{o.motivo ? ` · ${o.motivo}` : ""}</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
          <dt>IVA</dt><dd>{pesos(t.iva)}</dd>
          <dt>Total</dt><dd><strong>{pesos(t.total)}</strong></dd>
          {o.estado === "confirmada" && <><dt>Recepción</dt><dd>{NOMBRE_AVANCE[avanceOrden(rs)]}</dd></>}
          {(o.estado === "confirmada" || o.estado === "cerrada") && (
            <><dt>Facturación</dt><dd>{NOMBRE_AVANCE_FACTURA[avanceFacturacion(t.total, facturado)]} · {pesos(facturado)} de {pesos(t.total)}
              {facturas.map((x) => <Fragment key={x.id}> · <Link href={`/compras/facturas/${x.id}`}>{x.serie ?? ""}{x.folio ?? x.uuid.slice(0, 8)}</Link></Fragment>)}</dd></>
          )}
          {o.estado === "confirmada" && avanceOrden(rs) === "completa" && avanceFacturacion(t.total, facturado) === "completa" && (
            <><dt>Lista</dt><dd>Recibida y facturada: ya se puede cerrar.</dd></>
          )}
          {o.notas && <><dt>Notas</dt><dd>{o.notas}</dd></>}
        </dl>
        <div className="acciones">
          <Link className="boton boton-secundario" href={`/orden-compra/${o.id}`} target="_blank">Ver PDF</Link>
          {(grupo?.length ?? 0) > 1 && <Link className="boton boton-secundario" href={`/compras/ordenes/${o.id}/comparar`}>Comparar {grupo!.length} cotizaciones</Link>}
        </div>
      </section>

      <section className="seccion" aria-labelledby="t-renglones">
        <h2 id="t-renglones">Renglones</h2>
        {!rs.length && <p className="vacio">Agrega el primer artículo.</p>}
        <div className="tarjetas">
          {rs.map((r) => {
            const avance = avanceRenglon(Number(r.cantidad), Number(r.recibido));
            const deMas = recibidoDeMas(Number(r.cantidad), Number(r.recibido));
            const dodo = (recDodo ?? []).filter((x) => x.orden_renglon_id === r.id);
            const precioOtro = dodo.some((x) => precioDistinto(Number(r.precio), Number(x.precio)));
            const app = (recApp ?? []).filter((x) => x.orden_renglon_id === r.id);
            return (
              <article key={r.id} className="tarjeta" data-alerta={deMas || precioOtro ? "si" : undefined}>
                <div className="tarjeta-encabezado">
                  <div>
                    <h3>{r.descripcion}</h3>
                    <p className="tarjeta-estado">{r.cantidad} {r.articulos?.unidad} · {pesos(r.precio)} c/u · {NOMBRE_TASA_IVA[r.tasa_iva]}</p>
                  </div>
                </div>
                {o.estado !== "borrador" && o.estado !== "enviada" && (
                  <dl className="tarjeta-datos">
                    <dt>Recibido</dt><dd>{r.recibido} {r.articulos?.unidad} · {NOMBRE_AVANCE[avance]}{deMas ? " · más de lo pedido" : ""}</dd>
                    {dodo.map((x) => <Fragment key={x.id}><dt>Dodo IS</dt><dd>{fechaTexto(x.fecha)} · {x.cantidad} {x.unidad} · {pesos(x.precio)}{precioDistinto(Number(r.precio), Number(x.precio)) ? ` · precio distinto a la orden (${pesos(r.precio)})` : ""}</dd></Fragment>)}
                    {app.map((x) => (
                      <Fragment key={x.id}><dt>En sucursal</dt><dd>{fechaTexto(x.fecha)} · {x.cantidad}{x.anulada_en ? ` · anulada: ${x.motivo_anulacion}` : ""}{x.foto_path && urlFoto.get(x.foto_path) ? <> · <a href={urlFoto.get(x.foto_path)} target="_blank" rel="noreferrer">ver foto</a></> : null}</dd></Fragment>
                    ))}
                  </dl>
                )}
                {edita && app.some((x) => !x.anulada_en) && (
                  <details>
                    <summary>Anular una recepción de la sucursal</summary>
                    {app.filter((x) => !x.anulada_en).map((x) => (
                      <form key={x.id} action={anularRecepcionApp} className="formulario">
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="recepcion_id" value={x.id} />
                        <div className="campo"><label htmlFor={`m-${x.id}`}>Motivo ({fechaTexto(x.fecha)} · {x.cantidad})</label><input id={`m-${x.id}`} name="motivo" required /></div>
                        <BotonEnviar className="boton boton-alerta">Anular</BotonEnviar>
                      </form>
                    ))}
                  </details>
                )}
                {puedeEditar && (
                  <details>
                    <summary>Editar</summary>
                    <form action={editarRenglon} className="formulario">
                      <input type="hidden" name="orden_id" value={o.id} />
                      <input type="hidden" name="renglon_id" value={r.id} />
                      <div className="rejilla">
                        <div className="campo"><label htmlFor={`c-${r.id}`}>Cantidad</label><input id={`c-${r.id}`} name="cantidad" inputMode="decimal" defaultValue={r.cantidad} required /></div>
                        <div className="campo"><label htmlFor={`p-${r.id}`}>Precio sin IVA</label><input id={`p-${r.id}`} name="precio" inputMode="decimal" defaultValue={r.precio} /></div>
                      </div>
                      <BotonEnviar>Guardar</BotonEnviar>
                    </form>
                    <form action={quitarRenglon} className="acciones">
                      <input type="hidden" name="orden_id" value={o.id} />
                      <input type="hidden" name="renglon_id" value={r.id} />
                      <BotonEnviar className="boton boton-secundario" confirmar="¿Quitar este renglón de la cotización?">Quitar renglón</BotonEnviar>
                    </form>
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {puedeEditar && (
          <form action={agregarRenglon} className="formulario">
            <input type="hidden" name="orden_id" value={o.id} />
            <CamposRenglon articulos={articulos.data ?? []} precios={preciosPorArticulo} />
            <BotonEnviar>Agregar renglón</BotonEnviar>
          </form>
        )}
      </section>

      {acciones.length > 0 && (
        <section className="seccion" aria-labelledby="t-acciones">
          <h2 id="t-acciones">Acciones</h2>
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
            <form action={copiarOrden} className="formulario">
              <input type="hidden" name="id" value={o.id} />
              <div className="campo">
                <label htmlFor="otro">Pedir lo mismo a otro proveedor</label>
                <select id="otro" name="proveedor_id" required defaultValue="">
                  <option value="" disabled>Elige…</option>
                  {(proveedores.data ?? []).filter((p) => p.id !== o.proveedor_id).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
                </select>
              </div>
              <BotonEnviar className="boton boton-secundario">Crear cotización alternativa</BotonEnviar>
            </form>
          )}
          {puedeEditar && (
            <details>
              <summary>Cambiar proveedor, destino o notas</summary>
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
        </section>
      )}

      <Plegable id="t-historial" titulo="Historial" resumen={`${historial?.length ?? 0} eventos`}>
        <dl className="tarjeta-datos">
          {(historial ?? []).map((h) => (
            <Fragment key={h.id}><dt>{fechaTexto(h.en.slice(0, 10))}</dt><dd>{CLAVE_EVENTO[h.evento] ?? h.evento}{h.nota ? ` · ${h.nota}` : ""}{h.perfiles ? ` · ${h.perfiles.nombre}` : ""}</dd></Fragment>
          ))}
        </dl>
      </Plegable>
    </>
  );
}
