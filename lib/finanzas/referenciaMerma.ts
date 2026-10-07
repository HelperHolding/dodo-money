import type {ModeloBOM} from "../costeo/bom.ts";
// @ts-expect-error El ejecutor nativo de pruebas de Node necesita la extensión .ts.
import {nombreDodo,normalizar} from "../costeo/bom.ts";
import type {MermaDodo} from "./mermasDodo";
export type VersionBOM={id:string;vigente_desde:string;modelo:ModeloBOM;archivo:string;actualizado_en:string};
export function referenciaBOM(r:MermaDodo,versiones:readonly VersionBOM[]) {
 const v=[...versiones].sort((a,b)=>b.vigente_desde.localeCompare(a.vigente_desde)||b.actualizado_en.localeCompare(a.actualizado_en)||b.id.localeCompare(a.id)).find(v=>v.vigente_desde<=r.fecha);
 if(!v)return null;
 if(r.tipo==="producto") {
  const recetas=v.modelo.recetas.filter(c=>normalizar(nombreDodo(c.nombre))===normalizar(r.nombre));
  if(recetas.length!==1||recetas[0].costo===null)return null;
  return {nombre:recetas[0].nombre,precio:recetas[0].costo,unidad:"pieza",merma:null,archivo:v.archivo,version:v.id};
 }
 const coincide=(nombre:string)=>{const base=nombre.replace(/\([^)]*\)/g,"");const opciones=[nombre,base,...[...nombre.matchAll(/\(([^)]*)\)/g)].map(m=>m[1])];return opciones.some(n=>normalizar(n)===normalizar(r.nombre));};
 const insumos=v.modelo.insumos.filter(i=>coincide(i.nombre));
 if(insumos.length!==1||insumos[0].precio===null)return null;
 const i=insumos[0];return {nombre:i.nombre,precio:i.precio,unidad:i.unidad??"unidad pendiente",merma:i.merma,archivo:v.archivo,version:v.id};
}
