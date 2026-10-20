/** Margen bruto sobre venta sin IVA; el costo vigente ya incluye sus periféricos. */
export function margenProducto(precio:number|null,costo:number|null,ivaPct=16) {
 if(precio===null||costo===null||!Number.isFinite(precio)||!Number.isFinite(costo)||precio<=0||costo<0||!Number.isFinite(ivaPct)||ivaPct<0)return null;
 const neto=precio/(1+ivaPct/100),utilidad=neto-costo;
 return {neto,utilidad,margenPct:utilidad/neto*100,costoPct:costo/neto*100};
}
/** Precio con IVA necesario para el margen sobre venta; no es aumento sobre costo. */
export function precioParaMargen(costo:number|null,margenPct:number,ivaPct=16) {
 if(costo===null||!Number.isFinite(costo)||costo<0||!Number.isFinite(margenPct)||margenPct<0||margenPct>=100||!Number.isFinite(ivaPct)||ivaPct<0)return null;
 return Math.ceil(costo/(1-margenPct/100)*(1+ivaPct/100)*100-1e-8)/100;
}
/** Margen después de la comisión del canal, que se cobra sobre el precio con IVA (así la define el P&L para Rappi). */
export function margenConComision(precio:number|null,costo:number|null,comisionPct:number,ivaPct=16) {
 const m=margenProducto(precio,costo,ivaPct);
 if(!m||precio===null||!Number.isFinite(comisionPct)||comisionPct<0||comisionPct>=100)return null;
 const comision=precio*comisionPct/100,utilidad=m.utilidad-comision;
 return {neto:m.neto,comision,utilidad,margenPct:utilidad/m.neto*100};
}
/** Precio con IVA para el margen deseado después de la comisión sobre el precio con IVA; null si no es alcanzable. */
export function precioParaMargenConComision(costo:number|null,margenPct:number,comisionPct:number,ivaPct=16) {
 if(costo===null||!Number.isFinite(costo)||costo<0||!Number.isFinite(margenPct)||margenPct<0||margenPct>=100||!Number.isFinite(comisionPct)||comisionPct<0||comisionPct>=100||!Number.isFinite(ivaPct)||ivaPct<0)return null;
 const divisor=(1-margenPct/100)/(1+ivaPct/100)-comisionPct/100;
 return divisor>0?Math.ceil(costo/divisor*100-1e-8)/100:null;
}
