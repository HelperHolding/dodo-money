// Calendario de aperturas: semanas del mes, barras por carril y colores por etapa o por categoría.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {CATEGORIAS,ETAPAS,type CategoriaApertura,type ItemApertura} from './aperturas.ts';

export type Agrupacion = 'etapa'|'categoria'|'responsable';
export const esAgrupacion = (v:unknown):v is Agrupacion => v==='etapa'||v==='categoria'||v==='responsable';
export type ModoCalendario = 'mes'|'semana';
export const esModoCalendario = (v:unknown):v is ModoCalendario => v==='mes'||v==='semana';
// Enlaces viejos (cuadros, barras) y vacío caen a Mes, como Google.
export const modoCalendario = (v:unknown):ModoCalendario => v==='semana'?'semana':'mes';
// Los colores que se guardan en apertura_colores (por persona son automáticos).
export const esAgrupacionGuardable = (v:unknown):v is 'etapa'|'categoria' => v==='etapa'||v==='categoria';
export type ItemCalendario = Pick<ItemApertura,'id'|'clave'|'nombre'|'tipo'|'etapa'|'categoria'|'estado'|'responsable'|'inicio'|'fin'|'revision'|'responsable_id'>;
export type ColorGuardado = {agrupacion:string;clave:string;color:string};
export type Grupo = {clave:string;nombre:string;color:string;predeterminado:string};

// Predeterminados; administración los cambia en la tabla apertura_colores.
// Pastel de la paleta Dodo (naranja de marca, azul, rosa, aqua, violeta, turquesa); el texto encima siempre es oscuro.
export const COLORES_ETAPA:Record<keyof typeof ETAPAS,string> = {P1:"#ffd2bd",P2:"#c9ddf5",P3:"#f7cddc",P4:"#ffe3a8",P5:"#bfe8d6",P6:"#ddd0f5",P7:"#c3e6e6"};
export const COLORES_CATEGORIA:Record<CategoriaApertura|"sin",string> = {
 equipo_cocina:"#ffcfb8",mobiliario:"#e3d4f7",camara_fria:"#c7e0f7",puertas:"#e8d5c4",zoclos:"#e0dcd7",pisos:"#d6d3d1",acabados:"#ffe2b0",
 paneles:"#d7ebc4",contactos:"#f8cbd6",salidas_cable:"#c3e8e1",baja_tension:"#d0d4f7",iluminacion:"#fff0a8",plafones:"#e6e6e6",
 sanitarios:"#c4ecf3",senaletica_interior:"#f2cdf0",senaletica_fachada:"#ffd9bd",sin:"#e2e8f0",
};

export const esColor = (v:string) => /^#[0-9a-f]{6}$/i.test(v);
export const claveGrupo = (a:Agrupacion,i:Pick<ItemCalendario,'etapa'|'categoria'|'responsable'|'responsable_id'>) => a==='etapa'?i.etapa:a==='responsable'?claveResponsable(i):(i.categoria??'sin');

export function gruposCalendario(a:Agrupacion,guardados:ColorGuardado[]):Grupo[] {
 if(a==='responsable')return []; // por persona los arma personasDe() en el calendario
 const propio=new Map(guardados.filter(g=>g.agrupacion===a&&esColor(g.color)).map(g=>[g.clave,g.color.toLowerCase()]));
 const base:[string,string,string][]=a==='etapa'
  ?Object.entries(ETAPAS).map(([k,n])=>[k,`${k} · ${n}`,COLORES_ETAPA[k as keyof typeof ETAPAS]])
  :[...Object.entries(CATEGORIAS).map(([k,c]):[string,string,string]=>[k,c.nombre,COLORES_CATEGORIA[k as CategoriaApertura]]),['sin','Sin categoría',COLORES_CATEGORIA.sin]];
 return base.map(([clave,nombre,predeterminado])=>({clave,nombre,predeterminado,color:propio.get(clave)??predeterminado}));
}

