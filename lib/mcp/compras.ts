// Compras y pagos para el conector de Grok: mismos cálculos que las pantallas de Compras, sin datos sensibles.
// Solo salen nombres, folios, fechas y montos: nunca RFC, UUID, cuentas bancarias, referencias, notas ni rutas de archivos.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {fechaDePago,finDeSemana,resumenPagos} from '../compras/pagos.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {diaDePagoSugerido,sumarDias} from '../compras/diasPago.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {subtotalesPorRazon,SIN_RAZON} from '../compras/subtotalRazon.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {totalesOrden,avanceOrden} from '../compras/ordenes.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {estadoEntrega} from '../compras/entregas.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {previstosPorDia,CONCEPTOS} from '../compras/compromisos.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {buscarAproximado} from '../busquedaAproximada.ts';
import type {FechaCompromiso,Concepto} from '../compras/compromisos.ts';
import type {EstadoFactura} from '../compras/facturas.ts';
import type {TasaIva} from '../compras/proveedores.ts';

export const LIMITE_LISTA=50;
const LIMITE_PROVEEDORES=20,LIMITE_COMPROMISOS=30,LIMITE_PENDIENTES=20,DIAS_ATRASO_VIEJO=30;
type Nombres={razon_social:string;nombre_comercial:string|null}|null;
export type ContextoCompras={
 hoy:string;dias:readonly number[];
 empresas:ReadonlyMap<string,string>;sucursales:ReadonlyMap<string,string>;
 /** Sucursales de cada factura según sus órdenes de compra ("oficina" = orden sin sucursal). */
 sucursalesDe:ReadonlyMap<string,ReadonlySet<string>>;
 filtro:{sucursal:string|null;proveedores:ReadonlySet<string>|null};
};

const c=(n:unknown)=>Math.round(Number(n)*100);
const p=(centavos:number)=>centavos/100;
const nombreProveedor=(x:Nombres)=>x?.nombre_comercial??x?.razon_social??'Proveedor sin nombre';
const folio=(f:{serie:string|null;folio:string|null})=>[f.serie,f.folio].filter(Boolean).join('-')||'Sin folio';
const nombreSucursal=(id:string,ctx:ContextoCompras)=>id==='oficina'?'Oficina':ctx.sucursales.get(id)??'Sucursal';
const empresa=(rfc:string|null|undefined,ctx:ContextoCompras)=>(rfc?ctx.empresas.get(rfc.trim().toUpperCase()):undefined);
const diasEntre=(a:string,b:string)=>Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000);

// ─── Proveedor por nombre ────────────────────────────────────────────────────
const normal=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
type Buscable={id:string;razon_social:string;nombre_comercial:string|null};
/**
 * Solo la mejor coincidencia por nombre (nunca por RFC): exacta, al inicio del nombre, al inicio de una palabra,
 * contenida, todas las palabras, y solo si nada coincide así, con errores de dedo. Así "Coca" no suma "Roca Hielos".
 * Varios proveedores distintos igual de buenos es ambigüedad: se devuelven sus nombres para preguntar cuál.
 */
export function elegirProveedores<T extends Buscable>(filas:readonly T[],consulta:string):T[] {
 const q=normal(consulta),palabras=q.split(' ').filter(Boolean);
 const nivel=(f:T)=>{
  const ns=[f.razon_social,f.nombre_comercial??''].map(normal).filter(Boolean);
  if(ns.some(n=>n===q))return 0;
  if(ns.some(n=>n.startsWith(q)))return 1;
  if(ns.some(n=>` ${n}`.includes(` ${q}`)))return 2;
  if(ns.some(n=>n.includes(q)))return 3;
  if(palabras.length>1&&palabras.every(w=>ns.some(n=>n.includes(w))))return 4;
  return 9;
 };
 const niveles=filas.map(f=>({f,n:nivel(f)}));
 const mejor=Math.min(9,...niveles.map(x=>x.n));
 const elegidos=mejor<9?niveles.filter(x=>x.n===mejor).map(x=>x.f)
  :buscarAproximado(filas,consulta,(f:T)=>({nombres:[f.razon_social,f.nombre_comercial??'']}));
 if(!elegidos.length)throw Error(`Ningún proveedor coincide con "${consulta}". Prueba con otra parte del nombre; esto no significa que no haya compras o deuda.`);
 const distintos=[...new Set(elegidos.map(x=>nombreProveedor(x)))];
 if(distintos.length>1)throw Error(`Varios proveedores coinciden con "${consulta}": ${distintos.slice(0,10).join(', ')}${distintos.length>10?'…':''}. Usa el nombre de uno de ellos (o pregunta cuál).`);
 return elegidos;
}

