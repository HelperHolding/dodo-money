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

export type ArgsBI={desde:string;hasta:string;sucursal:string|null;canal:'pos'|'rappi'|null;comparar:'anterior'|'anio'|'semana';dias:number[]|null};
const mas=(f:string,dias:number)=>{const x=new Date(`${f}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+dias);return x.toISOString().slice(0,10);};
const largo=(desde:string,hasta:string)=>Math.round((Date.parse(hasta)-Date.parse(desde))/86400000)+1;

/** El periodo no puede pasar de hoy (día de operación): un hasta futuro se recorta y se avisa, como en la pantalla. */
export function periodoBI(a:{desde:string;hasta:string},hoy:string) {
 if(a.desde>hoy)throw Error('El periodo es futuro: todavía no hay ventas.');
 const hasta=a.hasta>hoy?hoy:a.hasta;
 return {desde:a.desde,hasta,hastaPedido:a.hasta>hoy?a.hasta:null,incluyeHoy:hasta===hoy};
}

/** Mismos filtros que la pantalla Ventas → BI, solo con los que expone el conector. */
export function filtrosBI(a:ArgsBI,hoy:string):FiltrosBI {
 const p=periodoBI(a,hoy);
 return {rel:null,desde:p.desde,hasta:p.hasta,comp:a.comparar==='anio'?'anio':'anterior',suc:a.sucursal?[a.sucursal]:[],rfc:null,edad:null,canal:a.canal,origen:[],tipo:[],dia:a.dias??[],hora:null,cat:[],prod:null,pago:[]};
}

/** semana: mismos días de la semana, recorridos semanas completas hacia atrás (sin encimarse con el periodo). */
export function parametrosBI(f:FiltrosBI,comparar:ArgsBI['comparar']) {
 const semanas=7*Math.ceil(largo(f.desde,f.hasta)/7);
 const comp=comparar==='semana'?{desde:mas(f.desde,-semanas),hasta:mas(f.hasta,-semanas)}:rangoComparacion(f.desde,f.hasta,comparar);
 return {actual:parametrosSQL(f,f),anterior:parametrosSQL(f,comp),comparacion:{tipo:comparar,desde:comp.desde,hasta:comp.hasta},fuente:urlBI(f)};
}

/** Cuántas veces cae cada día de la semana (1 = lunes … 7 = domingo) en el periodo. */
export function ocurrencias(desde:string,hasta:string):Map<number,number> {
 const n=new Map<number,number>();
 for(let f=desde;f<=hasta;f=mas(f,1)){const d=((new Date(`${f}T12:00:00Z`).getUTCDay()+6)%7)+1;n.set(d,(n.get(d)??0)+1);}
 return n;
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
export function resumenBI(actual:SalidaBI,anterior:SalidaBI,periodo:{desde:string;hasta:string}) {
 const k=kpis(actual),a=kpis(anterior),total=k.ventaNeta,veces=ocurrencias(periodo.desde,periodo.hasta);
 const dias=conAnterior(actual.dias.map(x=>({...x,k:x.dia})),anterior.dias.map(x=>({...x,k:x.dia})),total)
  .map(({k,...x})=>({dia:DIAS[k-1]??String(k),...x,ocurrencias:veces.get(k)??0,ventaNetaPromedioDia:div(x.ventaNeta,veces.get(k)??0)}));
 const horas=conAnterior(actual.horas.map(x=>({...x,k:x.hora})),anterior.horas.map(x=>({...x,k:x.hora})),total).map(({k,...x})=>({hora:k,...x}));
 return {
  sinVenta:k.tickets===0,
  kpis:k,anterior:a,
  cambioPct:{ventaNeta:cambio(k.ventaNeta,a.ventaNeta),tickets:cambio(k.tickets,a.tickets),ticketPromedio:cambio(k.ticketPromedio,a.ticketPromedio),piezasPorTicket:cambio(k.piezasPorTicket,a.piezasPorTicket)},
  canales:desglose(actual.canales,'canal',total),origenes:desglose(actual.origenes,'origen',total),
  tipos:desglose(actual.tipos,'tipo',total),pagos:desglose(actual.pagos,'pago',total),
  dias,horas,diaPico:dias.length?dias.reduce((m,x)=>((x.ventaNetaPromedioDia??0)>(m.ventaNetaPromedioDia??0)?x:m)):null,horaPico:pico(horas),
  semanas:actual.semanas.map(x=>({semana:x.semana,ventaNeta:r2(Number(x.ventas)),tickets:Number(x.tickets)})),
  categorias:actual.categorias.map(x=>({categoria:x.categoria,ventaNeta:r2(Number(x.ventas)),piezas:Number(x.piezas)})),
 };
}