// Texto negro o blanco según la luminancia del fondo (WCAG), para que el nombre se lea sobre cualquier color.
export function textoSobre(hex:string):'#111111'|'#ffffff' {
 const canal=(i:number)=>{const c=parseInt(hex.slice(i,i+2),16)/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
 const l=0.2126*canal(1)+0.7152*canal(3)+0.0722*canal(5);
 return (l+0.05)/0.05>=1.05/(l+0.05)?'#111111':'#ffffff';
}

const DIA=86_400_000;
const aFecha=(ms:number)=>new Date(ms).toISOString().slice(0,10);
const aMs=(d:string)=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)));
export const esMes = (v:unknown):v is string => typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function moverMesTexto(mes:string,pasos:number) {
 const total=Number(mes.slice(0,4))*12+Number(mes.slice(5,7))-1+pasos;
 return `${Math.floor(total/12)}-${String(total%12+1).padStart(2,'0')}`;
}
export const nombreMes = (mes:string) => new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(aMs(`${mes}-01`)));

export type Celda = {dia:string;delMes:boolean};
// Semanas completas de lunes a domingo; los días de los meses vecinos se marcan para atenuarlos.
export function semanasCalendario(mes:string):Celda[][] {
 const primero=aMs(`${mes}-01`),hueco=(new Date(primero).getUTCDay()+6)%7;
 const dias=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).getUTCDate();
 const total=Math.ceil((hueco+dias)/7)*7;
 const celdas=Array.from({length:total},(_,i)=>{const dia=aFecha(primero+(i-hueco)*DIA);return {dia,delMes:dia.startsWith(mes)};});
 return Array.from({length:total/7},(_,s)=>celdas.slice(s*7,s*7+7));
}

// Con una sola fecha capturada, la tarea ocupa ese día.
export const rangoItem = (i:Pick<ItemCalendario,'inicio'|'fin'>) => {const desde=i.inicio??i.fin,hasta=i.fin??i.inicio;return desde&&hasta?{desde,hasta:hasta<desde?desde:hasta}:null;};
export const cubreDia = (i:Pick<ItemCalendario,'inicio'|'fin'>,dia:string) => {const r=rangoItem(i);return r!==null&&r.desde<=dia&&dia<=r.hasta;};
// Lo que el calendario muestra: con fecha y aplicable.
export const enCalendario = (i:Pick<ItemCalendario,'inicio'|'fin'|'estado'>) => i.estado!=='no_aplica'&&rangoItem(i)!==null;

export type Barra<T> = {item:T;col:number;span:number;carril:number;empiezaAntes:boolean;sigueDespues:boolean};
// Acomoda las tareas de una semana en carriles: cada una en el primer carril libre, de la que empieza antes a la más larga.
export function barrasSemana<T extends Pick<ItemCalendario,'inicio'|'fin'|'nombre'>>(items:T[],semana:Celda[]) {
 const ini=semana[0].dia,fin=semana[semana.length-1].dia;
 const enSemana=items.flatMap(item=>{const r=rangoItem(item);return r&&r.desde<=fin&&r.hasta>=ini?[{item,r}]:[];})
  .sort((a,b)=>a.r.desde.localeCompare(b.r.desde)||b.r.hasta.localeCompare(a.r.hasta)||a.item.nombre.localeCompare(b.item.nombre));
 const ocupado:boolean[][]=[],barras:Barra<T>[]=[];
 for(const {item,r} of enSemana){
  const col=r.desde<ini?0:Math.round((aMs(r.desde)-aMs(ini))/DIA),ult=r.hasta>fin?6:Math.round((aMs(r.hasta)-aMs(ini))/DIA);
  let carril=0;while(ocupado[carril]?.slice(col,ult+1).some(Boolean))carril++;
  ocupado[carril]??=Array(7).fill(false);for(let c=col;c<=ult;c++)ocupado[carril][c]=true;
  barras.push({item,col,span:ult-col+1,carril,empiezaAntes:r.desde<ini,sigueDespues:r.hasta>fin});
 }
 return {barras,carriles:ocupado.length};
}

