/** Última semana cerrada antes de la semana del día operativo, siempre lunes a domingo. */
export function esSemanaRecoleccion(desde:string,hasta:string) {
 const inicio=new Date(`${desde}T00:00:00Z`),fin=new Date(`${hasta}T00:00:00Z`);
 return Number.isFinite(inicio.getTime())&&Number.isFinite(fin.getTime())&&inicio.toISOString().slice(0,10)===desde&&fin.toISOString().slice(0,10)===hasta&&inicio.getUTCDay()===1&&fin.getTime()-inicio.getTime()===6*86400000;
}
export function semanaRecoleccion(hoy:string) {
 const fecha=new Date(`${hoy}T00:00:00Z`),dia=(fecha.getUTCDay()+6)%7;
 fecha.setUTCDate(fecha.getUTCDate()-dia-1);
 const hasta=fecha.toISOString().slice(0,10);
 fecha.setUTCDate(fecha.getUTCDate()-6);
 return {desde:fecha.toISOString().slice(0,10),hasta};
}
/** Los saldos de bóveda son acumulados: se muestra el último, nunca se suman. */
export type CierreRecoleccion={id:string;fecha:string;efectivo:number;boveda_inicial:number;boveda_contado:number;retiros_dia:number;aperturas_dia:number;deposito_dia:number;gastos_boveda_dia:number};
export type DisponibleRecoleccion={saldo:number;fondo:number;reservado:number;salidas:number;disponible:number};
const centavos=(n:number)=>Math.round(n*100)/100;
export function resumirCierresRecoleccion(cierres:readonly CierreRecoleccion[],actual:DisponibleRecoleccion) {
 const unicos=new Map(cierres.map(c=>[c.id,c])),filas=[...unicos.values()].sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.id.localeCompare(b.id));
 const suma=(campo:keyof Pick<CierreRecoleccion,'efectivo'|'retiros_dia'|'aperturas_dia'|'deposito_dia'|'gastos_boveda_dia'>)=>centavos(filas.reduce((s,c)=>s+Number(c[campo]),0));
 return {cierres:filas,cantidad:filas.length,desde:filas[0]?.fecha??null,hasta:filas[filas.length-1]?.fecha??null,
  ventasEfectivo:suma('efectivo'),retiros:suma('retiros_dia'),aperturas:suma('aperturas_dia'),salidasEnCierres:suma('deposito_dia'),gastosYaDescontados:suma('gastos_boveda_dia'),
  bovedaInicial:filas.length?Number(filas[0].boveda_inicial):null,bovedaUltimoCierre:filas.length?Number(filas[filas.length-1].boveda_contado):null,
  // La disponibilidad viene del libro vigente, que ya descontó pagos y anulaciones.
  disponibleActual:Math.max(0,centavos(Math.min(Number(actual.disponible),Number(actual.saldo)-Number(actual.fondo)-Number(actual.reservado)-Number(actual.salidas))))};
}