export function mapaSucursales(ligas:readonly {factura_id:string;ordenes_compra:{sucursal_id:string|null}|null}[]) {
 const m=new Map<string,Set<string>>();
 for(const l of ligas)m.set(l.factura_id,(m.get(l.factura_id)??new Set()).add(l.ordenes_compra?.sucursal_id??'oficina'));
 return m;
}
/** Igual que Pagos: la sucursal de sus órdenes; sin orden, la de la factura ("oficina" si no tiene). */
const sucursalesFactura=(id:string,sucursalId:string|null,ctx:ContextoCompras)=>ctx.sucursalesDe.get(id)??new Set([sucursalId??'oficina']);
const deProveedor=(id:string,ctx:ContextoCompras)=>!ctx.filtro.proveedores||ctx.filtro.proveedores.has(id);
const deSucursal=(ids:ReadonlySet<string>,ctx:ContextoCompras)=>!ctx.filtro.sucursal||ids.has(ctx.filtro.sucursal);

/** Suma en centavos por clave y devuelve de mayor a menor. */
function agrupar<T>(filas:readonly T[],clave:(x:T)=>string,monto:(x:T)=>number,extra?:(x:T)=>string) {
 const m=new Map<string,{centavos:number;n:number;ids:Set<string>}>();
 for(const x of filas){const k=clave(x),g=m.get(k)??{centavos:0,n:0,ids:new Set<string>()};g.centavos+=c(monto(x));g.n++;if(extra)g.ids.add(extra(x));m.set(k,g);}
 return [...m].sort((a,b)=>b[1].centavos-a[1].centavos||a[0].localeCompare(b[0],'es')).map(([k,g])=>({clave:k,monto:p(g.centavos),n:g.n,distintos:g.ids.size}));
}

/** Por razón social receptora; todo lo que no tiene razón identificada va en un solo renglón (el RFC no sale). */
function porRazon(filas:readonly {monto:number;rfc:string|null|undefined}[],ctx:ContextoCompras) {
 const grupos=subtotalesPorRazon(filas.map(f=>({monto:f.monto,rfc:f.rfc,empresa:empresa(f.rfc,ctx)})));
 const conocidas=grupos.filter(g=>g.empresa!==SIN_RAZON);
 const sin=grupos.filter(g=>g.empresa===SIN_RAZON);
 const juntas=sin.length?[{empresa:SIN_RAZON,total:p(sin.reduce((s,g)=>s+c(g.total),0)),cuenta:sin.reduce((s,g)=>s+g.cuenta,0)}]:[];
 return [...conocidas.map(g=>({empresa:g.empresa,total:g.total,cuenta:g.cuenta})),...juntas];
}

export type FacturaPorPagar={id:string;serie:string|null;folio:string|null;saldo:number|string;vence_el:string;pago_programado_el:string|null;estado:EstadoFactura;proveedor_id:string;sucursal_id:string|null;rfc_receptor:string|null;proveedores:Nombres};
export type CompromisoMCP={id:string;concepto:Concepto;sucursal_id:string;proveedor_id:string;proveedores:Nombres;monto:number|null;variable:boolean};

/**
 * Cuentas por pagar como Compras → Pagos, más los compromisos fijos sin factura (estimados, aparte).
 * `compromisos` null: no se pudieron leer; se dice en lugar de reportarlos en cero.
 */
