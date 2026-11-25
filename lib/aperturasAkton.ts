// Aperturas con estilo Akton: avance esperado a hoy, indicadores y lectura. Guía: docs/diseno/estilo-akton.md.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {ETAPAS,indicadoresApertura,marcaItem,resumenApertura,type ItemApertura,type ProyectoApertura} from './aperturas.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {cortePresupuesto} from './cortePresupuesto.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {pesos} from './formato.ts';
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
// Valor grande del KPI: nunca días negativos.
export function textoDiasApertura(d:DiasApertura):{valor:string;tono:'destacado'|'no'} {
 if(d.tipo==='vencida')return {valor:`Vencida hace ${d.dias} ${d.dias===1?'día':'días'}`,tono:'no'};
 return {valor:d.tipo==='faltan'?String(d.dias):d.tipo==='hoy'?'Hoy':'Abierta',tono:'destacado'};
}
export function diasParaApertura(objetivo:string,hoy:string,todoListo:boolean):DiasApertura {
 const d=diasEntre(hoy,objetivo);
 if(d>0)return {tipo:'faltan',dias:d};
 if(d===0)return {tipo:'hoy',dias:0};
 return {tipo:todoListo?'abierta':'vencida',dias:-d};
}

export type TareaCronograma = {item:Concepto;desde:string;hasta:string;diasVencida:number|null};
export type FilaCronograma = {clave:keyof typeof ETAPAS;nombre:string;avance:Avance;desde:string|null;hasta:string|null;tareas:TareaCronograma[];sinFecha:number;bloqueadas:Concepto[];vencidas:TareaCronograma[];notas:string[]};

// Listo con el criterio del Checklist: equipo instalado también cuenta, así no sale como vencido.
const terminada=(i:Concepto)=>marcaItem(i)==='listo';
const plural=(n:number,uno:string,varios:string)=>`${n} ${n===1?uno:varios}`;
function listaCorta(nombres:string[]) {
 if(nombres.length<=2)return nombres.join(' y ');
 return `${nombres.slice(0,2).join(', ')} y ${nombres.length-2} más`;
}

export function filasCronograma(items:Concepto[],hoy:string):FilaCronograma[] {
 return (Object.keys(ETAPAS) as (keyof typeof ETAPAS)[]).map(clave=>{
  const de=items.filter(i=>i.etapa===clave&&cuentaEnAvance(i));
  const tareas=de.flatMap(item=>{const r=rangoItem(item);if(!r)return [];
   return [{item,desde:r.desde,hasta:r.hasta,diasVencida:r.hasta<hoy&&!terminada(item)?diasEntre(r.hasta,hoy):null}];})
   .sort((a,b)=>a.desde.localeCompare(b.desde)||a.hasta.localeCompare(b.hasta)||a.item.nombre.localeCompare(b.item.nombre));
  const vencidas=tareas.filter(t=>t.diasVencida!==null).sort((a,b)=>b.diasVencida!-a.diasVencida!||a.item.nombre.localeCompare(b.item.nombre));
  const bloqueadas=de.filter(i=>i.estado==='bloqueado');
  const notas=[
   ...(bloqueadas.length?[`${plural(bloqueadas.length,'bloqueada','bloqueadas')}: ${listaCorta(bloqueadas.map(b=>b.nombre))}`]:[]),
   ...(vencidas.length?[plural(vencidas.length,'vencida','vencidas')]:[]),
  ];
  return {clave,nombre:ETAPAS[clave],avance:avanceComparado(de,hoy),desde:tareas[0]?.desde??null,hasta:tareas.length?tareas.map(t=>t.hasta).sort().at(-1)!:null,
   tareas,sinFecha:de.length-tareas.length,bloqueadas,vencidas,notas};
 });
}

export type IndicadoresProyecto = {dias:DiasApertura;avance:Avance;vencidas:number;bloqueadas:number;aplicables:number;recepcion:number|null;recibidas:number;unidades:number;
 compras:{monto:number;presupuesto:number|null;excede:boolean;firme:boolean;sinPrecio:number}};

