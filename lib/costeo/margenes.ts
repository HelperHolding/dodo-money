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
/** Comisión de terminal para costear POS, en % del precio con IVA: la tasa NetPay (Amex/internacional en su parte) solo sobre la parte de la venta fuera de Rappi cobrada con tarjeta. Tasas en fracción, como pl_parametros. null sin ventas. */
export function comisionPOS(dias:readonly {total:number;tarjeta:number;agregadorTotal:number;agregadorTarjeta:number}[],netpay:number,amex:number,amexParte:number){
 let venta=0,tarjeta=0;for(const d of dias){venta+=Number(d.total)-Number(d.agregadorTotal);tarjeta+=Math.max(0,Number(d.tarjeta)-Number(d.agregadorTarjeta));}
 if(!(venta>0)||![netpay,amex,amexParte].every(Number.isFinite))return null;
 const tarjetaPct=Math.min(1,tarjeta/venta)*100,tasaPct=((1-amexParte)*netpay+amexParte*amex)*100;
 return {pct:tarjetaPct*tasaPct/100,tarjetaPct,tasaPct};
}