export function resumenPorPagar(facturas:readonly FacturaPorPagar[],compromisos:readonly CompromisoMCP[]|null,fechas:readonly FechaCompromiso[],ctx:ContextoCompras) {
 const {hoy}=ctx;
 const visibles=facturas
  .filter(f=>(f.estado==='por_pagar'||f.estado==='parcial')&&Number(f.saldo)>0&&deProveedor(f.proveedor_id,ctx)&&deSucursal(sucursalesFactura(f.id,f.sucursal_id,ctx),ctx))
  .map(f=>({...f,saldo:Number(f.saldo),pago_sugerido_el:diaDePagoSugerido(f.vence_el,hoy,ctx.dias)}));
 const r=resumenPagos(visibles,[],hoy);
 const total=visibles.reduce((s,f)=>s+c(f.saldo),0);
 const ordenadas=[...visibles].sort((a,b)=>fechaDePago(a).localeCompare(fechaDePago(b))||a.vence_el.localeCompare(b.vence_el)||a.id.localeCompare(b.id));
 const porProv=new Map<string,{proveedor:string;saldo:number;vencido:number;facturas:number}>();
 for(const f of visibles){const k=f.proveedor_id,g=porProv.get(k)??{proveedor:nombreProveedor(f.proveedores),saldo:0,vencido:0,facturas:0};g.saldo+=c(f.saldo);if(f.vence_el<hoy)g.vencido+=c(f.saldo);g.facturas++;porProv.set(k,g);}
 const proveedores=[...porProv.values()].sort((a,b)=>b.saldo-a.saldo);
 return {
  resumen:{saldoTotal:p(total),vencido:r.vencido,estaSemana:r.semana,proximos30Dias:r.treinta,facturas:visibles.length},
  porProveedor:proveedores.slice(0,LIMITE_PROVEEDORES).map(g=>({proveedor:g.proveedor,saldo:p(g.saldo),vencido:p(g.vencido),facturas:g.facturas})),
  porProveedorTruncado:proveedores.length>LIMITE_PROVEEDORES,
  porRazonSocial:porRazon(visibles.map(f=>({monto:f.saldo,rfc:f.rfc_receptor})),ctx).map(x=>({razonSocial:x.empresa,saldo:x.total,facturas:x.cuenta})),
  facturas:ordenadas.slice(0,LIMITE_LISTA).map(f=>({folio:folio(f),proveedor:nombreProveedor(f.proveedores),sucursales:[...sucursalesFactura(f.id,f.sucursal_id,ctx)].map(s=>nombreSucursal(s,ctx)),
   venceEl:f.vence_el,fechaPago:fechaDePago(f),programada:!!f.pago_programado_el,saldo:f.saldo,estado:f.estado,vencida:f.vence_el<hoy})),
  facturasTruncado:ordenadas.length>LIMITE_LISTA,
  compromisosSinFactura:compromisos?resumenCompromisos(compromisos,fechas,ctx):{disponible:false as const,resumen:null,lista:[],listaTruncada:false},
 };
}

function resumenCompromisos(compromisos:readonly CompromisoMCP[],fechas:readonly FechaCompromiso[],ctx:ContextoCompras) {
 const {hoy}=ctx;
 // Mismos filtros que las facturas; una fecha con factura vigente ya está arriba como factura.
 const visiblesC=compromisos.filter(x=>deProveedor(x.proveedor_id,ctx)&&(!ctx.filtro.sucursal||x.sucursal_id===ctx.filtro.sucursal));
 const porId=new Map(visiblesC.map(x=>[x.id,x]));
 const previstos=Object.values(previstosPorDia(fechas.filter(f=>porId.has(f.compromiso_id)),new Map(visiblesC.map(x=>[x.id,{monto:x.monto??0,titulo:CONCEPTOS[x.concepto],variable:x.variable}])),hoy,v=>diaDePagoSugerido(v,hoy,ctx.dias))).flat();
 const fin=finDeSemana(hoy),treinta=sumarDias(hoy,29);
 const suma=(xs:typeof previstos)=>p(xs.reduce((s,x)=>s+c(x.monto),0));
 const lista=previstos.filter(x=>x.vencido||x.fechaPago<=treinta).sort((a,b)=>a.fechaPago.localeCompare(b.fechaPago)||a.vence.localeCompare(b.vence));
 return {
  disponible:true as const,
  resumen:{vencidoEstimado:suma(previstos.filter(x=>x.vencido)),estaSemanaEstimado:suma(previstos.filter(x=>!x.vencido&&x.fechaPago<=fin)),
   proximos30DiasEstimado:suma(previstos.filter(x=>!x.vencido&&x.fechaPago<=treinta)),conMontoVariable:new Set(lista.filter(x=>x.variable).map(x=>x.compromisoId+x.vence)).size},
  lista:lista.slice(0,LIMITE_COMPROMISOS).map(x=>{const k=porId.get(x.compromisoId)!;return {concepto:CONCEPTOS[k.concepto],sucursal:nombreSucursal(k.sucursal_id,ctx),proveedor:nombreProveedor(k.proveedores),
   vence:x.vence,fechaPago:x.fechaPago,montoEstimado:x.variable?null:x.monto,variable:x.variable,vencido:x.vencido};}),
  listaTruncada:lista.length>LIMITE_COMPROMISOS,
 };
}