export function indicadoresProyecto(p:Pick<ProyectoApertura,'objetivo_hasta'|'presupuesto'>,items:ItemApertura[],hoy:string):IndicadoresProyecto {
 const r=indicadoresApertura(items,hoy),avance=avanceComparado(items,hoy),filas=filasCronograma(items,hoy),corte=cortePresupuesto(items),estimado=resumenApertura(items);
 const monto=corte?Math.round((corte.adquirido+corte.cotizado)*100)/100:estimado.cotizado;
 const presupuesto=corte?corte.total_sin_iva:p.presupuesto!==null&&Number(p.presupuesto)>0?Number(p.presupuesto):null;
 return {dias:diasParaApertura(p.objetivo_hasta,hoy,avance.conceptos>0&&avance.listos===avance.conceptos),avance,
  vencidas:filas.reduce((s,f)=>s+f.vencidas.length,0),bloqueadas:r.bloqueados.length,aplicables:items.filter(i=>i.estado!=='no_aplica').length,
  recepcion:r.recepcion,recibidas:r.recibidas,unidades:r.unidades,
  compras:{monto,presupuesto,excede:presupuesto!==null&&monto>presupuesto,firme:corte!==null,sinPrecio:estimado.sinPrecio}};
}

export type Lectura = {titulo:string;texto:string};
export function lecturaApertura(k:IndicadoresProyecto,filas:FilaCronograma[]):Lectura[] {
 const l:Lectura[]=[],a=k.avance;
 if(a.esperado!==null&&a.realConFecha!==null&&a.variacion!==null){
  const conVar=filas.filter(f=>f.avance.variacion!==null);
  const peores=conVar.filter(f=>f.avance.variacion!<0).sort((x,y)=>x.avance.variacion!-y.avance.variacion!||x.clave.localeCompare(y.clave)).slice(0,2);
  const mejor=[...conVar].sort((x,y)=>y.avance.variacion!-x.avance.variacion!||x.clave.localeCompare(y.clave))[0];
  l.push({titulo:`Avance de ${a.realConFecha} % contra ${a.esperado} % esperado a hoy`,
   texto:a.favorable==='no'
    ?`Faltan ${-a.variacion} puntos. ${peores.length===1?'La etapa más atrasada':'Las etapas más atrasadas'}: ${peores.map(f=>`${f.nombre} (${textoPts(f.avance.variacion!)})`).join(' y ')}.`
    :`Va al día (${textoPts(a.variacion)}).${mejor?` ${mejor.avance.variacion!>=0?'La etapa más adelantada es':'La que menos se atrasa es'} ${mejor.nombre} (${textoPts(mejor.avance.variacion!)}).`:''}`});
 }
 const vencidas=filas.flatMap(f=>f.vencidas),bloqueadas=filas.flatMap(f=>f.bloqueadas);
 if(vencidas.length||bloqueadas.length){
  const partes=[vencidas.length?plural(vencidas.length,'tarea vencida','tareas vencidas'):'',bloqueadas.length?plural(bloqueadas.length,'bloqueada','bloqueadas'):''].filter(Boolean);
  const urgentes=new Map<string,string>();
  for(const v of [...vencidas].sort((x,y)=>y.diasVencida!-x.diasVencida!)){
   const b=v.item.estado==='bloqueado'?'bloqueada, ':'';urgentes.set(v.item.id,`${v.item.nombre} (${b}vencida hace ${plural(v.diasVencida!,'día','días')})`);
  }
  for(const b of bloqueadas)if(!urgentes.has(b.id))urgentes.set(b.id,`${b.nombre} (bloqueada)`);
  const lista=[...urgentes.values()].slice(0,3);
  l.push({titulo:partes.join(' y '),texto:`Las más urgentes: ${lista.join(', ')}${urgentes.size>3?` y ${urgentes.size-3} más`:''}.`});
 }
 if(k.compras.presupuesto!==null){
  const c=k.compras;
  l.push({titulo:`Compras: ${pesos(c.monto)} ${c.firme?'con precio firme':'estimado'} de ${pesos(c.presupuesto!)} de presupuesto`,
   texto:c.excede?`Se pasa por ${pesos(c.monto-c.presupuesto!)}.`:c.sinPrecio?`${plural(c.sinPrecio,'concepto','conceptos')} sin precio o sin cantidad.`:'Todos los conceptos tienen precio y cantidad.'});
 }
 return l;
}
