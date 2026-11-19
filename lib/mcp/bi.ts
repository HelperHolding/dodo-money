// @ts-expect-error Node strip-types requiere extensión explícita.
import {parametrosSQL,rangoComparacion,urlBI,type FiltrosBI} from '../ventas/bi.ts';

type Num=number|string;
type Fila={ventas:Num;tickets:Num};
/** Lo que usa el conector de lo que devuelve ventas_bi (los numeric pueden llegar como texto). */
export type SalidaBI={
 kpis:{ventas:Num;tickets:Num;productos:Num};
 canales:(Fila&{canal:string})[];origenes:(Fila&{origen:string})[];tipos:(Fila&{tipo:string})[];pagos:(Fila&{pago:string})[];
 dias:(Fila&{dia:number})[];horas:(Fila&{hora:number})[];semanas:(Fila&{semana:string})[];
 categorias:{categoria:string;ventas:Num;piezas:Num}[];
};

const DIAS=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
const r2=(n:number)=>Math.round(n*100)/100;
const div=(a:number,b:number)=>(b>0?r2(a/b):null);
const cambio=(a:number|null,b:number|null)=>(a===null||b===null||b===0?null:r2((a-b)/b*100));

/** Mismos filtros que la pantalla Ventas → BI, solo con los que expone el conector. */
export function filtrosBI(a:{desde:string;hasta:string;sucursal:string|null;canal:'pos'|'rappi'|null;comparar:'anterior'|'anio'}):FiltrosBI {
 return {rel:null,desde:a.desde,hasta:a.hasta,comp:a.comparar,suc:a.sucursal?[a.sucursal]:[],rfc:null,edad:null,canal:a.canal,origen:[],tipo:[],dia:[],hora:null,cat:[],prod:null,pago:[]};
}

export function parametrosBI(f:FiltrosBI) {
 const comp=rangoComparacion(f.desde,f.hasta,f.comp);
 return {actual:parametrosSQL(f,f),anterior:parametrosSQL(f,comp),comparacion:{tipo:f.comp,desde:comp.desde,hasta:comp.hasta},fuente:urlBI(f)};
}

function kpis(s:SalidaBI){
 const ventaNeta=r2(Number(s.kpis.ventas)),tickets=Number(s.kpis.tickets),piezas=Number(s.kpis.productos);
 return {ventaNeta,tickets,ticketPromedio:div(ventaNeta,tickets),piezasPorTicket:div(piezas,tickets)};
}

function desglose<K extends string>(filas:readonly (Fila&Record<K,unknown>)[],clave:K,total:number) {
 return filas.map(x=>{const v=r2(Number(x.ventas)),t=Number(x.tickets);return {[clave]:x[clave],ventaNeta:v,tickets:t,ticketPromedio:div(v,t),participacionPct:total>0?r2(v/total*100):null};}) as ({ventaNeta:number;tickets:number;ticketPromedio:number|null;participacionPct:number|null}&Record<K,unknown>)[];
}

function conAnterior(filas:readonly {k:number;ventas:Num;tickets:Num}[],previas:readonly {k:number;ventas:Num}[],total:number) {
 const antes=new Map(previas.map(x=>[x.k,r2(Number(x.ventas))]));
 return [...filas].sort((a,b)=>a.k-b.k).map(x=>{
  const v=r2(Number(x.ventas)),t=Number(x.tickets),ant=antes.get(x.k)??0;
  return {k:x.k,ventaNeta:v,tickets:t,ticketPromedio:div(v,t),participacionPct:total>0?r2(v/total*100):null,ventaNetaAnterior:ant,cambioPct:cambio(v,ant)};
 });
}

const pico=<T extends {ventaNeta:number}>(xs:T[])=>xs.length?xs.reduce((m,x)=>(x.ventaNeta>m.ventaNeta?x:m)):null;

/** Resumen del periodo contra el de comparación: KPIs, desgloses con participación y cambio por día y por hora. */
export function resumenBI(actual:SalidaBI,anterior:SalidaBI) {
 const k=kpis(actual),a=kpis(anterior),total=k.ventaNeta;
 const dias=conAnterior(actual.dias.map(x=>({...x,k:x.dia})),anterior.dias.map(x=>({...x,k:x.dia})),total).map(({k,...x})=>({dia:DIAS[k-1]??String(k),...x}));
 const horas=conAnterior(actual.horas.map(x=>({...x,k:x.hora})),anterior.horas.map(x=>({...x,k:x.hora})),total).map(({k,...x})=>({hora:k,...x}));
 return {
  sinVenta:k.tickets===0,
  kpis:k,anterior:a,
  cambioPct:{ventaNeta:cambio(k.ventaNeta,a.ventaNeta),tickets:cambio(k.tickets,a.tickets),ticketPromedio:cambio(k.ticketPromedio,a.ticketPromedio),piezasPorTicket:cambio(k.piezasPorTicket,a.piezasPorTicket)},
  canales:desglose(actual.canales,'canal',total),origenes:desglose(actual.origenes,'origen',total),
  tipos:desglose(actual.tipos,'tipo',total),pagos:desglose(actual.pagos,'pago',total),
  dias,horas,diaPico:pico(dias),horaPico:pico(horas),
  semanas:actual.semanas.map(x=>({semana:x.semana,ventaNeta:r2(Number(x.ventas)),tickets:Number(x.tickets)})),
  categorias:actual.categorias.map(x=>({categoria:x.categoria,ventaNeta:r2(Number(x.ventas)),piezas:Number(x.piezas)})),
 };
}
