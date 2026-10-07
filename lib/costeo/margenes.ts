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
