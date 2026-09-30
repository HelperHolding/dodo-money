import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { CATEGORIAS_COMPRA, NOMBRE_CATEGORIA_COMPRA, NOMBRE_TASA_IVA, TASAS_IVA, type CategoriaCompra, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { cambiarActivoArticulo, guardarArticulo } from "../acciones";

type Articulo = { id: string; nombre: string; unidad: string; tipo: CategoriaCompra; tasa_iva: TasaIva; dodo_insumo_id: string | null; activo: boolean };
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

export default async function Articulos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCompras(perfil.rol);
  const [articulos, precios] = await Promise.all([
    leerTodo<Articulo>((d, h) => supabase.from("articulos").select("id, nombre, unidad, tipo, tasa_iva, dodo_insumo_id, activo")
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
          <form action={guardarArticulo} className="formulario">
            <CamposArticulo />
            <BotonEnviar>Dar de alta</BotonEnviar>
          </form>
        </details>
      )}
      {!articulos.length && <p className="vacio">Aún no hay artículos.</p>}
      {CATEGORIAS_COMPRA.map((tipo) => {
        const lista = articulos.filter((a) => a.tipo === tipo);
        if (!lista.length) return null;
        return (
          <Plegable key={tipo} id={`t-${tipo}`} titulo={NOMBRE_CATEGORIA_COMPRA[tipo]} resumen={`${lista.filter((a) => a.activo).length} activos`}>
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
                      {a.dodo_insumo_id && <><dt>Dodo IS</dt><dd style={{ overflowWrap: "anywhere" }}>{a.dodo_insumo_id}</dd></>}
                      <dt>Precios</dt>
                      <dd>{ps.length ? ps.map((p, i) => (
                        <span key={i}>{p.proveedores?.nombre_comercial ?? p.proveedores?.razon_social}: {pesos(p.precio)} ({fechaTexto(p.fecha)})</span>
                      )) : "Sin compras todavía"}</dd>
                    </dl>
                    {edita && (
                      <details>
                        <summary>Editar</summary>
                        <form action={guardarArticulo} className="formulario">
                          <input type="hidden" name="id" value={a.id} />
                          <CamposArticulo a={a} />
                          <BotonEnviar>Guardar</BotonEnviar>
                        </form>
                        <form action={cambiarActivoArticulo} className="acciones">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="activo" value={a.activo ? "no" : "si"} />
                          <BotonEnviar className="boton boton-secundario">{a.activo ? "Desactivar" : "Reactivar"}</BotonEnviar>
                        </form>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </Plegable>
        );
      })}
    </>
  );
}
