// @ts-expect-error Node strip-types requiere extensión explícita.
import {tiempos,cuentaComoVenta,MINUTOS_LENTO,type Pedido} from '../ventas/pedidos.ts';

const r1=(n:number|null)=>(n===null?null:Math.round(n*10)/10);
const pct=(a:number,b:number)=>(b>0?Math.round(a/b*1000)/10:null);
/** Pedidos con tiempo de cocina a partir de los cuales una sucursal se compara con las demás. */
export const MINIMO_COMPARABLE=30;

function medir<P extends Pedido>(pedidos:readonly P[]) {
 const venta=pedidos.filter(cuentaComoVenta),t=tiempos(venta);
 const conCocina=venta.length-t.sinTiempo,conEntrega=venta.filter(p=>p.entregado).length;
 const diasConTiempo=new Set(venta.filter(p=>p.inicio_coccion&&p.listo).map(p=>p.fecha)).size;
 return {venta,t,conCocina,conEntrega,diasConTiempo};
}

/** Tiempos de servicio con el cálculo de Ventas (tiempos()), con cobertura y desglose por sucursal. */
export function resumenTiempos(pedidos:readonly (Pedido&{sucursal_id:string})[],nombres:ReadonlyMap<string,string>) {
 const {venta,t,conCocina,conEntrega,diasConTiempo}=medir(pedidos);
 const sucursales=[...new Set(venta.map(p=>p.sucursal_id))];
 const porSucursal=sucursales.length>1?sucursales.map(id=>{
  const m=medir(pedidos.filter(p=>p.sucursal_id===id));
  return {sucursal_id:id,sucursal:nombres.get(id)??id,medianaCocinaMin:r1(m.t.medianaCocina),medianaEntregaMin:r1(m.t.medianaEntrega),
   pctLentos:m.t.pctLentos===null?null:Math.round(m.t.pctLentos*1000)/10,pedidosConTiempo:m.conCocina,pedidos:m.venta.length,
   pctConTiempo:pct(m.conCocina,m.venta.length)??0,diasConTiempo:m.diasConTiempo,muestraChica:m.conCocina<MINIMO_COMPARABLE};
 }).sort((a,b)=>Number(a.muestraChica)-Number(b.muestraChica)||(b.medianaCocinaMin??-1)-(a.medianaCocinaMin??-1)):null;
 return {
  sinDatos:conCocina===0&&conEntrega===0,
  minutosLento:MINUTOS_LENTO,
  minimoComparable:MINIMO_COMPARABLE,
  cobertura:{pedidos:venta.length,conTiempoCocina:conCocina,conTiempoEntrega:conEntrega,pctConTiempo:pct(conCocina,venta.length)??0,diasConTiempo},
  general:{
   medianaCocinaMin:r1(t.medianaCocina),medianaEntregaMin:r1(t.medianaEntrega),lentos:t.lentos,
   pctLentos:t.pctLentos===null?null:Math.round(t.pctLentos*1000)/10,
   porHora:t.porHora.map(h=>({hora:h.hora,medianaCocinaMin:r1(h.mediana),pedidos:h.pedidos})),
   masLentos:t.masLentos.map(x=>({fecha:x.fecha,hora:x.hora,minutos:x.minutos,total:x.total})),
  },
  porSucursal,
 };
}
