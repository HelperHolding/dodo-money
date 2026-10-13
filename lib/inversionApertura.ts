export type DetalleInversion={id:string;mayor:string;fecha:string;proveedor:string;concepto:string;tipo:string;categoria:string;monto:number;fuente:string;nota:string|null};
export type FuenteInversion={id:string;sucursal_id:string;nombre:string;total:number;pagador_fuente:string;fecha:string;datos:{detalles:DetalleInversion[]};sucursales?:{nombre:string}|null};
export function resumirInversion(detalles:DetalleInversion[]){
 const grupos=new Map<string,number>();let centavos=0;
 for(const d of detalles){const n=Math.round(Number(d.monto)*100);centavos+=n;grupos.set(d.tipo,(grupos.get(d.tipo)??0)+n);}
 return {total:centavos/100,grupos:[...grupos].map(([tipo,n])=>({tipo,monto:n/100}))};
}
