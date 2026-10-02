import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { SelectorVista } from "@/components/SelectorVista";
import { obtenerPerfil } from "@/lib/contexto";
import { estadoDocumentos, NOMBRE_DOCUMENTO, type Documento } from "@/lib/compras/documentos";
import { CATEGORIAS_COMPRA, NOMBRE_CATEGORIA_COMPRA, type CategoriaCompra } from "@/lib/compras/proveedores";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerVista } from "@/lib/vista";

type Fila = { id: string; razon_social: string; nombre_comercial: string | null; numero_cliente: string | null; rfc: string; dias_credito: number; categorias: CategoriaCompra[]; activo: boolean };

export default async function Proveedores({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; inactivos?: string; docs?: string; vista?: string; ok?: string; error?: string }> }) {
  const params = await searchParams;
  const { q = "", categoria, inactivos, docs, ok, error } = params;
  const vista = leerVista(params.vista);
  const { supabase, perfil } = await obtenerPerfil();
  const [filas, documentos] = await Promise.all([
    leerTodo<Fila>((desde, hasta) => supabase.from("proveedores")
      .select("id, razon_social, nombre_comercial, numero_cliente, rfc, dias_credito, categorias, activo")
      .order("razon_social").order("id").range(desde, hasta).returns<Fila[]>()),
    leerTodo<Documento & { proveedor_id: string }>((desde, hasta) => supabase.from("documentos_proveedor")
      .select("id, proveedor_id, tipo, fecha, subido_en").order("id").range(desde, hasta).returns<(Documento & { proveedor_id: string })[]>()),
  ]);
  const hoy = hoyCalendarioMX();
  const docsDe = new Map<string, Documento[]>();
  for (const d of documentos) docsDe.set(d.proveedor_id, [...(docsDe.get(d.proveedor_id) ?? []), d]);
  const estadoDe = (id: string) => estadoDocumentos(docsDe.get(id) ?? [], hoy);
  /** "Faltan 2 documentos · opinión vencida", o null si todo está al día. */
  const avisoDocs = (id: string) => {
    const e = estadoDe(id);
    if (!e.pendiente) return null;
    return [e.faltan.length ? (e.faltan.length === 1 ? `Falta ${NOMBRE_DOCUMENTO[e.faltan[0]].toLowerCase()}` : `Faltan ${e.faltan.length} documentos`) : "",
      e.opinionVencida ? "opinión vencida" : ""].filter(Boolean).join(" · ");
  };

  const buscar = q.trim().toLowerCase();
  const filtro = (CATEGORIAS_COMPRA as readonly string[]).includes(categoria ?? "") ? (categoria as CategoriaCompra) : undefined;
  const visibles = filas.filter((p) =>
    (inactivos === "si" || p.activo)
    && (!filtro || p.categorias.includes(filtro))
    && (docs !== "pendientes" || estadoDe(p.id).pendiente)
    && (!buscar || [p.razon_social, p.nombre_comercial ?? "", p.rfc].some((t) => t.toLowerCase().includes(buscar))));

  return (
    <>
      <div className="encabezado">
        <h1>Proveedores</h1>
        <p>La cartera de proveedores de todas las sucursales.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <form className="seccion formulario" role="search">
        {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
        <div className="rejilla">
          <div className="campo"><label htmlFor="q">Buscar</label><input id="q" name="q" defaultValue={q} placeholder="Razón social, nombre o RFC" /></div>
          <div className="campo">
            <label htmlFor="categoria">Qué surte</label>
            <select id="categoria" name="categoria" defaultValue={filtro ?? ""}>
              <option value="">Todas</option>
              {CATEGORIAS_COMPRA.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA_COMPRA[c]}</option>)}
            </select>
          </div>
          <label className="campo"><span><input type="checkbox" name="inactivos" value="si" defaultChecked={inactivos === "si"} /> Incluir inactivos</span></label>
          <label className="campo"><span><input type="checkbox" name="docs" value="pendientes" defaultChecked={docs === "pendientes"} /> Solo con documentos pendientes</span></label>
        </div>
        <div className="acciones">
          <button className="boton boton-secundario" type="submit">Filtrar</button>
          {puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/proveedores/nuevo">Nuevo proveedor</Link>}
        </div>
      </form>

      <SelectorVista ruta="/compras" params={params} vista={vista} />
      {!visibles.length && <p className="vacio">{filas.length ? "Ningún proveedor coincide." : "Aún no hay proveedores. Da de alta el primero o cárgalos desde Excel."}</p>}
      {vista === "lista" && visibles.length > 0 && (
        <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
          <li className="fila fila-encabezado" aria-hidden="true"><span>Proveedor</span><span>RFC</span><span>Crédito</span><span>Surte</span></li>
          {visibles.map((p) => (
            <li key={p.id} className="fila" data-alerta={p.activo ? undefined : "si"}>
              <div className="fila-nombre">
                <Link href={`/compras/proveedores/${p.id}`}>{p.nombre_comercial ?? p.razon_social}</Link>
                {(p.nombre_comercial || !p.activo || p.numero_cliente) && <small>{[p.nombre_comercial ? p.razon_social : "", p.numero_cliente ? `cliente ${p.numero_cliente}` : "", p.activo ? "" : "inactivo"].filter(Boolean).join(" · ")}</small>}
                {avisoDocs(p.id) && <small className="nota-estado">{avisoDocs(p.id)}</small>}
              </div>
              <div className="fila-datos">
                <span>{p.rfc}</span>
                <span>{p.dias_credito ? `${p.dias_credito} días` : "Contado"}</span>
                <span>{p.categorias.length ? p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") : "Sin categoría"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {vista === "tarjetas" && <div className="tarjetas">
        {visibles.map((p) => (
          <article key={p.id} className="tarjeta" data-alerta={p.activo ? undefined : "si"}>
            <div className="tarjeta-encabezado">
              <div>
                <h3><Link href={`/compras/proveedores/${p.id}`}>{p.nombre_comercial ?? p.razon_social}</Link></h3>
                <p className="tarjeta-estado">{p.activo ? p.rfc : `${p.rfc} · inactivo`}</p>
              </div>
            </div>
            <dl className="tarjeta-datos">
              {p.nombre_comercial && <><dt>Razón social</dt><dd>{p.razon_social}</dd></>}
              {p.numero_cliente && <><dt>N.º de cliente</dt><dd>{p.numero_cliente}</dd></>}
              <dt>Crédito</dt><dd>{p.dias_credito ? `${p.dias_credito} días` : "Contado"}</dd>
              <dt>Documentos</dt><dd className={avisoDocs(p.id) ? "celda-alerta" : undefined}>{avisoDocs(p.id) ?? "Al día"}</dd>
              <dt>Surte</dt><dd>{p.categorias.length ? p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") : "Sin categoría"}</dd>
            </dl>
          </article>
        ))}
      </div>}
    </>
  );
}