// Cambio de fechas: conserva todo lo demás del registro (mismo formato que actualizar_apertura_item).
export function validarFechas(inicio:string,fin:string) {
 const fecha=/^\d{4}-\d{2}-\d{2}$/;
 if(!inicio&&!fin)return null;
 if(!inicio||!fin)return 'Pon la fecha de inicio y la de fin, o deja las dos vacías para quitarlas.';
 if(!fecha.test(inicio)||!fecha.test(fin))return 'Fecha inválida.';
 if(fin<inicio)return 'La fecha de fin no puede ser anterior al inicio.';
 return null;
}
export function datosFechas(i:ItemApertura,inicio:string,fin:string) {
 const v=(x:unknown)=>x===null||x===undefined?'':String(x);
 return {estado:i.estado,responsable:v(i.responsable),inicio,fin,cantidad:v(i.cantidad),recibido:v(i.recibido),precio:v(i.precio),
  evidencia:v(i.evidencia),notas:v(i.notas),orden_id:v(i.orden_id),factura_id:v(i.factura_id)};
}

// ── Responsables (HD-7/HD-8) ──
// El responsable es texto libre: se junta por persona sin acentos ni mayúsculas, sin lo que va entre paréntesis.
// Con "A → B desde 28-nov" cuenta para quien recibe la actividad (B).
export type Persona = {clave:string;nombre:string;iniciales:string;color:string};
export const SIN_ASIGNAR = {clave:'sin',nombre:'Sin asignar',color:'#a0a0a0'} as const;
// Paleta tipo Google Calendar, un color por persona (en orden alfabético, así no cambia al filtrar).
// Sin el tomate (#d50000), para no confundirse con el rojo de alerta.
export const COLORES_PERSONA = ['#e67c73','#f4511e','#f6bf26','#33b679','#0b8043','#039be5','#3f51b5','#7986cb','#8e24aa','#616161'];
const sinAcentos=(t:string)=>t.normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('es-MX');
export function nombrePersona(texto:string|null|undefined):string {
 let t=(texto??'').split('→').at(-1)!;
 t=t.replace(/\([^)]*\)?/g,' ').replace(/\s+desde\b.*$/i,'').replace(/\s+/g,' ').trim();
 return t;
}
export const clavePersona = (texto:string|null|undefined) => {const n=nombrePersona(texto);return n?sinAcentos(n):SIN_ASIGNAR.clave;};
// Responsables del catálogo (HD-27): con responsable_id se agrupa por id (`r:<id>`); sin él (registros viejos, hasta correr la limpieza), por el texto.
export type ResponsableCatalogo = {id:string;nombre:string};
type ConResponsable = {responsable:string|null;responsable_id?:string|null};
export const claveResponsable = (i:ConResponsable) => i.responsable_id?`r:${i.responsable_id}`:clavePersona(i.responsable);
const nombreDe = (i:ConResponsable) => i.responsable_id?(i.responsable??'').replace(/\s+/g,' ').trim()||'Sin nombre':nombrePersona(i.responsable);
// Pone el nombre del catálogo a lo que tiene id y une al catálogo el texto viejo que coincide con un solo nombre, para que nadie salga dos veces.
// Sin catálogo (migración pendiente o error al leerlo) deja todo igual.
export function conCatalogo<T extends ConResponsable>(items:T[],catalogo:readonly ResponsableCatalogo[]|null):T[] {
 if(!catalogo?.length)return items;
 const porId=new Map(catalogo.map(r=>[r.id,r.nombre]));
 const porClave=new Map<string,ResponsableCatalogo|null>();
 for(const r of catalogo){const c=clavePersona(r.nombre);porClave.set(c,porClave.has(c)?null:r);}
 return items.map(i=>{
  if(i.responsable_id){const n=porId.get(i.responsable_id);return n?{...i,responsable:n}:i;}
  if(!nombrePersona(i.responsable))return i;
  const r=porClave.get(clavePersona(i.responsable));
  return r?{...i,responsable_id:r.id,responsable:r.nombre}:i;
 });
}

