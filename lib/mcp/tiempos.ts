// @ts-expect-error Node strip-types requiere extensión explícita.
import {tiempos,cuentaComoVenta,MINUTOS_LENTO,type Pedido} from '../ventas/pedidos.ts';

const r1=(n:number|null)=>(n===null?null:Math.round(n*10)/10);
const pct=(a:number,b:number)=>(b>0?Math.round(a/b*1000)/10:null);

function medir<P extends Pedido>(pedidos:readonly P[]) {
 const venta=pedidos.filter(cuentaComoVenta),t=tiempos(venta);
 const conCocina=venta.length-t.sinTiempo,conEntrega=venta.filter(p=>p.entregado).length;
 return {venta,t,conCocina,conEntrega};
}

/** Tiempos de servicio con el cálculo de Ventas (tiempos()), con cobertura y desglose por sucursal. */
export function resumenTiempos(pedidos:readonly (Pedido&{sucursal_id:string})[],nombres:ReadonlyMap<string,string>) {
 const {venta,t,conCocina,conEntrega}=medir(pedidos);
 const sucursales=[...new Set(venta.map(p=>p.sucursal_id))];
 const porSucursal=sucursales.length>1?sucursales.map(id=>{
  const m=medir(pedidos.filter(p=>p.sucursal_id===id));
  return {sucursal_id:id,sucursal:nombres.get(id)??id,medianaCocinaMin:r1(m.t.medianaCocina),medianaEntregaMin:r1(m.t.medianaEntrega),
   pctLentos:m.t.pctLentos===null?null:Math.round(m.t.pctLentos*1000)/10,pedidosConTiempo:m.conCocina,pedidos:m.venta.length};
 }).sort((a,b)=>(b.medianaCocinaMin??-1)-(a.medianaCocinaMin??-1)):null;
 return {
  sinDatos:conCocina===0&&conEntrega===0,
  minutosLento:MINUTOS_LENTO,
  cobertura:{pedidos:venta.length,conTiempoCocina:conCocina,conTiempoEntrega:conEntrega,pctConTiempo:pct(conCocina,venta.length)??0},
  general:{
   medianaCocinaMin:r1(t.medianaCocina),medianaEntregaMin:r1(t.medianaEntrega),lentos:t.lentos,
   pctLentos:t.pctLentos===null?null:Math.round(t.pctLentos*1000)/10,
   porHora:t.porHora.map(h=>({hora:h.hora,medianaCocinaMin:r1(h.mediana),pedidos:h.pedidos})),
   masLentos:t.masLentos.map(x=>({fecha:x.fecha,hora:x.hora,minutos:x.minutos,total:x.total})),
  },
  porSucursal,
 };
}
