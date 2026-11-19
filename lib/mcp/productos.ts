// @ts-expect-error Node strip-types requiere extensión explícita.
import {porProducto,type RenglonCosteo} from '../ventas/calculos.ts';
import type {Categoria} from './herramientas.ts';

export const LIMITE_PRODUCTOS=50;
const normal=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const redondear=(n:number)=>Math.round(n*100)/100;
const IGNORADAS=new Set(['pizza','pizzas','de','del','la','las','el','los']);
// Tamaño al final del nombre: "Grande", "Mediano T", "30 cm", "30Т" (T cirílica en Dodo IS), "35"…
const TAMANO=/\s+(pequeñ[oa]|chic[oa]|median[oa]|medium|grande|familiar|\d{2}\s*(cm)?)(\s*[tTтТ])?$/i;

/** Sabor = nombre sin opciones de Rappi (" · …"), sin "Pizza" al inicio y sin el tamaño al final. */
export function saborDe(nombre:string):string {
 let s=nombre.split(' · ')[0].trim().replace(/^pizza\s+/i,'');
 for(let previo='';previo!==s;){previo=s;s=s.replace(TAMANO,'').trim();}
 return s||nombre;
}

function palabras(busqueda:string|null):string[]|null {
 if(!busqueda)return null;
 const todas=normal(busqueda).split(/\s+/).filter(Boolean),utiles=todas.filter(p=>!IGNORADAS.has(p));
 return utiles.length?utiles:todas;
}

// Venta por producto del periodo con el mismo cálculo que el tablero (porProducto), filtrada y ordenada por venta.
// Los renglones de Rappi sin vincular a un producto de Dodo IS (dodo_id negativo: combos, pizza + dip) se informan aparte.
export function resumenProductos(renglones:readonly RenglonCosteo[],filtro:{busqueda:string|null;categoria:Categoria|null},limite=LIMITE_PRODUCTOS) {
 const buscadas=palabras(filtro.busqueda);
 const todos=porProducto(renglones).map(p=>({...p,sabor:saborDe(p.nombre),rappiSinVincular:p.dodo_id<0}));
 const coincide=(nombre:string)=>!buscadas||buscadas.every(w=>normal(nombre).includes(w));
 const porBusqueda=todos.filter(p=>coincide(p.nombre));
 const filtrados=porBusqueda.filter(p=>!filtro.categoria||p.categoria===filtro.categoria)
  .sort((a,b)=>b.importe-a.importe||a.nombre.localeCompare(b.nombre,'es'));
 const vinculados=filtrados.filter(p=>!p.rappiSinVincular),sueltos=filtrados.filter(p=>p.rappiSinVincular);
 const suma=<T extends {piezas:number;importe:number;ventaNeta:number}>(xs:T[])=>xs.reduce((t,p)=>({piezas:t.piezas+p.piezas,importe:t.importe+p.importe,ventaNeta:t.ventaNeta+p.ventaNeta}),{piezas:0,importe:0,ventaNeta:0});
 const sabores=new Map<string,{sabor:string;piezas:number;importe:number;ventaNeta:number;productos:number}>();
 for(const p of vinculados){
  const k=normal(p.sabor),x=sabores.get(k)??{sabor:p.sabor,piezas:0,importe:0,ventaNeta:0,productos:0};
  x.piezas+=p.piezas;x.importe+=p.importe;x.ventaNeta+=p.ventaNeta;x.productos++;sabores.set(k,x);
 }
 const t=suma(vinculados),ts=suma(sueltos);
 const mitades=buscadas?todos.filter(p=>normal(p.sabor).startsWith('mitad y mitad')&&!coincide(p.nombre)):null;
 const sinCategoria=filtro.categoria?porBusqueda.filter(p=>p.categoria===null):null;
 return {
  productos:filtrados.slice(0,limite).map(p=>({dodo_id:p.dodo_id,nombre:p.nombre,sabor:p.sabor,categoria:p.categoria,piezas:p.piezas,importe:p.importe,ventaNeta:p.ventaNeta,descuento:p.descuento,costo:p.costo,rappiSinVincular:p.rappiSinVincular})),
  totalProductos:filtrados.length,
  truncado:filtrados.length>limite,
  sinCoincidencias:!!buscadas&&filtrados.length===0,
  totales:{piezas:t.piezas,importe:redondear(t.importe),ventaNeta:redondear(t.ventaNeta)},
  porSabor:[...sabores.values()].sort((a,b)=>b.importe-a.importe).map(x=>({...x,importe:redondear(x.importe),ventaNeta:redondear(x.ventaNeta)})),
  rappiSinVincular:{productos:sueltos.length,piezas:ts.piezas,importe:redondear(ts.importe)},
  mitadYMitad:mitades?{piezas:mitades.reduce((n,p)=>n+p.piezas,0),importe:redondear(mitades.reduce((n,p)=>n+p.importe,0))}:null,
  sinCategoria:sinCategoria?{productos:sinCategoria.length,piezas:sinCategoria.reduce((n,p)=>n+p.piezas,0)}:null,
 };
}