const CONECTORES=new Set(['y','de','del','la','las','los','e']);
const palabras=(n:string)=>n.split(/\s+/).filter(p=>p&&!CONECTORES.has(sinAcentos(p))&&/\p{L}/u.test(p));
function inicialesBase(n:string) {const p=palabras(n);return (p.length>1?p[0][0]+p[1][0]:(p[0]??'?').slice(0,2)).toLocaleUpperCase('es-MX');}
function inicialesLargas(n:string) {
 const p=palabras(n),may=(t:string)=>t.toLocaleUpperCase('es-MX');
 return p.length>1?may(p[0][0])+p[0].slice(1,2)+may(p[1][0]):may((p[0]??'?')[0])+(p[0]??'').slice(1,3);
}

// Personas de una lista de tareas, con iniciales únicas (José Villa = JoV y Julio Verdeja = JuV) y color estable.
export function personasDe(items:Pick<ItemCalendario,'responsable'|'responsable_id'>[]):Persona[] {
 const nombres=new Map<string,string>();
 for(const i of items){const c=claveResponsable(i);if(c!==SIN_ASIGNAR.clave&&!nombres.has(c))nombres.set(c,nombreDe(i));}
 // Por nombre sin acentos y no por clave: con el catálogo la clave es un id.
 const claves=[...nombres.keys()].sort((a,b)=>sinAcentos(nombres.get(a)!).localeCompare(sinAcentos(nombres.get(b)!),'es-MX')||a.localeCompare(b));
 const base=new Map(claves.map(c=>[c,inicialesBase(nombres.get(c)!)]));
 // Se comparan sin acentos: "CE" y "CÉ" se confunden en pantalla.
 const vistas=[...base.values()].map(sinAcentos);
 const repetidas=new Set([...base.values()].filter(v=>vistas.indexOf(sinAcentos(v))!==vistas.lastIndexOf(sinAcentos(v))));
 const usadas=new Set<string>();
 const personas=claves.map((clave,k)=>{
  const nombre=nombres.get(clave)!;let ini=repetidas.has(base.get(clave)!)?inicialesLargas(nombre):base.get(clave)!;
  for(let n=2;usadas.has(sinAcentos(ini));n++)ini=`${ini.replace(/\d+$/,'')}${n}`;usadas.add(sinAcentos(ini));
  return {clave,nombre,iniciales:ini,color:COLORES_PERSONA[k%COLORES_PERSONA.length]};
 });
 if(items.some(i=>claveResponsable(i)===SIN_ASIGNAR.clave))personas.push({...SIN_ASIGNAR,iniciales:'—'});
 return personas;
}

// "Solo actividades": oculta equipo, referencias y validaciones técnicas.
export const esActividad = (i:Pick<ItemCalendario,'tipo'>) => i.tipo==='actividad';
export type Momento = 'solo'|'empieza'|'continua'|'termina';
export const MOMENTOS:Record<Momento,string> = {solo:'Solo este día',empieza:'Empieza',continua:'Continúa',termina:'Termina'};
export function momentoEnDia(i:Pick<ItemCalendario,'inicio'|'fin'>,dia:string):Momento|null {
 const r=rangoItem(i);if(!r||dia<r.desde||dia>r.hasta)return null;
 return r.desde===r.hasta?'solo':dia===r.desde?'empieza':dia===r.hasta?'termina':'continua';
}

