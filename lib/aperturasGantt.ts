// Gantt de aperturas: una barra por etapa (de la primera fecha a la última de sus tareas) con su avance, y las tareas de cada etapa.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {ETAPAS,marcaItem,promedioPuntos,type ItemApertura,type MarcaChecklist} from './aperturas.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {rangoItem} from './aperturasCalendario.ts';

export type TareaGantt = Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'inicio'|'fin'|'responsable'>;
export type TareaConFechas<T> = {item:T;desde:string;hasta:string;marca:MarcaChecklist;vencida:boolean};
export type EtapaGantt<T> = {clave:keyof typeof ETAPAS;nombre:string;conceptos:number;listos:number;porcentaje:number|null;desde:string|null;hasta:string|null;
 bloqueados:number;vencidos:number;tareas:TareaConFechas<T>[];sinFecha:number};

// Mismo criterio que el Checklist: sin no aplica, y el equipo y las referencias por validar quedan fuera.
export const cuentaEnAvance = (i:Pick<ItemApertura,'tipo'|'estado'>) => i.estado!=='no_aplica'&&!((i.tipo==='equipo'||i.tipo==='referencia')&&i.estado==='por_validar');
// Listo con el criterio del Checklist (incluye equipo instalado): lo listo no sale como vencido.

export function ganttEtapas<T extends TareaGantt>(items:T[],hoy:string):EtapaGantt<T>[] {
 return (Object.keys(ETAPAS) as (keyof typeof ETAPAS)[]).map(clave=>{
  const de=items.filter(i=>i.etapa===clave&&cuentaEnAvance(i));
  const listos=de.filter(i=>marcaItem(i)==='listo').length;
  const tareas=de.flatMap(item=>{const r=rangoItem(item);return r?[{item,desde:r.desde,hasta:r.hasta,marca:marcaItem(item),vencida:r.hasta<hoy&&marcaItem(item)!=='listo'}]:[];})
   .sort((a,b)=>a.desde.localeCompare(b.desde)||a.hasta.localeCompare(b.hasta)||a.item.nombre.localeCompare(b.item.nombre));
  // El % de la etapa es el promedio de puntos de sus partidas (misma escala que el avance general).
  return {clave,nombre:ETAPAS[clave],conceptos:de.length,listos,porcentaje:promedioPuntos(de),
   desde:tareas.length?tareas[0].desde:null,hasta:tareas.length?tareas.map(t=>t.hasta).sort().at(-1)!:null,
   bloqueados:de.filter(i=>i.estado==='bloqueado').length,vencidos:tareas.filter(t=>t.vencida).length,tareas,sinFecha:de.length-tareas.length};
 });
}
const DIA=86_400_000;
const aMs=(d:string)=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)));
const aFecha=(ms:number)=>new Date(ms).toISOString().slice(0,10);
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

export type Marca = {dia:string;etiqueta:string;pos:number};
export type Escala = {desde:string;hasta:string;pos:(dia:string)=>number;ancho:(desde:string,hasta:string)=>number;marcas:Marca[];porMes:boolean};
// Escala que siempre cabe en el ancho disponible: posiciones en %, de 0 a 100. Hasta ~4 meses marca semanas (lunes); más, meses.
export function escalaGantt(fechas:(string|null|undefined)[]):Escala|null {
 const validas=fechas.filter((f):f is string=>!!f&&/^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
 if(!validas.length)return null;
 const inicio=aMs(validas[0]),fin=aMs(validas.at(-1)!);
 // Del lunes de la primera semana al domingo de la última, para que las marcas caigan en bordes.
 const desdeMs=inicio-((new Date(inicio).getUTCDay()+6)%7)*DIA,hastaMs=fin+((7-new Date(fin).getUTCDay())%7)*DIA;
 const total=(hastaMs-desdeMs)/DIA+1;
 const pos=(dia:string)=>Math.min(100,Math.max(0,(aMs(dia)-desdeMs)/DIA/total*100));
 const ancho=(a:string,b:string)=>Math.max(0,Math.min(100,((Math.min(aMs(b),hastaMs)-Math.max(aMs(a),desdeMs))/DIA+1)/total*100));
 const porMes=total>120,marcas:Marca[]=[];
 if(porMes){
  const d=new Date(desdeMs);let m=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);
  while(m<=hastaMs){const f=aFecha(m),dt=new Date(m);if(m>=desdeMs)marcas.push({dia:f,etiqueta:`${MESES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`,pos:pos(f)});m=Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,1);}
 }else{
  for(let m=desdeMs;m<=hastaMs;m+=7*DIA){const f=aFecha(m),dt=new Date(m);marcas.push({dia:f,etiqueta:`${dt.getUTCDate()} ${MESES[dt.getUTCMonth()]}`,pos:pos(f)});}
 }
 return {desde:aFecha(desdeMs),hasta:aFecha(hastaMs),pos,ancho,marcas,porMes};
}
