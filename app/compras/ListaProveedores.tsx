"use client";
import {useState} from "react";
import {buscarProveedores} from "@/lib/compras/busquedaProveedores";
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { SelectorVista } from "@/components/SelectorVista";
import { estadoDocumentos, NOMBRE_DOCUMENTO, type Documento } from "@/lib/compras/documentos";
import { CATEGORIAS_COMPRA, NOMBRE_CATEGORIA_COMPRA, type CategoriaCompra } from "@/lib/compras/proveedores";
import { leerVista } from "@/lib/vista";

export type Fila = { id: string; razon_social: string; nombre_comercial: string | null; numero_cliente: string | null; dias_entrega: number | null; rfc: string; dias_credito: number; categorias: CategoriaCompra[]; activo: boolean };

type Params={q?:string;categoria?:string;inactivos?:string;docs?:string;vista?:string;ok?:string;error?:string};
export function ListaProveedores({filas,documentos,params,edita}:{filas:Fila[];documentos:(Documento & {proveedor_id:string})[];params:Params;edita:boolean}) {
 const [q,setQ]=useState(params.q??""),[categoria,setCategoria]=useState(params.categoria??""),[inactivos,setInactivos]=useState(params.inactivos??""),[docs,setDocs]=useState(params.docs??"");
 const vista=leerVista(params.vista),{ok,error}=params;
  const docsDe = new Map<string, Documento[]>();
  for (const d of documentos) docsDe.set(d.proveedor_id, [...(docsDe.get(d.proveedor_id) ?? []), d]);
  const estadoDe = (id: string) => estadoDocumentos(docsDe.get(id) ?? []);
  /** "Faltan 2 documentos", o null si ya están todos. */
  const avisoDocs = (id: string) => {
    const { faltan } = estadoDe(id);
    if (!faltan.length) return null;
    return faltan.length === 1 ? `Falta ${NOMBRE_DOCUMENTO[faltan[0]].toLowerCase()}` : `Faltan ${faltan.length} documentos`;
  };
  const entrega = (d: number | null) => (d === null ? null : d === 0 ? "entrega el mismo día" : `entrega en ${d} ${d === 1 ? "día" : "días"}`);


  const filtro = (CATEGORIAS_COMPRA as readonly string[]).includes(categoria ?? "") ? (categoria as CategoriaCompra) : undefined;
  const base = filas.filter(p => (inactivos === "si" || p.activo) && (!filtro || p.categorias.includes(filtro)) && (docs !== "pendientes" || estadoDe(p.id).pendiente));
  const visibles = buscarProveedores(base,q);


  return (
    <>
      <div className="encabezado">
        <h1>Proveedores</h1>
        <p>La cartera de proveedores de todas las sucursales.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <form className="seccion formulario" role="search" onSubmit={e=>e.preventDefault()}>
        {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
        <div className="rejilla">
          <div className="campo"><label htmlFor="q">Buscar</label><input id="q" name="q" value={q} onChange={e=>setQ(e.target.value)} type="search" maxLength={200} aria-describedby="ayuda-buscar-proveedores" placeholder="Escribe razón social, nombre o RFC…" /><small id="ayuda-buscar-proveedores">Se actualiza al escribir. También encuentra nombres parecidos con pequeños errores.</small></div>
          <div className="campo">
            <label htmlFor="categoria">Qué surte</label>
            <select id="categoria" name="categoria" value={filtro ?? ""} onChange={e=>setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {CATEGORIAS_COMPRA.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA_COMPRA[c]}</option>)}
            </select>
          </div>
          <label className="campo"><span><input type="checkbox" name="inactivos" value="si" checked={inactivos === "si"} onChange={e=>setInactivos(e.target.checked?"si":"")} /> Incluir inactivos</span></label>
          <label className="campo"><span><input type="checkbox" name="docs" value="pendientes" checked={docs === "pendientes"} onChange={e=>setDocs(e.target.checked?"pendientes":"")} /> Solo con documentos pendientes</span></label>
        </div>
        <div className="acciones">
          <span role="status" aria-live="polite">{visibles.length} de {filas.length} proveedores</span>
          {(q||categoria||inactivos||docs)&&<button type="button" className="boton boton-secundario" onClick={()=>{setQ('');setCategoria('');setInactivos('');setDocs('');}}>Limpiar filtros</button>}
          {edita && <Link className="boton" href="/compras/proveedores/nuevo">Nuevo proveedor</Link>}
        </div>
      </form>

      <SelectorVista ruta="/compras" params={{...params,q,categoria,inactivos,docs}} vista={vista} />
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
                <span>{[p.dias_credito ? `${p.dias_credito} días` : "Contado", entrega(p.dias_entrega)].filter(Boolean).join(" · ")}</span>
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
              {p.dias_entrega !== null && <><dt>Entrega</dt><dd>{p.dias_entrega === 0 ? "El mismo día" : `${p.dias_entrega} ${p.dias_entrega === 1 ? "día" : "días"}`}</dd></>}
              <dt>Documentos</dt><dd className={avisoDocs(p.id) ? "celda-alerta" : undefined}>{avisoDocs(p.id) ?? "Al día"}</dd>
              <dt>Surte</dt><dd>{p.categorias.length ? p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") : "Sin categoría"}</dd>
            </dl>
          </article>
        ))}
      </div>}
    </>
  );
}
