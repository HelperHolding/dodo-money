// Aperturas con estilo Akton: avance esperado a hoy, indicadores y lectura. Guía: docs/diseno/estilo-akton.md.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {ETAPAS,avanceApertura,indicadoresApertura,marcaItem,promedioPuntos,resumenApertura,type ItemApertura,type ProyectoApertura} from './aperturas.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {cortePresupuesto} from './cortePresupuesto.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {pesos} from './formato.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {rangoItem} from './aperturasCalendario.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {cuentaEnAvance} from './aperturasGantt.ts';

export const TOLERANCIA_AVANCE = 5;
export type Concepto = Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'inicio'|'fin'|'responsable'|'notas'|'categoria'>;

const DIA=86_400_000;
const aMs=(d:string)=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)));
export const diasEntre=(desde:string,hasta:string)=>Math.round((aMs(hasta)-aMs(desde))/DIA);
export const textoPts=(n:number)=>`${n>0?'+':n<0?'−':''}${Math.abs(n)} pts`;

// Qué parte de su ventana ya debió avanzar un concepto a hoy (incluye hoy). Sin fechas: null.
export function esperadoItem(i:Pick<ItemApertura,'inicio'|'fin'>,hoy:string):number|null {
 const r=rangoItem(i);if(!r)return null;
 if(hoy<r.desde)return 0;if(hoy>r.hasta)return 1;
 return (diasEntre(r.desde,hoy)+1)/(diasEntre(r.desde,r.hasta)+1);
}

export type Avance = {conceptos:number;listos:number;real:number|null;conFecha:number;realConFecha:number|null;esperado:number|null;variacion:number|null;favorable:'si'|'no'|null};
// Real: el global ponderado por bloque (avanceApertura), igual que la portada y el checklist.
// La variación compara, en la misma escala, el promedio de puntos (realConFecha) y el esperado de los mismos conceptos con fecha; por eso en pantalla se rotula «con fecha».
export function avanceComparado(items:Concepto[],hoy:string):Avance {
 return comparar(items.filter(cuentaEnAvance),hoy,de=>avanceApertura(de).general);
}
function comparar(de:Concepto[],hoy:string,real:(de:Concepto[])=>number|null):Avance {
 const fechados=de.flatMap(i=>{const e=esperadoItem(i,hoy);return e===null?[]:[{i,e}];});
 const realConFecha=promedioPuntos(fechados.map(x=>x.i));
 const esperado=fechados.length?Math.round(fechados.reduce((s,x)=>s+x.e,0)/fechados.length*100):null;
 const variacion=realConFecha!==null&&esperado!==null?realConFecha-esperado:null;
 return {conceptos:de.length,listos:de.filter(i=>marcaItem(i)==='listo').length,real:real(de),conFecha:fechados.length,realConFecha,esperado,variacion,
  favorable:variacion===null?null:variacion>=-TOLERANCIA_AVANCE?'si':'no'};
}

export type DiasApertura = {tipo:'faltan'|'hoy'|'vencida'|'abierta';dias:number};
// Valor grande del KPI: nunca días negativos.
export function textoDiasApertura(d:DiasApertura):{valor:string;tono:'destacado'|'no'|'si'} {
 if(d.tipo==='vencida')return {valor:`Vencida hace ${d.dias} ${d.dias===1?'día':'días'}`,tono:'no'};
 if(d.tipo==='abierta')return {valor:'Abierta',tono:'si'};
 return {valor:d.tipo==='faltan'?String(d.dias):'Hoy',tono:'destacado'};
}
export function diasParaApertura(objetivo:string,hoy:string,todoListo:boolean):DiasApertura {
 const d=diasEntre(hoy,objetivo);
 if(d>0)return {tipo:'faltan',dias:d};
 if(d===0)return {tipo:'hoy',dias:0};
 return {tipo:todoListo?'abierta':'vencida',dias:-d};
}

export type TareaCronograma = {item:Concepto;desde:string;hasta:string;diasVencida:number|null};
export type FilaCronograma = {clave:keyof typeof ETAPAS;nombre:string;avance:Avance;desde:string|null;hasta:string|null;tareas:TareaCronograma[];sinFecha:number;bloqueadas:Concepto[];vencidas:TareaCronograma[];notas:string[]};

const plural=(n:number,uno:string,varios:string)=>`${n} ${n===1?uno:varios}`;

