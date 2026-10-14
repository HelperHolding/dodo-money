"use client";
import {useState} from 'react';
import Link from 'next/link';
import {fechaTexto,pesos} from '@/lib/formato';
type Grupo='cotizaciones'|'ordenes'|'facturas';
export type DocumentoProveedor={id:string;grupo:Grupo;nombre:string;fecha:string;estado:string;cancelado:boolean;destino:string;href:string;total:number|null;saldo:number|null;detalle?:string};
const grupos:{id:Grupo;nombre:string;tono:string}[]=[{id:'cotizaciones',nombre:'Cotizaciones',tono:'ambar'},{id:'ordenes',nombre:'Órdenes de compra',tono:'azul'},{id:'facturas',nombre:'Facturas',tono:'violeta'}];
export function ListaComprasProveedor({documentos}:{documentos:DocumentoProveedor[]}) {
 const [abierto,setAbierto]=useState<Grupo|null>(null);
 const filas=documentos.filter(d=>d.grupo===abierto);
 const titulo=grupos.find(g=>g.id===abierto)?.nombre;
 return <section className="seccion" aria-labelledby="compras-proveedor-titulo"><h2 id="compras-proveedor-titulo">Compras de este proveedor</h2>
  <div className="proveedor-indicadores">{grupos.map(g=><button key={g.id} type="button" className="proveedor-indicador" data-tono={g.tono} aria-expanded={abierto===g.id} aria-controls="proveedor-documentos-lista" onClick={()=>setAbierto(abierto===g.id?null:g.id)}><span>{g.nombre}</span><strong>{documentos.filter(d=>d.grupo===g.id).length}</strong><small>{abierto===g.id?'Ocultar lista':'Ver lista'} <span aria-hidden="true">{abierto===g.id?'▴':'▾'}</span></small></button>)}</div>
  <p className="saldo-nota">Incluye el historial, con documentos cancelados. Facturas incluye prefacturas y notas de crédito. Las cotizaciones confirmadas aparecen como órdenes de compra.</p>
  <div id="proveedor-documentos-lista" hidden={!abierto}>{abierto&&<><h3>{titulo} · {filas.length}</h3>{!filas.length?<p>No hay documentos en esta categoría.</p>:<div className="tabla-scroll"><table className="proveedor-documentos-tabla"><thead><tr><th>Documento</th><th>Fecha</th><th>Estado</th><th>Sucursal / CEDIS</th>{abierto==='facturas'&&<><th>Total</th><th>Saldo</th></>}</tr></thead><tbody>{filas.map(d=><tr key={d.id}><td><Link href={d.href}><strong>{d.nombre||'Ver documento'}</strong></Link>{d.detalle&&<small>{d.detalle}</small>}</td><td>{fechaTexto(d.fecha)}</td><td><span className="proveedor-documento-estado" data-cancelado={d.cancelado}>{d.estado}</span></td><td>{d.destino}</td>{abierto==='facturas'&&<><td>{d.total===null?'—':pesos(d.total)}</td><td>{d.saldo===null?'—':pesos(d.saldo)}</td></>}</tr>)}</tbody></table></div>}</>}</div>
 </section>;
}
