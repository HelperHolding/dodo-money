import type {SupabaseClient} from '@supabase/supabase-js';
import {leerTodo} from '@/lib/ventas/paginar';
import {hoyCalendarioMX} from '@/lib/formato';
import {buscarProveedores} from '@/lib/compras/busquedaProveedores';
import {leerRazonesSociales} from '@/lib/compras/razonesSociales';
import {ventanaCompromisos} from '@/lib/compras/compromisos';
import {importesDe,leerCompromisos,leerFechas} from '@/app/compras/pagos/compromisos/datos';
import {mapaSucursales,resumenPorPagar,resumenPagosHechos,resumenCompras,resumenOrdenes,
 type ContextoCompras,type FacturaPorPagar,type AplicacionPago,type FacturaEmitida,type OrdenMCP,type RenglonMCP} from './compras';
import type {Argumentos} from './herramientas';

type ArgsCompras=Extract<Argumentos,{herramienta:'por_pagar'|'ordenes'|'pagos'|'compras'}>;
type Proveedor={id:string;razon_social:string;nombre_comercial:string|null;rfc:string};
const nombreDe=(p:{razon_social:string;nombre_comercial:string|null})=>p.nombre_comercial??p.razon_social;

// Los mensajes de leerTodo hablan de ventas; aquí se dice qué falló sin detalles de la base.
async function leer<T>(que:string,f:()=>Promise<T>):Promise<T>{try{return await f();}catch{throw Error(`No se pudieron consultar ${que}. Intenta de nuevo.`);}}

/** Contexto común: proveedor buscado por nombre (el RFC solo se usa para buscar, nunca sale), sucursales, razones sociales y días de pago. */
async function contexto(supabase:SupabaseClient,a:ArgsCompras) {
 const [prov,suc,razones,emp,ligas]=await Promise.all([
  supabase.from('proveedores').select('id,razon_social,nombre_comercial,rfc').returns<Proveedor[]>(),
  supabase.from('sucursales').select('id,nombre').returns<{id:string;nombre:string}[]>(),
  leer('las razones sociales',()=>leerRazonesSociales(supabase)),
  supabase.from('empresa').select('dias_pago').maybeSingle<{dias_pago:number[]|null}>(),
  leer('las órdenes de las facturas',()=>leerTodo<{factura_id:string;ordenes_compra:{sucursal_id:string|null}|null}>((d,h)=>
   supabase.from('factura_ordenes').select('factura_id,ordenes_compra(sucursal_id)').order('factura_id').range(d,h).returns<{factura_id:string;ordenes_compra:{sucursal_id:string|null}|null}[]>())),
 ]);
 if(prov.error||suc.error)throw Error('No se pudieron consultar proveedores o sucursales.');
 const proveedores=prov.data??[];
 let elegidos:Proveedor[]|null=null;
 if(a.proveedor){
  elegidos=buscarProveedores(proveedores,a.proveedor);
  if(!elegidos.length)throw Error(`Ningún proveedor coincide con "${a.proveedor}". Prueba con otra parte del nombre; esto no significa que no haya compras o deuda.`);
 }
 const sucursales=new Map((suc.data??[]).map(s=>[s.id,s.nombre]));
 const ctx:ContextoCompras={
  hoy:hoyCalendarioMX(),dias:emp.data?.dias_pago?.length?emp.data.dias_pago:[5],
  empresas:new Map(razones.map(r=>[r.rfc.trim().toUpperCase(),r.razon_social])),sucursales,sucursalesDe:mapaSucursales(ligas),
  filtro:{sucursal:a.sucursal,proveedores:elegidos?new Set(elegidos.map(x=>x.id)):null},
 };
 return {ctx,nombres:new Map(proveedores.map(x=>[x.id,nombreDe(x)])),
  filtro:{sucursal:a.sucursal?sucursales.get(a.sucursal)??a.sucursal:'todas',proveedores:elegidos?elegidos.map(nombreDe):'todos'},
  // Liga a la pantalla: Pagos filtra por un solo proveedor y una sucursal.
  params:(base:string)=>{const q=new URLSearchParams();if(elegidos?.length===1)q.set('proveedor',elegidos[0].id);if(a.sucursal)q.set('sucursal',a.sucursal);const s=q.toString();return s?`${base}?${s}`:base;}};
}

const NOTA_COMUN='Montos en MXN. Proveedores por nombre comercial (o razón social). No se incluyen RFC, cuentas bancarias, referencias, notas ni archivos.';