export type AplicacionPago={pago_id:string;factura_id:string;monto:number|string;facturas:{sucursal_id:string|null;rfc_receptor:string|null}|null;
 pagos:{fecha:string;anulado_en:string|null;proveedor_id:string;forma:string;origen_fondos:string|null}};

/** Pagos hechos atribuidos por lo aplicado a cada factura (como "Pagado este mes" en Pagos): respeta filtros y excluye anulados. */
export function resumenPagosHechos(aplicaciones:readonly AplicacionPago[],proveedores:ReadonlyMap<string,string>,ctx:ContextoCompras) {
 const vale=aplicaciones.filter(a=>!a.pagos.anulado_en&&deProveedor(a.pagos.proveedor_id,ctx)&&deSucursal(sucursalesFactura(a.factura_id,a.facturas?.sucursal_id??null,ctx),ctx));
 const prov=(a:AplicacionPago)=>proveedores.get(a.pagos.proveedor_id)??'Proveedor sin nombre';
 const porPago=new Map<string,{fecha:string;proveedor:string;centavos:number;forma:string;origen:string|null}>();
 for(const a of vale){const g=porPago.get(a.pago_id)??{fecha:a.pagos.fecha,proveedor:prov(a),centavos:0,forma:a.pagos.forma,origen:a.pagos.origen_fondos};g.centavos+=c(a.monto);porPago.set(a.pago_id,g);}
 const lista=[...porPago.values()].sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.centavos-a.centavos);
 const porProv=agrupar(vale,prov,a=>Number(a.monto),a=>a.pago_id);
 return {
  total:p(vale.reduce((s,a)=>s+c(a.monto),0)),pagos:porPago.size,
  porProveedor:porProv.slice(0,LIMITE_PROVEEDORES).map(g=>({proveedor:g.clave,monto:g.monto,pagos:g.distintos})),
  porProveedorTruncado:porProv.length>LIMITE_PROVEEDORES,
  porForma:agrupar(vale,a=>a.pagos.forma,a=>Number(a.monto)).map(g=>({forma:g.clave,monto:g.monto})),
  porOrigenFondos:agrupar(vale,a=>a.pagos.origen_fondos??'sin_dato',a=>Number(a.monto)).map(g=>({origen:g.clave,monto:g.monto})),
  porRazonSocial:porRazon(vale.map(a=>({monto:Number(a.monto),rfc:a.facturas?.rfc_receptor})),ctx).map(x=>({razonSocial:x.empresa,monto:x.total})),
  lista:lista.slice(0,LIMITE_LISTA).map(x=>({fecha:x.fecha,proveedor:x.proveedor,monto:p(x.centavos),forma:x.forma,origenFondos:x.origen})),
  listaTruncada:lista.length>LIMITE_LISTA,
 };
}

export type FacturaEmitida={id:string;proveedor_id:string;sucursal_id:string|null;rfc_receptor:string|null;neto:number|string|null;estado:EstadoFactura;tipo:'ingreso'|'egreso';fecha_emision:string;proveedores:Nombres};

/** Lo facturado (neto: total del CFDI menos notas de crédito), sin canceladas ni notas de crédito sueltas. */
export function resumenCompras(facturas:readonly FacturaEmitida[],ctx:ContextoCompras) {
 const vale=facturas.filter(f=>f.tipo==='ingreso'&&f.estado!=='cancelada'&&deProveedor(f.proveedor_id,ctx)&&deSucursal(sucursalesFactura(f.id,f.sucursal_id,ctx),ctx));
 const neto=(f:FacturaEmitida)=>Number(f.neto??0);
 const sucursal=(f:FacturaEmitida)=>{const s=[...sucursalesFactura(f.id,f.sucursal_id,ctx)];return s.length>1?'Varias sucursales':nombreSucursal(s[0],ctx);};
 const porProv=agrupar(vale,f=>nombreProveedor(f.proveedores),neto);
 return {
  total:p(vale.reduce((s,f)=>s+c(neto(f)),0)),facturas:vale.length,
  porProveedor:porProv.slice(0,LIMITE_PROVEEDORES).map(g=>({proveedor:g.clave,monto:g.monto,facturas:g.n})),
  porProveedorTruncado:porProv.length>LIMITE_PROVEEDORES,
  porSucursal:agrupar(vale,sucursal,neto).map(g=>({sucursal:g.clave,monto:g.monto})),
  porRazonSocial:porRazon(vale.map(f=>({monto:neto(f),rfc:f.rfc_receptor})),ctx).map(x=>({razonSocial:x.empresa,monto:x.total})),
 };
}

