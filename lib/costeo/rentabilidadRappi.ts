/**
 * Rentabilidad del canal Rappi por producto y en total. Puro, sin red.
 * Por renglón: el descuento que paga la tienda se reparte por importe; la comisión es la real del reporte financiero
 * (repartida por lo cobrado) o, sin reporte, el % vigente sobre lo cobrado con IVA; las regalías van sobre la venta sin IVA.
 * Margen = (venta sin IVA − comisión − regalías − costo) ÷ venta sin IVA. IVA de la comisión y retenciones no son gasto.
 */
export type OrdenRentabilidad={rappi_id:string;fecha:string;estado:string;bruto:number;descuento_restaurante:number;rappi_lineas:{producto_id:number;nombre:string;cantidad:number;importe:number}[]};
export type EntradaRentabilidad={
 ordenes:readonly OrdenRentabilidad[];
 /** Producto Rappi ligado: dodo_id solo si es un producto del catálogo; piezas, lo que lleva por unidad (uno o varios productos). */
 productoDe:(productoId:number)=>{dodo_id:number|null;nombre:string;piezas:readonly Pieza[]}|null;
 costoDe:(dodoId:number,fecha:string)=>number|null;
 posDe:(dodoId:number)=>number|null;
 /** % de comisión Rappi vigente en la fecha, sobre lo cobrado con IVA. */
 comisionPct:(fecha:string)=>number;
 /** Comisión cobrada por orden según el reporte financiero, en pesos positivos (sin IVA de la comisión). */
 comisionReal:ReadonlyMap<string,number>;
 regaliasPct:number;terminalPct:number;metaPct:number;iva?:number;
 /** Compensaciones y cancelaciones cobradas del periodo, en pesos positivos. */
 ajustes:{compensaciones:number;cancelaciones:number};
};
export type Pieza={dodo_id:number;cantidad:number};
type Suma={piezas:number;lista:number;descuento:number;cobrado:number;neto:number;comision:number;regalias:number;costo:number};
export type FilaRentabilidad=Suma&{clave:string;dodo_id:number|null;nombre:string;costoUnitario:number|null;utilidad:number|null;margen:number|null;descuentoPct:number;precioLista:number;precioMinimo:number|null;pos:number|null;utilidadPOS:number|null;utilidadPieza:number|null};
const red=(n:number)=>Math.round(n*100)/100;
const vacia=():Suma=>({piezas:0,lista:0,descuento:0,cobrado:0,neto:0,comision:0,regalias:0,costo:0});
const CAMPOS=Object.keys(vacia()) as (keyof Suma)[];
const sumar=(a:Suma,b:Suma)=>{for(const k of CAMPOS)a[k]+=b[k];};
/** Precio de lista con IVA que deja el margen meta con el descuento promedio del producto; null si no se alcanza. */
export function precioMinimoRappi(costo:number,descuentoPct:number,e:{comisionPct:number;regaliasPct:number;metaPct:number;iva?:number}){
 const iva=1+(e.iva??16)/100,divisor=(1-descuentoPct/100)*((1-e.regaliasPct/100-e.metaPct/100)/iva-e.comisionPct/100);
 return divisor>0&&costo>=0?Math.ceil(costo/divisor*100-1e-8)/100:null;
}
/** Utilidad por pieza vendida en mostrador al precio POS: terminal sobre el cobro con IVA y regalías sobre la venta sin IVA. */
export const utilidadPOS=(precio:number,costo:number,e:{terminalPct:number;regaliasPct:number;iva?:number})=>{const neto=precio/(1+(e.iva??16)/100);return neto*(1-e.regaliasPct/100)-precio*e.terminalPct/100-costo;};
export function rentabilidadRappi(e:EntradaRentabilidad){
 const iva=1+(e.iva??16)/100,porProducto=new Map<string,Suma&{dodo_id:number|null;nombre:string;piezasDe:readonly Pieza[];sinCosto:boolean;costos:number[]}>();
 // Costo o precio POS de una unidad: suma de sus piezas por cantidad; null si falta el de alguna.
 const sumaPiezas=(piezas:readonly Pieza[],valor:(d:number)=>number|null)=>{if(!piezas.length)return null;let t=0;for(const p of piezas){const v=valor(p.dodo_id);if(v===null)return null;t+=v*p.cantidad;}return t;};
 const promos=new Map<number,{descuento:number;ordenes:number;lista:number}>();
 let ordenes=0,conReal=0;const comisionPeriodo:number[]=[];
 const pesoCobrado=(o:OrdenRentabilidad)=>Number(o.bruto)-Number(o.descuento_restaurante);
 for(const o of e.ordenes.filter(o=>o.estado==="Finalizado"&&Number(o.bruto)>0)){
  ordenes++;
  const real=e.comisionReal.get(o.rappi_id),pct=e.comisionPct(o.fecha);if(real!==undefined)conReal++;
  const cobradoOrden=pesoCobrado(o),comisionOrden=real??cobradoOrden*pct/100;comisionPeriodo.push(comisionOrden);
  const d=red(Number(o.descuento_restaurante));const p=promos.get(d)??{descuento:0,ordenes:0,lista:0};p.descuento+=d;p.ordenes++;p.lista+=Number(o.bruto);promos.set(d,p);
  for(const l of o.rappi_lineas){
   const importe=Number(l.importe),descuento=Number(o.descuento_restaurante)*importe/Number(o.bruto),cobrado=importe-descuento,neto=cobrado/iva;
   const prod=e.productoDe(Number(l.producto_id)),clave=prod?.dodo_id!=null?`p${prod.dodo_id}`:`r${l.producto_id}`;
   const costoUnit=prod?sumaPiezas(prod.piezas,d=>e.costoDe(d,o.fecha)):null;
   const f=porProducto.get(clave)??{...vacia(),dodo_id:prod?.dodo_id??null,nombre:prod?.nombre??l.nombre,piezasDe:prod?.piezas??[],sinCosto:false,costos:[]};
   sumar(f,{piezas:Number(l.cantidad),lista:importe,descuento,cobrado,neto,comision:cobradoOrden>0?comisionOrden*cobrado/cobradoOrden:0,regalias:neto*e.regaliasPct/100,costo:(costoUnit??0)*Number(l.cantidad)});
   if(costoUnit===null)f.sinCosto=true;else f.costos.push(costoUnit);
   porProducto.set(clave,f);
  }
 }
 const filas:FilaRentabilidad[]=[...porProducto].map(([clave,f])=>{
  const costoUnitario=f.sinCosto||!f.costos.length?null:f.costo/f.piezas,descuentoPct=f.lista?f.descuento/f.lista*100:0,precioLista=f.piezas?f.lista/f.piezas:0;
  const utilidad=f.sinCosto?null:f.neto-f.comision-f.regalias-f.costo,pos=sumaPiezas(f.piezasDe,e.posDe);
  // Comisión efectiva del producto (real o estimada) sobre lo cobrado, para que el precio mínimo use lo que de verdad cobra Rappi.
  const comisionPct=f.cobrado?f.comision/f.cobrado*100:0;
  return {clave,dodo_id:f.dodo_id,nombre:f.nombre,piezas:f.piezas,lista:red(f.lista),descuento:red(f.descuento),cobrado:red(f.cobrado),neto:red(f.neto),comision:red(f.comision),regalias:red(f.regalias),costo:red(f.costo),
   costoUnitario:costoUnitario===null?null:red(costoUnitario),utilidad:utilidad===null?null:red(utilidad),margen:utilidad===null||!f.neto?null:utilidad/f.neto*100,descuentoPct,precioLista:red(precioLista),
   precioMinimo:costoUnitario===null?null:precioMinimoRappi(costoUnitario,descuentoPct,{comisionPct,regaliasPct:e.regaliasPct,metaPct:e.metaPct,iva:e.iva}),
   pos,utilidadPOS:pos===null||costoUnitario===null?null:red(utilidadPOS(pos,costoUnitario,e)),utilidadPieza:utilidad===null||!f.piezas?null:red(utilidad/f.piezas)};
 }).sort((a,b)=>b.neto-a.neto||a.nombre.localeCompare(b.nombre,"es"));
 const con=filas.filter(f=>f.utilidad!==null),total=vacia();for(const f of con)sumar(total,f);
 const sinCosto=filas.filter(f=>f.utilidad===null),ajustes=e.ajustes.compensaciones+e.ajustes.cancelaciones;
 const utilidadProductos=total.neto-total.comision-total.regalias-total.costo,utilidad=utilidadProductos-ajustes;
 return {ordenes,ordenesConComisionReal:conReal,filas,
  total:{...Object.fromEntries(Object.entries(total).map(([k,v])=>[k,red(v)])) as Suma,utilidadProductos:red(utilidadProductos),compensaciones:red(e.ajustes.compensaciones),cancelaciones:red(e.ajustes.cancelaciones),utilidad:red(utilidad),margen:total.neto?utilidad/total.neto*100:null,cumple:total.neto>0&&utilidad/total.neto*100>=e.metaPct},
  sinCosto:{productos:sinCosto.length,neto:red(sinCosto.reduce((s,f)=>s+f.neto,0)),lista:red(sinCosto.reduce((s,f)=>s+f.lista,0))},
  comision:red(comisionPeriodo.reduce((s,n)=>s+n,0)),
  promos:[...promos].map(([monto,p])=>({monto,ordenes:p.ordenes,descuento:red(p.descuento),pct:p.lista?p.descuento/p.lista*100:0})).sort((a,b)=>b.descuento-a.descuento)};
}
