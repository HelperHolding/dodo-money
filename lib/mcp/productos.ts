// @ts-expect-error Node strip-types requiere extensión explícita.
import {porProducto,type RenglonCosteo} from '../ventas/calculos.ts';
import type {Categoria} from './herramientas.ts';

export const LIMITE_PRODUCTOS=50;
const normal=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const redondear=(n:number)=>Math.round(n*100)/100;

// Venta por producto del periodo con el mismo cálculo que el tablero (porProducto), filtrada y ordenada por venta.
export function resumenProductos(renglones:readonly RenglonCosteo[],filtro:{busqueda:string|null;categoria:Categoria|null},limite=LIMITE_PRODUCTOS) {
 const buscado=filtro.busqueda?normal(filtro.busqueda):null;
 const todos=porProducto(renglones)
  .filter(p=>(!buscado||normal(p.nombre).includes(buscado))&&(!filtro.categoria||p.categoria===filtro.categoria))
  .sort((a,b)=>b.importe-a.importe||a.nombre.localeCompare(b.nombre,'es'));
 const totales=todos.reduce((t,p)=>({piezas:t.piezas+p.piezas,importe:t.importe+p.importe,ventaNeta:t.ventaNeta+p.ventaNeta}),{piezas:0,importe:0,ventaNeta:0});
 return {
  productos:todos.slice(0,limite).map(p=>({dodo_id:p.dodo_id,nombre:p.nombre,categoria:p.categoria,piezas:p.piezas,importe:p.importe,ventaNeta:p.ventaNeta,descuento:p.descuento,costo:p.costo})),
  totalProductos:todos.length,
  truncado:todos.length>limite,
  totales:{piezas:totales.piezas,importe:redondear(totales.importe),ventaNeta:redondear(totales.ventaNeta)},
 };
}
