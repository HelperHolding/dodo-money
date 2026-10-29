// @ts-expect-error Node strip-types requiere extensión explícita.
import {buscarAproximado} from '../busquedaAproximada.ts';
// @ts-expect-error Extensión explícita para las pruebas con Node strip-types.
import {margenProducto,margenConComision} from "./margenes.ts";
export type FilaCosteo={id:number;nombre:string;categoria:string;tamano:string;costo:number|null;desde:string|null;fuente:string|null;nota:string|null;pos:number|null;rappi:number|null;rappiFecha:string|null;rappiOficial:boolean;bom:boolean;costoBOM:number|null;insumos:string[]};
export type FiltroCosteo={q?:string;categoria?:string;tamano?:string;rapido?:string;canal?:string;umbral?:string;agrupar?:string;orden?:string;direccion?:string;min?:string;max?:string;posMin?:string;posMax?:string;rappiMin?:string;rappiMax?:string;margenMin?:string;margenMax?:string};
/** canal: "pos" (default), "rappi" (bruto) o "rappi-comision" (después de la comisión Rappi vigente, en %). */
export const margenFila=(p:FilaCosteo,canal?:string,comisionRappi:number|null=0)=>(canal==="rappi-comision"?(comisionRappi===null?null:margenConComision(p.rappi,p.costo,comisionRappi)):margenProducto(canal==="rappi"?p.rappi:p.pos,p.costo))?.margenPct??null;
const rango=(n:number|null,min?:string,max?:string)=>{const limites=[min,max].map(x=>x?.trim()?Number(x):null);return limites.every(x=>x===null||Number.isFinite(x))&&(limites.every(x=>x===null)||(n!==null&&(limites[0]===null||n>=limites[0])&&(limites[1]===null||n<=limites[1])));};
export function filtrarCosteo(filas:readonly FilaCosteo[],f:FiltroCosteo,comisionRappi:number|null=0){
const umbral=f.umbral?.trim()?Number(f.umbral):60;
const resultado=filas.filter(p=>{const margen=margenFila(p,f.canal,comisionRappi);return (!f.categoria||p.categoria===f.categoria)&&(!f.tamano||p.tamano===f.tamano)&&rango(p.costo,f.min,f.max)&&rango(p.pos,f.posMin,f.posMax)&&rango(p.rappi,f.rappiMin,f.rappiMax)&&rango(margen,f.margenMin,f.margenMax)&&(!f.rapido||(f.rapido==="sin-costo"?p.costo===null:f.rapido==="sin-categoria"?p.categoria==="Sin categoría":f.rapido==="sin-rappi"?p.rappi===null:f.rapido==="lista-rappi"?p.rappiOficial:f.rapido==="margen-bajo"?margen!==null&&margen<umbral:f.rapido==="diferencia"?p.costo!==null&&p.costoBOM!==null&&Math.abs(p.costo-p.costoBOM)>.011:true));});
const valor=(p:FilaCosteo):string|number|null=>f.orden==="costo"?p.costo:f.orden==="pos"?p.pos:f.orden==="rappi"?p.rappi:f.orden==="margen"?margenFila(p,"pos"):f.orden==="margenRappi"?margenFila(p,"rappi-comision",comisionRappi):f.orden==="id"?p.id:f.orden==="categoria"?p.categoria:f.orden==="tamano"?p.tamano:f.orden==="desde"?p.desde:p.nombre;
const ordenadas=resultado.sort((a,b)=>{const x=valor(a),y=valor(b);if(x===null||y===null)return x===y?a.id-b.id:x===null?1:-1;return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"es",{numeric:true}))*(f.direccion==="desc"?-1:1)||a.id-b.id;});
const coincidencias=buscarAproximado(ordenadas,f.q??"",p=>({nombres:[p.nombre,...p.insumos],codigos:[String(p.id)]}));
const ids=new Set(coincidencias.map(p=>p.id));
return f.orden?ordenadas.filter(p=>ids.has(p.id)):coincidencias;
}
export function agruparCosteo(filas:readonly FilaCosteo[],por?:string){
const grupos=new Map<string,FilaCosteo[]>();for(const p of filas){const nombre=por==="categoria"?p.categoria:por==="tamano"?p.tamano:por==="bom"?p.bom?"Con BOM":"Sin BOM":por==="costo"?p.costo===null?"Sin costo":"Con costo":"Productos";grupos.set(nombre,[...(grupos.get(nombre)??[]),p]);}return [...grupos].map(([nombre,filas])=>({nombre,filas}));
}
