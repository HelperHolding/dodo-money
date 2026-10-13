import type { ItemApertura } from "./aperturas";
export type CorteApertura={fecha:string;fuente:string;total_sin_iva:number;total_con_iva:number;adquirido:number;cotizado:number;supuesto:number;desglose:{concepto:string;adquirido:number;cotizado:number;supuesto:number;total:number}[]};
export function cortePresupuesto(items:ItemApertura[]):CorteApertura|null {
  const registro=items.find(i=>i.clave==="PRE26-CORTE");
  if(!registro)return null;
  const c=registro.original as unknown as CorteApertura;
  if(!Array.isArray(c.desglose)||typeof c.fecha!=="string"||typeof c.fuente!=="string"||
    ![c.total_sin_iva,c.total_con_iva,c.adquirido,c.cotizado,c.supuesto].every(n=>Number.isFinite(n)&&n>=0)||c.total_sin_iva<=0)return null;
  return c;
}
