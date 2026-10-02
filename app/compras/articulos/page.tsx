import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { SelectorVista } from "@/components/SelectorVista";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { CATEGORIAS_COMPRA, NOMBRE_CATEGORIA_COMPRA, NOMBRE_TASA_IVA, TASAS_IVA, type CategoriaCompra, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerVista } from "@/lib/vista";
import { cambiarActivoArticulo, guardarArticulo } from "../acciones";
import { FormValidado } from "../FormValidado";

type Articulo = { id: string; nombre: string; unidad: string; tipo: CategoriaCompra; tasa_iva: TasaIva; dodo_insumo_id: string | null; activo: boolean; motivo_desactivacion: string | null };
type Precio = { articulo_id: string; precio: number; fecha: string; proveedores: { razon_social: string; nombre_comercial: string | null } | null };

function CamposArticulo({ a }: { a?: Articulo }) {
  const sufijo = a?.id ?? "nuevo";
  return (
    <div className="rejilla">
      <div className="campo"><label htmlFor={`nombre-${sufijo}`}>Nombre</label><input id={`nombre-${sufijo}`} name="nombre" defaultValue={a?.nombre} required /></div>
      <div className="campo"><label htmlFor={`unidad-${sufijo}`}>Unidad</label><input id={`unidad-${sufijo}`} name="unidad" defaultValue={a?.unidad} placeholder="kg, pza, caja, servicio" required /></div>
      <div className="campo">
        <label htmlFor={`tipo-${sufijo}`}>Tipo</label>
        <select id={`tipo-${sufijo}`} name="tipo" defaultValue={a?.tipo ?? "consumible"}>
          {CATEGORIAS_COMPRA.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA_COMPRA[c]}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`iva-${sufijo}`}>IVA</label>
        <select id={`iva-${sufijo}`} name="tasa_iva" defaultValue={a?.tasa_iva ?? "16"}>
          {TASAS_IVA.map((t) => <option key={t} value={t}>{NOMBRE_TASA_IVA[t]}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`dodo-${sufijo}`}>ID de insumo en Dodo IS</label>
        <input id={`dodo-${sufijo}`} name="dodo_insumo_id" defaultValue={a?.dodo_insumo_id ?? ""} maxLength={32} />
        <small>Solo consumibles. Es la columna ID del reporte Incoming supplies.</small>
      </div>
    </div>
  );
}

