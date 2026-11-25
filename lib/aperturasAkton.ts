// Aperturas con estilo Akton: avance esperado a hoy, indicadores y lectura. Guía: docs/diseno/estilo-akton.md.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {marcaItem,type ItemApertura} from './aperturas.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {rangoItem} from './aperturasCalendario.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {cuentaEnAvance} from './aperturasGantt.ts';

export const TOLERANCIA_AVANCE = 5;
export type Concepto = Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'inicio'|'fin'|'responsable'|'notas'>;

const DIA=86_400_000;
const aMs=(d:string)=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)));
export const diasEntre=(desde:string,hasta:string)=>Math.round((aMs(hasta)-aMs(desde))/DIA);
export const textoPts=(n:number)=>`${n>0?'+':n<0?'−':''}${Math.abs(n)} pts`;
const pct=(n:number,d:number)=>d?Math.round(n/d*100):null;

// Qué parte de su ventana ya debió avanzar un concepto a hoy (incluye hoy). Sin fechas: null.
export function esperadoItem(i:Pick<ItemApertura,'inicio'|'fin'>,hoy:string):number|null {
 const r=rangoItem(i);if(!r)return null;
 if(hoy<r.desde)return 0;if(hoy>r.hasta)return 1;
 return (diasEntre(r.desde,hoy)+1)/(diasEntre(r.desde,r.hasta)+1);
}

export type Avance = {conceptos:number;listos:number;real:number|null;conFecha:number;realConFecha:number|null;esperado:number|null;variacion:number|null;favorable:'si'|'no'|null};
// Real de todos los conceptos; la variación compara el real y el esperado de los mismos conceptos con fecha.
export function avanceComparado(items:Concepto[],hoy:string):Avance {
 const de=items.filter(cuentaEnAvance),listo=(i:Concepto)=>marcaItem(i)==='listo';
 const fechados=de.flatMap(i=>{const e=esperadoItem(i,hoy);return e===null?[]:[{i,e}];});
 const realConFecha=pct(fechados.filter(x=>listo(x.i)).length,fechados.length);
 const esperado=fechados.length?Math.round(fechados.reduce((s,x)=>s+x.e,0)/fechados.length*100):null;
 const variacion=realConFecha!==null&&esperado!==null?realConFecha-esperado:null;
 return {conceptos:de.length,listos:de.filter(listo).length,real:pct(de.filter(listo).length,de.length),conFecha:fechados.length,realConFecha,esperado,variacion,
  favorable:variacion===null?null:variacion>=-TOLERANCIA_AVANCE?'si':'no'};
}

export type DiasApertura = {tipo:'faltan'|'hoy'|'vencida'|'abierta';dias:number};
export function diasParaApertura(objetivo:string,hoy:string,todoListo:boolean):DiasApertura {
 const d=diasEntre(hoy,objetivo);
 if(d>0)return {tipo:'faltan',dias:d};
 if(d===0)return {tipo:'hoy',dias:0};
 return {tipo:todoListo?'abierta':'vencida',dias:-d};
}
