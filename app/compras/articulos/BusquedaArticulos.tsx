"use client";
import {createContext,useContext,useState,type ReactNode} from 'react';
import {Plegable} from '@/components/Plegable';
const Busqueda=createContext('');
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const coincide=(texto:string,q:string)=>normal(q).trim().split(/\s+/).filter(Boolean).every(p=>normal(texto).includes(p));
export function BusquedaArticulos({indice,children}:{indice:{id:string;texto:string}[];children:ReactNode}) {
 const [q,setQ]=useState('');
 const cantidad=indice.filter(a=>coincide(a.texto,q)).length;
 return <Busqueda.Provider value={q}><section className="seccion formulario" role="search"><div className="campo"><label htmlFor="articulos-buscar">Buscar artículo, ID de Dodo IS o proveedor</label><input id="articulos-buscar" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Escribe para buscar…"/></div><div className="acciones"><span role="status">{cantidad} de {indice.length} artículos</span>{q&&<button type="button" className="boton boton-secundario" onClick={()=>setQ('')}>Limpiar búsqueda</button>}</div></section>{!cantidad&&indice.length>0&&<p className="vacio">No hay artículos con esta búsqueda.</p>}{children}</Busqueda.Provider>;
}
export function ArticuloBuscable({texto,children}:{texto:string;children:ReactNode}) {
 const q=useContext(Busqueda);return coincide(texto,q)?children:null;
}
export function GrupoArticulosBuscable({textos,id,titulo,resumen,children}:{textos:string[];id:string;titulo:string;resumen:string;children:ReactNode}) {
 const q=useContext(Busqueda);const cantidad=textos.filter(t=>coincide(t,q)).length;
 return cantidad?<Plegable id={id} titulo={titulo} resumen={q.trim()?`${cantidad} resultados`:resumen} forzarAbierto={!!q.trim()}>{children}</Plegable>:null;
}