// Lo de un día agrupado por responsable, en el orden de la lista de personas; dentro, por nombre.
export function diaPorPersona<T extends ItemCalendario>(items:T[],dia:string,personas:Persona[]) {
 const del=items.filter(i=>enCalendario(i)&&cubreDia(i,dia));
 return personas.map(persona=>({persona,tareas:del.filter(i=>claveResponsable(i)===persona.clave)
  .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es-MX')).map(item=>({item,momento:momentoEnDia(item,dia)!}))})).filter(g=>g.tareas.length>0);
}
// Cuántas tareas tiene cada persona un día (para el cuadro del mes).
export const conteoDia = (items:ItemCalendario[],dia:string,personas:Persona[]) => diaPorPersona(items,dia,personas).map(g=>({persona:g.persona,n:g.tareas.length}));

// Semana de lunes a domingo que contiene un día.
export const esDia = (v:unknown):v is string => typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(aMs(v))&&aFecha(aMs(v))===v;
export function semanaDe(dia:string):Celda[] {
 const ms=aMs(dia),lunes=ms-((new Date(ms).getUTCDay()+6)%7)*DIA;
 return Array.from({length:7},(_,i)=>{const d=aFecha(lunes+i*DIA);return {dia:d,delMes:d.slice(0,7)===dia.slice(0,7)};});
}
export const moverDias = (dia:string,dias:number) => aFecha(aMs(dia)+dias*DIA);
export const tituloSemana = (semana:Celda[]) => {
 const f=(d:string,mes:boolean)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',...(mes?{month:'short'}:{}),timeZone:'UTC'}).format(new Date(aMs(d)));
 const a=semana[0].dia,b=semana[6].dia;return `${f(a,a.slice(5,7)!==b.slice(5,7))} – ${f(b,true)} ${b.slice(0,4)}`;
};

// Sugerencias para el campo Responsable: usuarios activos y los nombres que ya se usan en el proyecto, sin repetir.
// Sigue siendo texto libre: se puede asignar a alguien sin usuario (proveedor, agencia).
export function sugerenciasResponsable(usuarios:(string|null)[],usados:(string|null)[]) {
 const vistos=new Map<string,string>();
 for(const n of [...usuarios.map(u=>(u??'').replace(/\s+/g,' ').trim()),...usados.map(nombrePersona)]){if(!n)continue;const c=clavePersona(n);if(!vistos.has(c))vistos.set(c,n);}
 return [...vistos.values()].sort((a,b)=>a.localeCompare(b,'es-MX'));
}

// ── Estilo Google Calendar ──
// Mini mes del panel: siempre 6 semanas, para que no salte de alto.
export function miniMes(mes:string):Celda[][] {
 const s=semanasCalendario(mes);
 while(s.length<6){const ult=s.at(-1)!.at(-1)!.dia;s.push(Array.from({length:7},(_,i)=>({dia:moverDias(ult,i+1),delMes:false})));}
 return s;
}
export const esDeUnDia = (i:Pick<ItemCalendario,'inicio'|'fin'>) => {const r=rangoItem(i);return r!==null&&r.desde===r.hasta;};
export const filtrarOcultos = <T extends Pick<ItemCalendario,'responsable'|'responsable_id'>>(items:T[],ocultos:ReadonlySet<string>) => items.filter(i=>!ocultos.has(claveResponsable(i)));
// Tareas de cada persona en el periodo (el número junto a su casilla).
export function conteoPorPersona(items:Pick<ItemCalendario,'responsable'|'responsable_id'|'inicio'|'fin'|'estado'>[],desde:string,hasta:string):Record<string,number> {
 const r:Record<string,number>={};
 for(const i of items){if(!enCalendario(i))continue;const g=rangoItem(i)!;if(g.desde>hasta||g.hasta<desde)continue;const c=claveResponsable(i);r[c]=(r[c]??0)+1;}
 return r;
}
// Cuántas barras no caben en cada día de la semana (para «N más»).
export const ocultasPorDia = (barras:Barra<unknown>[],semana:Celda[],limite:number) =>
 semana.map((_,col)=>barras.filter(b=>b.carril>=limite&&b.col<=col&&col<b.col+b.span).length);
export const tituloPeriodo = (modo:ModoCalendario,mes:string,semana:string) => modo==='mes'?nombreMes(mes):tituloSemana(semanaDe(semana));
// Personas ocultas guardadas en el navegador: JSON de claves; se ignora lo roto y a quien ya no está.
export function leerOcultos(texto:string|null,claves:readonly string[]):Set<string> {
 try{const v=JSON.parse(texto??'[]');return new Set(Array.isArray(v)?v.filter((c):c is string=>typeof c==='string'&&claves.includes(c)):[]);}catch{return new Set();}
}