export type OrdenMCP={id:string;folio:string;proveedor_id:string;sucursal_id:string|null;estado:string;entrega_esperada:string|null;proveedores:Nombres;sucursales:{nombre:string}|null};
export type RenglonMCP={orden_id:string;descripcion:string|null;cantidad:number|string;precio:number|string;tasa_iva:TasaIva;recibido:number|string};

/**
 * Lo que falta por llegar como Compras → Recepciones: órdenes confirmadas sin recibir completas. Orden de la lista:
 * atrasadas recientes, hoy, a tiempo, sin fecha y al final las atrasadas de más de 30 días (suelen haberse recibido
 * sin registrar), para que las viejas no tapen lo que llega pronto.
 */
export function resumenOrdenes(ordenes:readonly OrdenMCP[],renglones:readonly RenglonMCP[],ctx:ContextoCompras) {
 const porOrden=new Map<string,RenglonMCP[]>();
 for(const r of renglones)porOrden.set(r.orden_id,[...(porOrden.get(r.orden_id)??[]),r]);
 const abiertas=ordenes.filter(o=>o.estado==='confirmada'&&deProveedor(o.proveedor_id,ctx)&&(!ctx.filtro.sucursal||o.sucursal_id===ctx.filtro.sucursal)).flatMap(o=>{
  const rs=(porOrden.get(o.id)??[]).map(r=>({...r,cantidad:Number(r.cantidad),precio:Number(r.precio),recibido:Number(r.recibido)}));
  const avance=avanceOrden(rs);
  if(avance==='completa')return [];
  const entrega=estadoEntrega(o.entrega_esperada,false,ctx.hoy);
  const pendientes=rs.filter(r=>r.cantidad-r.recibido>1e-9);
  return [{folio:o.folio,proveedor:nombreProveedor(o.proveedores),sucursal:o.sucursales?.nombre??'Oficina',entregaEsperada:o.entrega_esperada,estadoEntrega:entrega,
   diasAtraso:entrega==='atrasada'?diasEntre(o.entrega_esperada!,ctx.hoy):entrega==='hoy'?0:null,avance,
   total:totalesOrden(rs).total,totalPendiente:totalesOrden(pendientes.map(r=>({...r,cantidad:r.cantidad-r.recibido}))).total,
   pendientes:pendientes.slice(0,LIMITE_PENDIENTES).map(r=>({descripcion:r.descripcion??'Artículo',pedido:r.cantidad,recibido:r.recibido,falta:Math.round((r.cantidad-r.recibido)*1000)/1000})),
   pendientesTotal:pendientes.length}];
 });
 const grupo=(o:(typeof abiertas)[number])=>o.estadoEntrega==='atrasada'?(o.diasAtraso!>DIAS_ATRASO_VIEJO?4:0):o.estadoEntrega==='hoy'?1:o.estadoEntrega==='a_tiempo'?2:3;
 const lista=[...abiertas].sort((a,b)=>grupo(a)-grupo(b)||(a.diasAtraso??0)-(b.diasAtraso??0)||(a.entregaEsperada??'').localeCompare(b.entregaEsperada??'')||a.folio.localeCompare(b.folio));
 const cuenta=(e:string)=>abiertas.filter(o=>o.estadoEntrega===e).length;
 return {
  resumen:{ordenes:abiertas.length,atrasadas:cuenta('atrasada'),atrasadasMas30Dias:abiertas.filter(o=>grupo(o)===4).length,hoy:cuenta('hoy'),aTiempo:cuenta('a_tiempo'),sinFecha:cuenta('sin_fecha'),
   totalPendiente:p(abiertas.reduce((s,o)=>s+c(o.totalPendiente),0))},
  ordenes:lista.slice(0,LIMITE_LISTA),ordenesTruncado:lista.length>LIMITE_LISTA,
 };
}
