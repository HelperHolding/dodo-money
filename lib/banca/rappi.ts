import type {Hoja} from '../ventas/xlsx';

/** Importes firmados del reporte financiero. No son el historial de productos. */
export type MovimientoRappi={fila:number;fecha:string;orden:string;tienda:string;lote:string|null;tipo:'ORDEN'|'COMPENSACIÓN';estado:string;bruta:number;aliado:number;dar:number;compensacion:number;cancelacion:number;comision:number;creditoDar:number;ivaComision:number;creditoDarIva:number;retencionIva:number;retencionIsr:number;neto:number};
export type FacturaComisionRappi={uuid:string;lote:string;subtotal:number;iva:number;total:number};
export type ReporteRappi={desde:string;hasta:string;tienda:string;movimientos:MovimientoRappi[];uuidsComision:string[];facturasComision?:FacturaComisionRappi[]};
const red=(n:number,d=2)=>(Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*10**d)/10**d)||0;
const CAMPOS={bruta:'Venta Bruta',aliado:'Descuento de Producto asumido por el aliado',dar:'Descuentos por inversión de Rappi DAR',compensacion:'Compensaciones',cancelacion:'Costo Canceladas',comision:'Uso y alquiler de plataforma Rappi',creditoDar:'Descuento por inversión de Rappi a aplicar sobre Uso y alquiler de plataforma Rappi DAR',ivaComision:'IVA Uso y alquiler de plataforma Rappi',creditoDarIva:'Descuento por inversión de Rappi a aplicar sobre el IVA Uso y alquiler de plataforma Rappi DAR',retencionIva:'Reteiva Ventas',retencionIsr:'ISR'} as const;
const normal=(s:unknown)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const indice=(c:string)=>[...c].reduce((s,x)=>s*26+x.charCodeAt(0)-64,0);
function fechaReporte(s:string){
 const m=/\b(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s+(\d{4})\b/i.exec(s);
 if(!m)throw Error('Fecha financiera no reconocida: '+s);
 const f=`${m[3]}-${String(['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].indexOf(m[2].toLowerCase())+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 if(new Date(f+'T12:00:00Z').toISOString().slice(0,10)!==f)throw Error('Fecha financiera inválida.');
 return f;
}
export function leerFinancieroRappi(hojas:readonly Hoja[],hoy:string):ReporteRappi{
 const candidatas=hojas.filter(h=>h.nombre==='Detalle');if(candidatas.length!==1)throw Error('Falta la hoja Detalle del reporte financiero de Rappi.');
 const h=candidatas[0],cab=new Map<string,string>(),filas=new Set<number>();
 for(const [ref,v]of h.celdas){const m=/^([A-Z]+)(\d+)$/.exec(ref);if(!m)continue;if(m[2]==='2'){const key=normal(v);if(cab.has(key))throw Error('Encabezados financieros repetidos.');cab.set(key,m[1]);}else if(Number(m[2])>2)filas.add(Number(m[2]));}
 const col=(n:string)=>{const c=cab.get(normal(n));if(!c)throw Error('Falta la columna financiera: '+n);return c;};
 const originales=['Fecha de creación orden','ID de la órden','ID del paidlot','ID de la tienda','Tipo de transacción','Estado de la órden'];
 originales.forEach(col);Object.values(CAMPOS).forEach(col);
 const conocidas=new Set(Object.values(CAMPOS).map(col));
 const num=(c:string,f:number)=>{const v=h.celdas.get(c+f);if(v===undefined||v==='')return 0;if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>=1e12||Math.abs(v-red(v,6))>1e-8)throw Error(`Importe financiero inválido, ${c}${f}.`);return v;};
 const movimientos:MovimientoRappi[]=[],claves=new Set<string>(),netos:{fila:number;neto:number}[]=[];
 for(const fila of [...filas].sort((a,b)=>a-b)){
  const txt=(n:string)=>String(h.celdas.get(col(n)+fila)??'').trim();
  if(!txt('ID de la órden')){if([...h.celdas].some(([ref,v])=>ref.endsWith(String(fila))&&v!==''))throw Error(`Fila financiera sin ID: ${fila}.`);continue;}
  const orden=txt('ID de la órden'),tienda=txt('ID de la tienda'),lote=txt('ID del paidlot')||null,tipo=txt('Tipo de transacción'),estado=txt('Estado de la órden');
  const fecha=fechaReporte(txt('Fecha de creación orden'));
  if(!/^\d{5,20}$/.test(orden)||!/^\d{5,20}$/.test(tienda)||(lote&&!/^\d{5,20}$/.test(lote))||!['ORDEN','COMPENSACIÓN'].includes(tipo)||fecha>hoy||fecha<'2020-01-01'||(tipo==='ORDEN'&&!['pending_review','canceled','canceled_with_charge','finished','delivered'].includes(estado)))throw Error(`Revisa fecha, identificadores, tipo y estado de la fila ${fila}.`);
  // Un nuevo cargo no puede desaparecer silenciosamente del cálculo.
  for(const c of cab.values()){const i=indice(c);if(i>=18&&i<=63&&!conocidas.has(c)&&!['AR','BL','BM'].includes(c)&&num(c,fila)!==0)throw Error(`El reporte contiene un concepto financiero aún no soportado: ${h.celdas.get(c+'2')} (${c}${fila}).`);}
  const m={fila,fecha,orden,tienda,lote,tipo,estado,...Object.fromEntries(Object.entries(CAMPOS).map(([k,n])=>[k,num(col(n),fila)]))} as MovimientoRappi;
  if(m.bruta<0||m.aliado>0||m.dar>0||m.comision>0||m.ivaComision>0||m.creditoDar<0||m.creditoDarIva<0||m.retencionIva>0||m.retencionIsr>0||m.bruta+m.aliado+m.dar<-.005||Math.abs(m.dar+m.creditoDar+m.creditoDarIva)>.005)throw Error(`Signos o créditos DAR no cuadran en la fila ${fila}.`);
  if(tipo==='COMPENSACIÓN'&&Object.keys(CAMPOS).some(k=>k!=='compensacion'&&m[k as keyof typeof CAMPOS]!==0))throw Error(`La compensación ${fila} contiene otros conceptos.`);
  m.neto=red(Object.keys(CAMPOS).reduce((s,k)=>s+m[k as keyof typeof CAMPOS],0),6);netos.push({fila,neto:m.neto});
  const clave=`${tipo}|${orden}`;
  // Una orden puede tener varias compensaciones (un renglón por producto compensado): se suman en un solo movimiento.
  const previa=tipo==='COMPENSACIÓN'?movimientos.find(x=>x.tipo===tipo&&x.orden===orden):undefined;
  if(previa){if(previa.fecha!==fecha||previa.lote!==lote)throw Error('Compensaciones de una misma orden con distinta fecha o paidlot: '+orden);previa.compensacion=red(previa.compensacion+m.compensacion,6);previa.neto=red(previa.neto+m.neto,6);continue;}
  if(claves.has(clave))throw Error('Movimiento financiero repetido: '+clave);claves.add(clave);
  movimientos.push(m);
 }
 // Rappi exporta "Valor Neto" como fórmula sin calcular (todo BL en 0): entonces vale el neto calculado aquí, ya validado concepto por concepto.
 const sinCalcular=netos.every(n=>h.celdas.get('BL'+n.fila)===0)&&netos.some(n=>Math.abs(n.neto)>.005);
 if(!sinCalcular)for(const n of netos){const neto=h.celdas.get('BL'+n.fila);if(typeof neto!=='number'||Math.abs(neto-n.neto)>.005)throw Error(`El neto no cuadra o falta el valor calculado de BL${n.fila}. Guarda el Excel recalculado.`);}
 if(!movimientos.length||movimientos.length>5000||new Set(movimientos.map(m=>m.tienda)).size!==1)throw Error('Usa un reporte de una sola tienda, con hasta 5,000 movimientos.');
 const fechas=movimientos.map(m=>m.fecha).sort();
 const facturas=hojas.find(h=>h.nombre==='Facturas de comisión');
 const facturasComision:FacturaComisionRappi[]=[];
 for(const [ref,v]of facturas?.celdas??[]){if(!/^J\d+$/.test(ref)||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(String(v)))continue;const n=ref.slice(1),f={uuid:String(v).toLowerCase(),lote:String(facturas!.celdas.get('C'+n)??''),subtotal:Number(facturas!.celdas.get('G'+n)),iva:Number(facturas!.celdas.get('H'+n)),total:Number(facturas!.celdas.get('I'+n))};
  if(!/^\d{5,20}$/.test(f.lote)||[f.subtotal,f.iva,f.total].some(x=>!Number.isFinite(x)||x<0)||red(f.subtotal+f.iva)!==f.total||facturasComision.some(x=>x.uuid===f.uuid||x.lote===f.lote))throw Error('Revisa las facturas de comisión del archivo.');facturasComision.push(f);
 }
 for(const f of facturasComision){const esperado=-movimientos.filter(m=>m.lote===f.lote).reduce((s,m)=>s+m.comision+m.creditoDar,0);if(esperado<=0||Math.abs(esperado-f.subtotal)>.03||Math.abs(red(f.subtotal*.16)-f.iva)>.01)throw Error('El CFDI de comisión no coincide con el lote del reporte.');}
 return {desde:fechas[0],hasta:fechas.at(-1)!,tienda:movimientos[0].tienda,movimientos,uuidsComision:facturasComision.map(f=>f.uuid),facturasComision};
}
export function resumenFinancieroRappi(movimientos:readonly MovimientoRappi[]){
 const suma=(k:keyof typeof CAMPOS)=>movimientos.reduce((s,m)=>s+Number(m[k]),0);
 const lotes=new Map<string,MovimientoRappi[]>();
 for(const m of movimientos){const k=m.lote??'Sin paidlot';lotes.set(k,[...(lotes.get(k)??[]),m]);}
 const lotesResumen=[...lotes].map(([lote,filas])=>{const sum=(k:keyof typeof CAMPOS)=>filas.reduce((s,m)=>s+Number(m[k]),0);return {lote,pedidos:filas.filter(m=>m.tipo==='ORDEN').length,movimientos:filas.length,bruta:red(sum('bruta')),aliado:red(sum('aliado')),dar:red(sum('dar')),comision:red(sum('comision')),ivaComision:red(sum('ivaComision')),creditoDar:red(sum('creditoDar')),creditoDarIva:red(sum('creditoDarIva')),retenciones:red(sum('retencionIva')+sum('retencionIsr')),ajustes:red(sum('compensacion')+sum('cancelacion')),neto:red(filas.reduce((s,m)=>s+Number(m.neto),0)),comisionNeta:sum('comision')+sum('creditoDar'),provisional:lote==='Sin paidlot'};});
 const base=-suma('retencionIva')/.08,baseIsr=-suma('retencionIsr')/.025;
 const efectiva=suma('bruta')+suma('aliado')+suma('dar');
 const comisionEsperada=lotesResumen.reduce((s,l)=>s+Math.max(0,-l.comisionNeta),0),excedente=lotesResumen.reduce((s,l)=>s+Math.max(0,l.comisionNeta),0);
 return {movimientos:movimientos.length,pedidos:movimientos.filter(m=>m.tipo==='ORDEN').length,bruta:red(suma('bruta')),aliado:red(suma('aliado')),dar:red(suma('dar')),efectiva:red(efectiva),comision:red(suma('comision')),ivaComision:red(suma('ivaComision')),creditoDar:red(suma('creditoDar')),creditoDarIva:red(suma('creditoDarIva')),retencionIva:red(suma('retencionIva')),retencionIsr:red(suma('retencionIsr')),compensaciones:red(suma('compensacion')),cancelaciones:red(suma('cancelacion')),neto:red(movimientos.reduce((s,m)=>s+Number(m.neto),0)),baseRetencion:red(base),diferenciaBases:red(base-baseIsr),facturacion:red(base*1.16),fueraBase:red(efectiva-base*1.16),comisionEsperada:red(comisionEsperada),excedente:red(excedente),lotes:lotesResumen};
}

/** La liquidación no es una venta adicional. Distribuye el gasto/ingreso del lote completo entre sus días por comisión bruta. */
export function efectoPLRappi(reportes:readonly ReporteRappi[],desde:string,hasta:string){
 const todos=reportes.flatMap(r=>r.movimientos),periodo=todos.filter(m=>m.fecha>=desde&&m.fecha<=hasta),r=resumenFinancieroRappi(periodo);
 let comision=0,excedente=0,provisional=periodo.some(m=>!m.lote);
 for(const lote of resumenFinancieroRappi(todos).lotes){
  const filas=todos.filter(m=>(m.lote??'Sin paidlot')===lote.lote),hayComision=filas.some(m=>m.comision!==0),pesos=new Map<string,number>();
  for(const m of filas)pesos.set(m.fecha,(pesos.get(m.fecha)??0)+(hayComision?Math.abs(m.comision):Math.abs(m.creditoDar)));
  const base=[...pesos.values()].reduce((s,n)=>s+n,0),dias=[...pesos].filter(([,n])=>n>0).sort((a,b)=>a[0].localeCompare(b[0]));
  const parte=(total:number)=>{const centavos=red(total)*100;let restante=Math.round(centavos),seleccion=0;dias.forEach(([fecha,peso],i)=>{const n=i===dias.length-1?restante:Math.min(restante,Math.round(centavos*peso/base));restante-=n;if(fecha>=desde&&fecha<=hasta)seleccion+=n;});return seleccion/100;};
  const cfdis=reportes.flatMap(r=>r.facturasComision??[]).filter(f=>f.lote===lote.lote),unicos=[...new Map(cfdis.map(f=>[f.uuid,f])).values()];
  if(!unicos.length&&lote.comisionNeta<0&&filas.some(m=>m.fecha>=desde&&m.fecha<=hasta))provisional=true;
  comision+=parte(unicos.length?unicos.reduce((s,f)=>s+f.subtotal,0):Math.max(0,-lote.comisionNeta));
  excedente+=parte(Math.max(0,lote.comisionNeta));
 }
 return {ventaNeta:r.baseRetencion,fueraBase:r.fueraBase,comision:red(comision),excedente:red(excedente),ajustes:red(-r.compensaciones-r.cancelaciones),fechas:new Set(periodo.map(m=>m.fecha)),pedidos:periodo.filter(m=>m.tipo==='ORDEN').length,neto:r.neto,provisional};
}
