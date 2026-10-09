import type {Periodo} from './calculos.ts';
/** Mes actual hasta hoy; meses anteriores completos. No se consulta un mes futuro. */
export function periodoInicioVentas(pedido:string|undefined,hoy:string):Periodo{
 const mes=pedido&&/^(20\d{2})-(0[1-9]|1[0-2])$/.test(pedido)&&pedido<=hoy.slice(0,7)?pedido:hoy.slice(0,7);
 const fin=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
 return {desde:`${mes}-01`,hasta:mes===hoy.slice(0,7)?hoy:fin};
}
