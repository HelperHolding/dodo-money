import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, fechaMX, hoyCalendarioMX, pesos } from "@/lib/formato";
import { estadoDocumentos, NOMBRE_DOCUMENTO, TIPOS_DOCUMENTO, vigentes, type TipoDocumento } from "@/lib/compras/documentos";
import { nombreRegimen } from "@/lib/compras/proveedores";
import { NOMBRE_CATEGORIA_COMPRA, NOMBRE_FORMA_PAGO, NOMBRE_INICIO_CUBRE, type DatosProveedor } from "@/lib/compras/proveedores";
import { esCuentaPl, NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import { puedeEditarCompras } from "@/lib/roles";
import { cambiarActivoProveedor, subirDocumentoProveedor } from "../../acciones";
import { CampoDocumento } from "./CampoDocumento";
import { FormProveedor } from "../../FormProveedor";
import { PortalProveedor } from "./PortalProveedor";
import type { PortalProveedor as DatosPortal } from "@/lib/compras/portal";

type Doc = { id: string; tipo: TipoDocumento; fecha: string; ruta: string; subido_en: string };
type Proveedor = DatosProveedor & { id: string; activo: boolean; motivo_desactivacion: string | null; desactivado_en: string | null };

export default async function FichaProveedor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: p } = await supabase.from("proveedores")
    .select("id, razon_social, nombre_comercial, numero_cliente, dias_entrega, rfc, regimen_fiscal, contacto_nombre, telefono, correo, banco, clabe, cuenta, dias_credito, forma_pago_habitual, categorias, notas, cuenta_pl, sucursal_id, cubre_meses, cubre_inicio, activo, motivo_desactivacion, desactivado_en")
    .eq("id", id).maybeSingle<Proveedor>();
  if (!p) notFound();
  const edita = puedeEditarCompras(perfil.rol);
  const acceso = edita ? await supabase.from("proveedor_portales")
    .select("url, usuario, notas, tiene_password").eq("proveedor_id", id).maybeSingle<DatosPortal>() : null;
  const [{ data: surte }, { data: precios }, { data: sucursales }, { data: documentos }] = await Promise.all([
    supabase.from("articulo_proveedores").select("articulo_id, principal, articulos(nombre, unidad, activo)").eq("proveedor_id", id)
      .returns<{ articulo_id: string; principal: boolean; articulos: { nombre: string; unidad: string; activo: boolean } | null }[]>(),
    supabase.from("precios_proveedor").select("articulo_id, precio, fecha").eq("proveedor_id", id)
      .returns<{ articulo_id: string; precio: number; fecha: string }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("documentos_proveedor").select("id, tipo, fecha, ruta, subido_en").eq("proveedor_id", id)
      .order("fecha", { ascending: false }).order("subido_en", { ascending: false }).returns<Doc[]>(),
  ]);
  const hoy = hoyCalendarioMX();
  const docs = documentos ?? [];
  const vigente = vigentes(docs);
  const estadoDocs = estadoDocumentos(docs);
  // Enlaces temporales (1 hora): el bucket es privado.
  const { data: firmadas } = docs.length
    ? await supabase.storage.from("documentos-proveedores").createSignedUrls(docs.map((d) => d.ruta), 3600)
    : { data: [] };
  const urlDe = new Map((firmadas ?? []).flatMap((f) => (f.path && f.signedUrl ? [[f.path, f.signedUrl] as const] : [])));
  const precioDe = new Map((precios ?? []).map((x) => [x.articulo_id, x]));
  const articulosSurte = (surte ?? []).sort((a, b) => (a.articulos?.nombre ?? "").localeCompare(b.articulos?.nombre ?? "", "es"));

  return (
    <>
      <div className="encabezado">
        <h1>{p.nombre_comercial ?? p.razon_social}</h1>
        <p>{p.rfc}{p.activo ? "" : " · inactivo"}</p>
      </div>
      <Aviso ok={ok} error={error} />
      {edita && <PortalProveedor id={id} portal={acceso?.data ?? null} disponible={!acceso?.error} />}
      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Razón social</dt><dd>{p.razon_social}</dd>
          {p.numero_cliente && <><dt>Nuestro n.º de cliente</dt><dd>{p.numero_cliente}</dd></>}
          <dt>Entrega</dt><dd>{p.dias_entrega === null ? "Sin dato" : p.dias_entrega === 0 ? "El mismo día" : `${p.dias_entrega} ${p.dias_entrega === 1 ? "día" : "días"}`}</dd>
          <dt>Régimen fiscal</dt><dd>{p.regimen_fiscal} · {nombreRegimen(p.regimen_fiscal)}</dd>
          <dt>Contacto</dt><dd>{[p.contacto_nombre, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Banco</dt><dd>{[p.banco, p.clabe && `CLABE ${p.clabe}`, p.cuenta && `Cuenta ${p.cuenta}`].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Crédito</dt><dd>{p.dias_credito ? `${p.dias_credito} días` : "Contado"} · {NOMBRE_FORMA_PAGO[p.forma_pago_habitual]}</dd>
          <dt>Surte</dt><dd>{p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") || "Sin categoría"}</dd>
          <dt>Sucursal por omisión</dt><dd>{(sucursales ?? []).find((s) => s.id === p.sucursal_id)?.nombre ?? "Ninguna (Oficina)"}</dd>
          <dt>Cuenta del P&L</dt><dd>{p.cuenta_pl && esCuentaPl(p.cuenta_pl) ? NOMBRE_CUENTA[p.cuenta_pl] : "Sin cuenta (sus facturas van a Otros)"}</dd>
          <dt>Periodo de cada recibo</dt>
          <dd>{p.cubre_meses === 1 && p.cubre_inicio === "emision" ? "El mes de emisión" : `${p.cubre_meses} ${p.cubre_meses === 1 ? "mes" : "meses"} · ${NOMBRE_INICIO_CUBRE[p.cubre_inicio].toLowerCase()}`}</dd>
          {p.notas && <><dt>Notas</dt><dd>{p.notas}</dd></>}
          {!p.activo && <><dt>Desactivado</dt><dd>{p.motivo_desactivacion}{p.desactivado_en ? ` · ${fechaTexto(fechaMX(p.desactivado_en))}` : ""}</dd></>}
        </dl>
      </section>
      <section className="seccion" aria-labelledby="t-docs">
        <h2 id="t-docs">Documentos</h2>
        {estadoDocs.pendiente && <p className="aviso aviso-error">Faltan: {estadoDocs.faltan.map((t) => NOMBRE_DOCUMENTO[t]).join(", ")}.</p>}
        <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
          <li className="fila fila-encabezado" aria-hidden="true"><span>Documento</span><span>Vigente</span><span>Archivo</span></li>
          {TIPOS_DOCUMENTO.map((t) => {
            const d = vigente[t];
            const anteriores = docs.filter((x) => x.tipo === t && x.id !== d?.id);
            return (
              <li key={t} className="fila" data-alerta={!d ? "si" : undefined}>
                <div className="fila-nombre">
                  <strong>{NOMBRE_DOCUMENTO[t]}</strong>
                </div>
                <div className="fila-datos">
                  <span>{d ? fechaTexto(d.fecha) : "Falta"}</span>
                  <span>{d && urlDe.get(d.ruta) ? <a href={urlDe.get(d.ruta)} target="_blank" rel="noopener noreferrer">Ver documento</a> : "—"}</span>
                </div>
                {anteriores.length > 0 && (
                    <details className="fila-extra">
                      <summary className="saldo-nota">Versiones anteriores ({anteriores.length})</summary>
                      <ul className="lista-simple">
                        {anteriores.map((x) => (
                          <li key={x.id}>{fechaTexto(x.fecha)} · {urlDe.get(x.ruta) ? <a href={urlDe.get(x.ruta)} target="_blank" rel="noopener noreferrer">Ver</a> : "sin enlace"}</li>
                        ))}
                      </ul>
                    </details>
                )}
              </li>
            );
          })}
        </ul>
        {edita && (
          <details>
            <summary>Subir documento</summary>
            <form action={subirDocumentoProveedor} className="formulario">
              <input type="hidden" name="id" value={p.id} />
              <div className="rejilla">
                <div className="campo">
                  <label htmlFor="doc-tipo">Documento</label>
                  <select id="doc-tipo" name="tipo" required defaultValue={estadoDocs.faltan[0] ?? ""}>
                    <option value="" disabled>Elige…</option>
                    {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{NOMBRE_DOCUMENTO[t]}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="doc-fecha">Fecha que trae el documento</label>
                  <input id="doc-fecha" name="fecha" type="date" max={hoy} />
                  <small>En la constancia en PDF del SAT se toma sola.</small>
                </div>
                <CampoDocumento />
              </div>
              <BotonEnviar pendiente="Subiendo…">Guardar documento</BotonEnviar>
            </form>
          </details>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-surte">
        <h2 id="t-surte">Artículos que surte ({articulosSurte.length})</h2>
        {!articulosSurte.length ? <p className="vacio">Todavía no tiene artículos ligados. Se ligan en Artículos o al confirmar una orden.</p> : (
          <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
            <li className="fila fila-encabezado" aria-hidden="true"><span>Artículo</span><span>Último precio</span><span>Principal</span></li>
            {articulosSurte.map((s) => {
              const pr = precioDe.get(s.articulo_id);
              return (
                <li key={s.articulo_id} className="fila" data-alerta={s.articulos?.activo === false ? "si" : undefined}>
                  <div className="fila-nombre">
                    <Link href={`/compras/articulos#a-${s.articulo_id}`}>{s.articulos?.nombre}</Link>
                    <small>{s.articulos?.unidad}{s.articulos?.activo === false ? " · inactivo" : ""}</small>
                  </div>
                  <div className="fila-datos">
                    <span>{pr ? `${pesos(pr.precio)} (${fechaTexto(pr.fecha)})` : "Sin compras"}</span>
                    <span>{s.principal ? "Proveedor principal" : "Alterno"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {edita && (
        <>
          <details className="seccion">
            <summary>Editar datos</summary>
            <FormProveedor id={p.id} inicial={p} sucursales={sucursales ?? []} />
          </details>
          <form action={cambiarActivoProveedor} className="acciones">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="activo" value={p.activo ? "no" : "si"} />
            {p.activo && <div className="campo"><label htmlFor="motivo">Motivo para desactivar</label><input id="motivo" name="motivo" required placeholder="Ej. dejó de surtir, cerró" /></div>}
            <BotonEnviar className={p.activo ? "boton boton-alerta" : "boton boton-secundario"}
              confirmar={p.activo ? "¿Desactivar este proveedor? Ya no aparecerá para nuevas compras; su historial se conserva." : undefined}>
              {p.activo ? "Desactivar proveedor" : "Reactivar proveedor"}
            </BotonEnviar>
          </form>
        </>
      )}
    </>
  );
}
