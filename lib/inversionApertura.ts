// @ts-expect-error Node strip-types requiere extensión explícita.
import {pesos} from './formato.ts';
export type DetalleInversion={id:string;mayor:string;fecha:string;proveedor:string;concepto:string;tipo:string;categoria:string;monto:number;fuente:string;nota:string|null};
export type FuenteInversion={id:string;sucursal_id:string;nombre:string;total:number;pagador_fuente:string;fecha:string;datos:{detalles:DetalleInversion[]};sucursales?:{nombre:string}|null};
export function resumirInversion(detalles:DetalleInversion[]){
 const grupos=new Map<string,number>();let centavos=0;
 for(const d of detalles){const n=Math.round(Number(d.monto)*100);centavos+=n;grupos.set(d.tipo,(grupos.get(d.tipo)??0)+n);}
 return {total:centavos/100,grupos:[...grupos].map(([tipo,n])=>({tipo,monto:n/100}))};
}

export type AnalisisInversion={total:number;movimientos:number;grupos:{tipo:string;monto:number;pct:number;detalles:DetalleInversion[]}[];diferencia:number;cuadra:boolean;lectura:{titulo:string;texto:string}[]};
// Inversión en estilo Akton: clasificaciones de mayor a menor, cuadre contra el total de la fuente y lectura.
export function analisisInversion(detalles:DetalleInversion[],totalFuente:number):AnalisisInversion {
 const r=resumirInversion(detalles),total=r.total;
 const grupos=r.grupos.map(g=>({...g,pct:total?Math.round(g.monto/total*100):0,detalles:detalles.filter(x=>x.tipo===g.tipo)})).sort((a,b)=>b.monto-a.monto||a.tipo.localeCompare(b.tipo));
 const diferencia=Math.round((total-Number(totalFuente))*100)/100,cuadra=Math.abs(diferencia)<=0.01,lectura:{titulo:string;texto:string}[]=[];
 if(grupos.length){const top=grupos.slice(0,3).map(g=>`${g.tipo} ${pesos(g.monto)} (${g.pct} %)`);
  lectura.push({titulo:`Donde más se invirtió: ${grupos[0].tipo}`,texto:`${top.length>1?`${top.slice(0,-1).join(', ')} y ${top.at(-1)}`:top[0]}.`});}
 if(!cuadra)lectura.push({titulo:'El detalle no cuadra con la fuente',texto:`El detalle suma ${pesos(total)} y la fuente ${pesos(Number(totalFuente))}: diferencia de ${pesos(Math.abs(diferencia))}.`});
 return {total,movimientos:detalles.length,grupos,diferencia,cuadra,lectura};
}