// Fecha que se muestra de un concepto: la misma con la que se decide si está vencido (fin, o inicio si no hay fin).
export const fechaConcepto=(i:Pick<Concepto,'inicio'|'fin'>)=>rangoItem(i)?.hasta??null;
export type TonoConcepto = 'listo'|'alerta'|'normal';
// Días que lleva vencido un concepto aplicable y no listo (criterio del Checklist: equipo instalado es listo); null si no está vencido.
export function diasVencido(i:Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'>,hoy:string):number|null {
 if(i.estado==='no_aplica'||marcaItem(i)==='listo')return null;
 const r=rangoItem(i);return r&&r.hasta<hoy?diasEntre(r.hasta,hoy):null;
}
export function tonoConcepto(i:Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'>,hoy:string):TonoConcepto {
 if(marcaItem(i)==='listo')return 'listo';
 return i.estado==='bloqueado'||diasVencido(i,hoy)!==null?'alerta':'normal';
}
export function notasConcepto(i:Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'|'notas'>,hoy:string):string[] {
 const n:string[]=[],d=diasVencido(i,hoy);
 if(i.estado==='bloqueado')n.push(i.notas?.trim()?`Bloqueada: ${i.notas.trim()}`:'Bloqueada');
 if(d!==null)n.push(`Vencida hace ${plural(d,'día','días')}`);
 if(i.tipo==='referencia')n.push('Referencia / lista de apoyo');
 return n;
}
export function porEtapa<T extends Pick<Concepto,'etapa'>>(items:T[]) {
 return (Object.keys(ETAPAS) as (keyof typeof ETAPAS)[]).map(clave=>({clave,nombre:ETAPAS[clave],items:items.filter(i=>i.etapa===clave)})).filter(g=>g.items.length>0);
}
function listaCorta(nombres:string[]) {
 if(nombres.length<=2)return nombres.join(' y ');
 return `${nombres.slice(0,2).join(', ')} y ${nombres.length-2} más`;
}

export function filasCronograma(items:Concepto[],hoy:string):FilaCronograma[] {
 return (Object.keys(ETAPAS) as (keyof typeof ETAPAS)[]).map(clave=>{
  const de=items.filter(i=>i.etapa===clave&&cuentaEnAvance(i));
  const tareas=de.flatMap(item=>{const r=rangoItem(item);if(!r)return [];
   return [{item,desde:r.desde,hasta:r.hasta,diasVencida:diasVencido(item,hoy)}];})
   .sort((a,b)=>a.desde.localeCompare(b.desde)||a.hasta.localeCompare(b.hasta)||a.item.nombre.localeCompare(b.item.nombre));
  const vencidas=tareas.filter(t=>t.diasVencida!==null).sort((a,b)=>b.diasVencida!-a.diasVencida!||a.item.nombre.localeCompare(b.item.nombre));
  const bloqueadas=de.filter(i=>i.estado==='bloqueado');
  const notas=[
   ...(bloqueadas.length?[`${plural(bloqueadas.length,'bloqueada','bloqueadas')}: ${listaCorta(bloqueadas.map(b=>b.nombre))}`]:[]),
   ...(vencidas.length?[plural(vencidas.length,'vencida','vencidas')]:[]),
  ];
  // Por etapa, el real es el promedio de puntos, igual que el % de la etapa en el Gantt.
  return {clave,nombre:ETAPAS[clave],avance:comparar(de,hoy,promedioPuntos),desde:tareas[0]?.desde??null,hasta:tareas.length?tareas.map(t=>t.hasta).sort().at(-1)!:null,
   tareas,sinFecha:de.length-tareas.length,bloqueadas,vencidas,notas};
 });
}

export type IndicadoresProyecto = {dias:DiasApertura;avance:Avance;vencidas:number;bloqueadas:number;aplicables:number;recepcion:number|null;recibidas:number;unidades:number;
 compras:{monto:number;presupuesto:number|null;excede:boolean;firme:boolean;sinPrecio:number}};

