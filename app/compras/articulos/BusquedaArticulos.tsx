"use client";
import {Children,isValidElement,createContext,useContext,useMemo,useState,type ReactNode} from 'react';
import {Plegable} from '@/components/Plegable';
import {CATEGORIAS_COMPRA,NOMBRE_CATEGORIA_COMPRA,TASAS_IVA,NOMBRE_TASA_IVA} from '@/lib/compras/proveedores';
import {filtrarArticulos,FILTROS_ARTICULOS_VACIOS,type IndiceArticulo} from '@/lib/compras/filtrosArticulos';
const Busqueda=createContext<{visibles:Set<string>;filtrado:boolean}>({visibles:new Set(),filtrado:false});
export function BusquedaArticulos({indice,proveedores,children}:{indice:IndiceArticulo[];proveedores:{id:string;nombre:string}[];children:ReactNode}) {
 const [f,setF]=useState(FILTROS_ARTICULOS_VACIOS);
 const visibles=useMemo(()=>new Set(filtrarArticulos(indice,f).map(a=>a.id)),[indice,f]);
 const filtrado=!!(f.q.trim()||f.proveedor||f.tipo||f.iva);
 return <Busqueda.Provider value={{visibles,filtrado}}><section className="seccion formulario" role="search"><div className="campo"><label htmlFor="articulos-buscar">Buscar artículo, ID de Dodo IS o proveedor</label><input id="articulos-buscar" type="search" value={f.q} onChange={e=>setF(x=>({...x,q:e.target.value}))} placeholder="Escribe para buscar…" maxLength={200} aria-describedby="articulos-busqueda-ayuda"/><small id="articulos-busqueda-ayuda">También encuentra nombres parecidos con pequeños errores.</small></div>
 <div className="rejilla"><div className="campo"><label htmlFor="articulos-proveedor">Proveedor</label><select id="articulos-proveedor" value={f.proveedor} onChange={e=>setF(x=>({...x,proveedor:e.target.value}))}><option value="">Todos los proveedores</option><option value="sin-proveedor">Sin proveedor</option>{proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
 <div className="campo"><label htmlFor="articulos-tipo">Tipo de artículo</label><select id="articulos-tipo" value={f.tipo} onChange={e=>setF(x=>({...x,tipo:e.target.value}))}><option value="">Todos los tipos</option>{CATEGORIAS_COMPRA.map(t=><option key={t} value={t}>{NOMBRE_CATEGORIA_COMPRA[t]}</option>)}</select></div>
 <div className="campo"><label htmlFor="articulos-iva">IVA</label><select id="articulos-iva" value={f.iva} onChange={e=>setF(x=>({...x,iva:e.target.value}))}><option value="">Todas las tasas</option>{TASAS_IVA.map(t=><option key={t} value={t}>{NOMBRE_TASA_IVA[t]}</option>)}</select></div></div>
 <div className="acciones"><span role="status">{visibles.size} de {indice.length} artículos</span>{filtrado&&<button type="button" className="boton boton-secundario" onClick={()=>setF(FILTROS_ARTICULOS_VACIOS)}>Limpiar filtros</button>}</div></section>{!visibles.size&&indice.length>0&&<p className="vacio">No hay artículos con estos filtros.</p>}{children}</Busqueda.Provider>;
}
export function ArticuloBuscable({id,children}:{id:string;children:ReactNode}) {
 const {visibles}=useContext(Busqueda);return visibles.has(id)?children:null;
}
export function GrupoArticulosBuscable({ids,id,titulo,resumen,children}:{ids:string[];id:string;titulo:string;resumen:string;children:ReactNode}) {
 const {visibles,filtrado}=useContext(Busqueda);const cantidad=ids.filter(i=>visibles.has(i)).length;
 return cantidad?<Plegable id={id} titulo={titulo} resumen={filtrado?`${cantidad} resultados`:resumen} forzarAbierto={filtrado}>{children}</Plegable>:null;
}

/** Reordena dentro de cada categoría sin cambiar los elementos de lista ni sus formularios. */
export function ArticulosOrdenados({children}:{children:ReactNode}) {
 const {visibles}=useContext(Busqueda),posiciones=new Map([...visibles].map((id,i)=>[id,i]));
 return Children.toArray(children).sort((a,b)=>{
  const posicion=(n:ReactNode)=>isValidElement<{id?:string}>(n)?posiciones.get(n.props.id??'')??Infinity:Infinity;
  return posicion(a)-posicion(b);
 });
}
