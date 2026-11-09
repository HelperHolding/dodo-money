import {separarDesglose,type Periodo} from './calculos.ts';
import type {TipoDesglose} from './extraer.ts';
import {ventasMensuales} from './graficasReporte.ts';
/** Mes actual hasta hoy; meses anteriores completos. No se consulta un mes futuro. */
export function periodoInicioVentas(pedido:string|undefined,hoy:string):Periodo{
 const mes=pedido&&/^(20\d{2})-(0[1-9]|1[0-2])$/.test(pedido)&&pedido<=hoy.slice(0,7)?pedido:hoy.slice(0,7);
 const fin=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
 return {desde:`${mes}-01`,hasta:mes===hoy.slice(0,7)?hoy:fin};
}

export type Origen={clave:'mostrador'|'app'|'sitio'|'centro_llamadas'|'agregador'|'rappi';etiqueta:string;pedidos:number;porcentaje:number};
const ORIGENES:readonly [Origen['clave'],string][]=[
 ['mostrador','Mostrador'],['app','App'],['sitio','Sitio'],['centro_llamadas','Centro de llamadas'],['agregador','Agregadores'],['rappi','Rappi'],
];

/** Pedidos por origen. Mostrador = pedidos POS que Dodo IS no marca con otro origen; Rappi (portal, vía n8n) va aparte. */
export function origenesPedidos(desglose:readonly {tipo:TipoDesglose;pedidos:number;total:number}[],pedidosPos:number,pedidosRappi:number):Origen[]{
 const porTipo=new Map<string,number>(separarDesglose(desglose).origen.map(t=>[t.tipo,t.pedidos]));
 const conOrigen=[...porTipo.values()].reduce((s,n)=>s+n,0);
 const pedidos:Record<Origen['clave'],number>={
  mostrador:Math.max(0,pedidosPos-conOrigen),app:porTipo.get('app')??0,sitio:porTipo.get('sitio')??0,
  centro_llamadas:porTipo.get('centro_llamadas')??0,agregador:porTipo.get('agregador')??0,rappi:pedidosRappi,
 };
 const total=Object.values(pedidos).reduce((s,n)=>s+n,0);
 return ORIGENES.map(([clave,etiqueta])=>({clave,etiqueta,pedidos:pedidos[clave],porcentaje:total?pedidos[clave]/total:0}));
}

export type PuntoHistorial={clave:string;rotulo:string;total:number;parcial:boolean};
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const lunesDe=(fecha:string)=>{const d=new Date(`${fecha}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
const sumarDias=(fecha:string,dias:number)=>{const d=new Date(`${fecha}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10);};

/** Venta por semana (12), mes (12) o año (todos), hasta `hasta`. Solo periodos con datos; el periodo en curso va como parcial. */
export function historialVentas(venta:Record<string,number>,hasta:string,modo:'semanal'|'mensual'|'anual'):PuntoHistorial[]{
 if(modo==='mensual'){
  const [a,m]=hasta.split('-').map(Number);
  const desdeMes=new Date(Date.UTC(a,m-12,1)).toISOString().slice(0,10);
  return ventasMensuales(venta,desdeMes,hasta).map(x=>({
   clave:x.mes,rotulo:`${MESES[Number(x.mes.slice(5))-1]} ${x.mes.slice(2,4)}`,total:x.total,parcial:x.mes===hasta.slice(0,7),
  }));
 }
 const clave=modo==='semanal'?lunesDe:(f:string)=>f.slice(0,4);
 const desde=modo==='semanal'?sumarDias(lunesDe(hasta),-77):'0000-01-01';
 const actual=clave(hasta);
 const mapa=new Map<string,number>();
 for(const [fecha,total] of Object.entries(venta)){
  if(fecha<desde||fecha>hasta)continue;
  const k=clave(fecha);
  mapa.set(k,Math.round(((mapa.get(k)??0)+total)*100)/100);
 }
 return [...mapa].sort(([x],[y])=>x.localeCompare(y)).map(([k,total])=>({
  clave:k,rotulo:modo==='semanal'?`${Number(k.slice(8))} ${MESES[Number(k.slice(5,7))-1]}`:k,total,parcial:k===actual,
 }));
}