export function indicadoresProyecto(p:Pick<ProyectoApertura,'objetivo_hasta'|'presupuesto'>,items:ItemApertura[],hoy:string):IndicadoresProyecto {
 const r=indicadoresApertura(items,hoy),avance=avanceComparado(items,hoy),filas=filasCronograma(items,hoy),corte=cortePresupuesto(items),estimado=resumenApertura(items);
 const monto=corte?Math.round((corte.adquirido+corte.cotizado)*100)/100:estimado.cotizado;
 const presupuesto=corte?corte.total_sin_iva:p.presupuesto!==null&&Number(p.presupuesto)>0?Number(p.presupuesto):null;
 return {dias:diasParaApertura(p.objetivo_hasta,hoy,avance.real===100),avance,
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
  l.push({titulo:`Con fecha: avance de ${a.realConFecha} % contra ${a.esperado} % esperado a hoy`,
   texto:a.favorable==='no'
    ?`Faltan ${-a.variacion} puntos. ${peores.length===1?'La etapa más atrasada':'Las etapas más atrasadas'}: ${peores.map(f=>`${f.nombre} (${textoPts(f.avance.variacion!)})`).join(' y ')}.`
    :`Va al día (${textoPts(a.variacion)}).${mejor?` ${mejor.avance.variacion!>=0?'La etapa más adelantada es':'La que menos se atrasa es'} ${mejor.nombre} (${textoPts(mejor.avance.variacion!)}).`:''}`});
 }
 const vencidas=filas.flatMap(f=>f.vencidas),bloqueadas=filas.flatMap(f=>f.bloqueadas);
 if(vencidas.length||bloqueadas.length){
  // Un concepto vencido y bloqueado cuenta una vez: va con las vencidas y se aclara que también está bloqueado.
  const idsVencidas=new Set(vencidas.map(v=>v.item.id)),ambas=bloqueadas.filter(b=>idsVencidas.has(b.id)).length,soloBloq=bloqueadas.length-ambas;
  let titulo=vencidas.length?plural(vencidas.length,'tarea vencida','tareas vencidas'):'';
  if(ambas)titulo+=vencidas.length===1?', también bloqueada':`, ${ambas} también ${ambas===1?'bloqueada':'bloqueadas'}`;
  if(soloBloq)titulo+=titulo?`${ambas?',':''} y ${plural(soloBloq,'bloqueada','bloqueadas')}${ambas?' más':''}`:plural(soloBloq,'tarea bloqueada','tareas bloqueadas');
  const urgentes=new Map<string,string>();
  for(const v of [...vencidas].sort((x,y)=>y.diasVencida!-x.diasVencida!)){
   const b=v.item.estado==='bloqueado'?'bloqueada, ':'';urgentes.set(v.item.id,`${v.item.nombre} (${b}vencida hace ${plural(v.diasVencida!,'día','días')})`);
  }
  for(const b of bloqueadas)if(!urgentes.has(b.id))urgentes.set(b.id,`${b.nombre} (bloqueada)`);
  const lista=[...urgentes.values()].slice(0,3);
  l.push({titulo,texto:`Las más urgentes: ${lista.join(', ')}${urgentes.size>3?` y ${urgentes.size-3} más`:''}.`});
 }
 if(k.compras.presupuesto!==null){
  const c=k.compras;
  l.push({titulo:`Compras: ${pesos(c.monto)} ${c.firme?'con precio firme':'estimado'} de ${pesos(c.presupuesto!)} de presupuesto`,
   texto:c.excede?`Se pasa por ${pesos(c.monto-c.presupuesto!)}.`:c.sinPrecio?`${plural(c.sinPrecio,'concepto','conceptos')} sin precio o sin cantidad.`:'Todos los conceptos tienen precio y cantidad.'});
 }
 return l;
}

export type TarjetaPortada = {id:string;dias:DiasApertura;avance:Avance;vencidas:number;bloqueadas:number};
// Portada: por proyecto, días para abrir, avance contra esperado, vencidas y bloqueadas; y los totales de la franja.
export function resumenPortada(proyectos:Pick<ProyectoApertura,'id'|'objetivo_hasta'>[],items:(Concepto&{proyecto_id:string})[],hoy:string) {
 const tarjetas:Record<string,TarjetaPortada>={};
 for(const p of proyectos){
  const de=items.filter(i=>i.proyecto_id===p.id),avance=avanceComparado(de,hoy),aplicables=de.filter(cuentaEnAvance);
  // «Abierta» con la misma regla que el detalle: avance general al 100 % (todas las partidas con 1 punto).
  tarjetas[p.id]={id:p.id,dias:diasParaApertura(p.objetivo_hasta,hoy,avance.real===100),avance,
   vencidas:aplicables.filter(i=>diasVencido(i,hoy)!==null).length,bloqueadas:aplicables.filter(i=>i.estado==='bloqueado').length};
 }
 const lista=Object.values(tarjetas),porVenir=lista.filter(t=>t.dias.tipo==='faltan'||t.dias.tipo==='hoy').sort((a,b)=>a.dias.dias-b.dias.dias);
 return {tarjetas,enCurso:lista.filter(t=>t.dias.tipo!=='abierta').length,proxima:porVenir[0]?{id:porVenir[0].id,dias:porVenir[0].dias.dias}:null,atrasados:lista.filter(t=>t.avance.favorable==='no').length};
}