export async function ejecutarCompras(supabase:SupabaseClient,a:ArgsCompras):Promise<object> {
 const {ctx,nombres,filtro,params}=await contexto(supabase,a);
 switch(a.herramienta){
  case 'por_pagar':{
   const [facturas,[compromisos,fechas]]=await Promise.all([
    leer('las facturas por pagar',()=>leerTodo<FacturaPorPagar>((d,h)=>supabase.from('facturas_saldo')
     .select('id,serie,folio,saldo,vence_el,pago_programado_el,estado,proveedor_id,sucursal_id,rfc_receptor,proveedores(razon_social,nombre_comercial)')
     .eq('tipo','ingreso').in('estado',['por_pagar','parcial']).order('vence_el').order('id').range(d,h).returns<FacturaPorPagar[]>())),
    // Igual que Pagos: si los compromisos no cargan, la deuda real se reporta igual.
    Promise.all([leerCompromisos(supabase),leerFechas(supabase,ventanaCompromisos(ctx.hoy).desde,ventanaCompromisos(ctx.hoy).hasta)])
     .catch(()=>[[],[]] as [Awaited<ReturnType<typeof leerCompromisos>>,Awaited<ReturnType<typeof leerFechas>>]),
   ]);
   const mcp=compromisos.map(x=>({id:x.id,concepto:x.concepto,sucursal_id:x.sucursal_id,proveedor_id:x.proveedor_id,proveedores:x.proveedores,
    monto:x.monto_variable?null:importesDe(x).total,variable:!!x.monto_variable}));
   return {hoy:ctx.hoy,filtro,...resumenPorPagar(facturas,mcp,fechas,ctx),
    nota:`saldo es lo que falta pagar (total del CFDI menos notas de crédito y pagos). vencido = ya pasó el vencimiento; estaSemana y proximos30Dias usan la fecha de pago, no incluyen lo vencido. compromisosSinFactura es un estimado aparte: no lo sumes a la deuda sin aclararlo. ${NOTA_COMUN}`,
    fuente:params('/compras/pagos')};
  }
  case 'pagos':{
   const aplicaciones=await leer('los pagos',()=>leerTodo<AplicacionPago>((d,h)=>supabase.from('pago_aplicaciones')
    .select('pago_id,factura_id,monto,facturas(sucursal_id,rfc_receptor),pagos!inner(fecha,anulado_en,proveedor_id,forma,origen_fondos)')
    .gte('pagos.fecha',a.desde).lte('pagos.fecha',a.hasta).order('id').range(d,h).returns<AplicacionPago[]>()));
   return {periodo:{desde:a.desde,hasta:a.hasta},filtro,...resumenPagosHechos(aplicaciones,nombres,ctx),
    nota:`Pagos por fecha del pago, sin anulados, atribuidos por lo aplicado a cada factura. forma: transferencia, efectivo, tarjeta o cheque; origenFondos: de dónde salió el dinero (transferencia bancaria, bóveda, ventas del día, tarjeta o histórico). ${NOTA_COMUN}`,
    fuente:params('/compras/pagos')};
  }
  case 'compras':{
   const facturas=await leer('las facturas',()=>leerTodo<FacturaEmitida>((d,h)=>supabase.from('facturas_saldo')
    .select('id,proveedor_id,sucursal_id,rfc_receptor,cuenta_pl,neto,estado,tipo,fecha_emision,proveedores(razon_social,nombre_comercial)')
    .eq('tipo','ingreso').neq('estado','cancelada').gte('fecha_emision',a.desde).lte('fecha_emision',a.hasta).order('fecha_emision').order('id').range(d,h).returns<FacturaEmitida[]>()));
   return {periodo:{desde:a.desde,hasta:a.hasta},filtro,...resumenCompras(facturas,ctx),
    nota:`Compras = facturas recibidas por fecha de emisión; monto = neto (total del CFDI con IVA y menos retenciones, menos notas de crédito). Una factura ligada a órdenes de varias sucursales sale como "Varias sucursales". Gastos sin CFDI capturados a mano sí cuentan. No es lo pagado. ${NOTA_COMUN}`,
    fuente:'/compras/facturas'};
  }
  case 'ordenes':{
   const [ordenes,renglones]=await Promise.all([
    leer('las órdenes de compra',()=>leerTodo<OrdenMCP>((d,h)=>supabase.from('ordenes_compra')
     .select('id,folio,proveedor_id,sucursal_id,estado,entrega_esperada,proveedores(razon_social,nombre_comercial),sucursales(nombre)')
     .eq('estado','confirmada').order('entrega_esperada').order('id').range(d,h).returns<OrdenMCP[]>())),
    leer('lo recibido de las órdenes',()=>leerTodo<RenglonMCP>((d,h)=>supabase.from('renglones_recibido')
     .select('orden_id,descripcion,cantidad,precio,tasa_iva,recibido,ordenes_compra!inner(estado)')
     .eq('ordenes_compra.estado','confirmada').order('id').range(d,h).returns<RenglonMCP[]>())),
   ]);
   return {hoy:ctx.hoy,filtro,...resumenOrdenes(ordenes,renglones,ctx),
    nota:`Solo órdenes confirmadas que no se han recibido completas. estadoEntrega: atrasada (ya pasó la fecha esperada), hoy, a_tiempo o sin_fecha. total es el de la orden con IVA. ${NOTA_COMUN}`,
    fuente:'/compras/recepciones'};
  }
 }
}
