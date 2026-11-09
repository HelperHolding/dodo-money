// Calendario de aperturas: semanas del mes, barras por carril y colores por etapa o por categoría.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {CATEGORIAS,ETAPAS,type CategoriaApertura,type ItemApertura} from './aperturas.ts';

export type Agrupacion = 'etapa'|'categoria';
export const esAgrupacion = (v:unknown):v is Agrupacion => v==='etapa'||v==='categoria';
export type ItemCalendario = Pick<ItemApertura,'id'|'clave'|'nombre'|'tipo'|'etapa'|'categoria'|'estado'|'responsable'|'inicio'|'fin'|'revision'>;
export type ColorGuardado = {agrupacion:string;clave:string;color:string};
export type Grupo = {clave:string;nombre:string;color:string;predeterminado:string};

// Predeterminados; administración los cambia en la tabla apertura_colores.
export const COLORES_ETAPA:Record<keyof typeof ETAPAS,string> = {P1:'#2563eb',P2:'#7c3aed',P3:'#db2777',P4:'#ea580c',P5:'#ca8a04',P6:'#16a34a',P7:'#0891b2'};
export const COLORES_CATEGORIA:Record<CategoriaApertura|'sin',string> = {
 equipo_cocina:'#dc2626',mobiliario:'#9333ea',camara_fria:'#0284c7',puertas:'#92400e',zoclos:'#78716c',pisos:'#57534e',acabados:'#d97706',
 paneles:'#65a30d',contactos:'#e11d48',salidas_cable:'#0d9488',baja_tension:'#4f46e5',iluminacion:'#eab308',plafones:'#a3a3a3',
 sanitarios:'#06b6d4',senaletica_interior:'#c026d3',senaletica_fachada:'#f97316',sin:'#94a3b8',
};

export const esColor = (v:string) => /^#[0-9a-f]{6}$/i.test(v);
export const claveGrupo = (a:Agrupacion,i:Pick<ItemCalendario,'etapa'|'categoria'>) => a==='etapa'?i.etapa:(i.categoria??'sin');

export function gruposCalendario(a:Agrupacion,guardados:ColorGuardado[]):Grupo[] {
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