export default async function Articulos({ searchParams }: { searchParams: Promise<{ vista?: string; ok?: string; error?: string }> }) {
  const params = await searchParams;
  const { ok, error } = params;
  const vista = leerVista(params.vista);
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCompras(perfil.rol);
  const [articulos, precios] = await Promise.all([
    leerTodo<Articulo>((d, h) => supabase.from("articulos").select("id, nombre, unidad, tipo, tasa_iva, dodo_insumo_id, activo, motivo_desactivacion")
      .order("nombre").order("id").range(d, h).returns<Articulo[]>()),
    leerTodo<Precio>((d, h) => supabase.from("precios_proveedor").select("articulo_id, precio, fecha, proveedores(razon_social, nombre_comercial)")
      .order("articulo_id").order("proveedor_id").range(d, h).returns<Precio[]>()),
  ]);
  const preciosDe = new Map<string, Precio[]>();
  for (const p of precios) preciosDe.set(p.articulo_id, [...(preciosDe.get(p.articulo_id) ?? []), p]);

  return (
    <>
      <div className="encabezado">
        <h1>Artículos</h1>
        <p>Lo que se compra, con el último precio de cada proveedor. Los precios se llenan solos al confirmar órdenes de compra.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {edita && (
        <details className="seccion">
          <summary>Nuevo artículo</summary>
          <FormValidado tipo="articulo" action={guardarArticulo} className="formulario">
            <CamposArticulo />
            <BotonEnviar>Dar de alta</BotonEnviar>
          </FormValidado>
        </details>
      )}
      <SelectorVista ruta="/compras/articulos" params={params} vista={vista} />
      {!articulos.length && <p className="vacio">Aún no hay artículos.</p>}
      {CATEGORIAS_COMPRA.map((tipo) => {
        const lista = articulos.filter((a) => a.tipo === tipo);
        if (!lista.length) return null;
        return (
          <Plegable key={tipo} id={`t-${tipo}`} titulo={NOMBRE_CATEGORIA_COMPRA[tipo]} resumen={`${lista.filter((a) => a.activo).length} activos`}>
            {vista === "lista" ? (
              <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
                <li className="fila fila-encabezado" aria-hidden="true"><span>Artículo</span><span>Mejor precio</span><span>Proveedores</span><span>Última compra</span></li>
                {lista.map((a) => {
                  const ps = preciosDe.get(a.id) ?? [];
                  const mejor = ps.reduce<Precio | null>((m, p) => (!m || Number(p.precio) < Number(m.precio) ? p : m), null);
                  const ultima = ps.reduce<string | null>((u, p) => (!u || p.fecha > u ? p.fecha : u), null);
                  return (
                    <li key={a.id} className="fila" data-alerta={a.activo ? undefined : "si"}>
                      <div className="fila-nombre">
                        <Link href={`/compras/articulos#a-${a.id}`}>{a.nombre}</Link>
                        <small>{a.unidad} · {NOMBRE_TASA_IVA[a.tasa_iva]}{a.activo ? "" : " · inactivo"}</small>
                      </div>
                      <div className="fila-datos">
                        <span>{mejor ? `${pesos(mejor.precio)} · ${mejor.proveedores?.nombre_comercial ?? mejor.proveedores?.razon_social ?? ""}` : "Sin precio"}</span>
                        <span>{ps.length ? `${ps.length} ${ps.length === 1 ? "proveedor" : "proveedores"}` : "Sin compras"}</span>
                        <span>{ultima ? fechaTexto(ultima) : "—"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
            <div className="tarjetas">
              {lista.map((a) => {
                const ps = preciosDe.get(a.id) ?? [];
                return (
                  <article key={a.id} id={`a-${a.id}`} className="tarjeta" data-alerta={a.activo ? undefined : "si"}>
                    <div className="tarjeta-encabezado">
                      <div>
                        <h3>{a.nombre}</h3>
                        <p className="tarjeta-estado">{a.unidad} · {NOMBRE_TASA_IVA[a.tasa_iva]}{a.activo ? "" : " · inactivo"}</p>
                      </div>
                    </div>
                    <dl className="tarjeta-datos">
                      {a.dodo_insumo_id && <><dt>Dodo IS</dt><dd>{a.dodo_insumo_id}</dd></>}
                      {!a.activo && <><dt>Desactivado</dt><dd>{a.motivo_desactivacion}</dd></>}
                      <dt>Precios</dt>
                      <dd>{ps.length ? ps.map((p, i) => (
                        <span key={i}>{p.proveedores?.nombre_comercial ?? p.proveedores?.razon_social}: {pesos(p.precio)} ({fechaTexto(p.fecha)})</span>
                      )) : "Sin compras todavía"}</dd>
                    </dl>
                    {edita && (
                      <details>
                        <summary>Editar</summary>
                        <FormValidado tipo="articulo" action={guardarArticulo} className="formulario">
                          <input type="hidden" name="id" value={a.id} />
                          <CamposArticulo a={a} />
                          <BotonEnviar>Guardar</BotonEnviar>
                        </FormValidado>
                        <form action={cambiarActivoArticulo} className="acciones">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="activo" value={a.activo ? "no" : "si"} />
                          {a.activo && <div className="campo"><label htmlFor={`motivo-${a.id}`}>Motivo para desactivar</label><input id={`motivo-${a.id}`} name="motivo" required /></div>}
                          <BotonEnviar className="boton boton-secundario">{a.activo ? "Desactivar" : "Reactivar"}</BotonEnviar>
                        </form>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
            )}
          </Plegable>
        );
      })}
    </>
  );
}
