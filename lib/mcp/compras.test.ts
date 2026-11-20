import {test} from 'node:test';
import assert from 'node:assert/strict';
import {elegirProveedores,mapaSucursales,resumenPorPagar,resumenPagosHechos,resumenCompras,resumenOrdenes,type ContextoCompras} from './compras.ts';

const S1='11111111-0000-4000-8000-000000000001',S2='22222222-0000-4000-8000-000000000002';
const P1='aaaaaaaa-0000-4000-8000-00000000000a',P2='bbbbbbbb-0000-4000-8000-00000000000b';
const RFC_A='HCM260306B93',RFC_B='DOD010101AA1';
const prov=(id:string)=>id===P1?{razon_social:'Lácteos del Bajío SA de CV',nombre_comercial:'Lácteos Bajío'}:{razon_social:'Harinas Finas SA',nombre_comercial:null};
// Hoy jueves 19 de noviembre de 2026; se paga los viernes (día 5).
const ctx=(filtro:Partial<ContextoCompras['filtro']>={},ligas:{factura_id:string;ordenes_compra:{sucursal_id:string|null}|null}[]=[]):ContextoCompras=>({
 hoy:'2026-11-19',dias:[5],
 empresas:new Map([[RFC_A,'Helper Comercializadora Master'],[RFC_B,'Dodo Occidente']]),
 sucursales:new Map([[S1,'Zapopan-1 La Calma'],[S2,'Guadalajara-1 López Mateos']]),
 sucursalesDe:mapaSucursales(ligas),
 filtro:{sucursal:null,proveedores:null,...filtro},
});
const fac=(id:string,o:Record<string,unknown>)=>({id,serie:'A',folio:id,saldo:1000,vence_el:'2026-11-25',pago_programado_el:null,estado:'por_pagar',proveedor_id:P1,sucursal_id:S1,rfc_receptor:RFC_A,proveedores:prov(String(o.proveedor_id??P1)),...o}) as never;

const p=(id:string,razon_social:string,nombre_comercial:string|null=null)=>({id,razon_social,nombre_comercial});
test('proveedor: se queda con la mejor coincidencia y no mezcla parecidos',()=>{
 const nombres=(xs:{razon_social:string;nombre_comercial:string|null}[])=>xs.map(x=>x.nombre_comercial??x.razon_social);
 assert.deepEqual(nombres(elegirProveedores([p('1','Coca-Cola FEMSA','Coca-Cola'),p('2','Roca Hielos SA'),p('3','Comercializadora Boca')],'Coca')),['Coca-Cola']);
 assert.deepEqual(nombres(elegirProveedores([p('1','Gas Nieto SA'),p('2','Pollos Gasca'),p('3','Las Vegas Distribuidora')],'gas')),['Gas Nieto SA']);
 assert.deepEqual(nombres(elegirProveedores([p('1','Grupo Lala SAB'),p('2','Sala Eventos'),p('3','Lalo Pérez')],'Lala')),['Grupo Lala SAB']);
 assert.deepEqual(nombres(elegirProveedores([p('1','Lácteos del Bajío SA de CV','Lácteos Bajío'),p('2','Harinas Finas SA')],'Laceos Bajio')),['Lácteos Bajío']);
});
test('proveedor: varios igual de buenos es error con candidatos; RFC o nada es "ningún proveedor"',()=>{
 assert.throws(()=>elegirProveedores([p('1','Lácteos del Bajío','Lácteos Bajío'),p('2','Lácteos del Norte')],'lacteos'),/Varios proveedores coinciden.*Lácteos Bajío.*Lácteos del Norte/);
 assert.throws(()=>elegirProveedores([{...p('1','Lácteos del Bajío'),rfc:'LBA010101AB1'} as never],'LBA0101'),/Ningún proveedor coincide/);
 assert.throws(()=>elegirProveedores([p('1','Harinas Finas SA')],'zzzz'),/Ningún proveedor coincide/);
});

test('por_pagar: vencido, semana y 30 días con el cálculo de Pagos; el sugerido usa el día de pago',()=>{
 const r=resumenPorPagar([
  fac('1',{saldo:500,vence_el:'2026-11-10'}),                       // vencida
  fac('2',{saldo:300,vence_el:'2026-11-25'}),                       // sugerido viernes 20 → esta semana
  fac('3',{saldo:200,vence_el:'2026-12-10',proveedor_id:P2,proveedores:prov(P2),rfc_receptor:RFC_B}),
  fac('4',{saldo:0,vence_el:'2026-11-25'}),                         // sin saldo: fuera
 ],[],[],ctx());
 assert.deepEqual(r.resumen,{saldoTotal:1000,vencido:500,estaSemana:300,proximos30Dias:500,facturas:3});
 assert.deepEqual(r.porProveedor.map(x=>[x.proveedor,x.saldo,x.vencido,x.facturas]),[['Lácteos Bajío',800,500,2],['Harinas Finas SA',200,0,1]]);
 assert.equal(r.porProveedorTruncado,false);
 assert.deepEqual(r.porRazonSocial.map(x=>[x.razonSocial,x.saldo]),[['Helper Comercializadora Master',800],['Dodo Occidente',200]]);
 assert.deepEqual(r.facturas.map(f=>[f.folio,f.fechaPago,f.vencida]),[['A-1','2026-11-20',true],['A-2','2026-11-20',false],['A-3','2026-12-04',false]]);
 assert.deepEqual(r.facturas[0].sucursales,['Zapopan-1 La Calma']);
});

test('por_pagar: más de 20 proveedores avisa que la lista está recortada',()=>{
 const muchas=Array.from({length:25},(_,i)=>fac(String(i),{proveedor_id:`p${i}`,proveedores:{razon_social:`Proveedor ${i}`,nombre_comercial:null}}));
 const r=resumenPorPagar(muchas,[],[],ctx());
 assert.equal(r.porProveedor.length,20);assert.equal(r.porProveedorTruncado,true);assert.equal(r.resumen.saldoTotal,25000);
});

test('por_pagar: las razones sociales sin identificar salen en un solo renglón',()=>{
 const r=resumenPorPagar([fac('1',{rfc_receptor:'XAXX010101000'}),fac('2',{rfc_receptor:null}),fac('3',{})],[],[],ctx());
 assert.deepEqual(r.porRazonSocial,[{razonSocial:'Helper Comercializadora Master',saldo:1000,facturas:1},{razonSocial:'Razón social por identificar',saldo:2000,facturas:2}]);
});

test('por_pagar: nunca manda UUID, RFC ni rutas de archivos',()=>{
 const r=resumenPorPagar([fac('1',{uuid:'6F9619FF-8B86-D011-B42D-00C04FC964FF',xml_ruta:'x.xml',pdf_ruta:'x.pdf'})],[],[],ctx());
 const texto=JSON.stringify(r);
 for(const prohibido of ['6F9619FF','x.xml','x.pdf',RFC_A])assert.ok(!texto.includes(prohibido),prohibido);
});

test('por_pagar: filtra por proveedor y por sucursal de la orden (o la de la factura sin orden)',()=>{
 const ligas=[{factura_id:'1',ordenes_compra:{sucursal_id:S2}}];
 const fs=[fac('1',{sucursal_id:S1}),fac('2',{sucursal_id:S1}),fac('3',{proveedor_id:P2,proveedores:prov(P2),sucursal_id:S2})];
 assert.deepEqual(resumenPorPagar(fs,[],[],ctx({sucursal:S2},ligas)).facturas.map(f=>f.folio),['A-1','A-3']);
 assert.deepEqual(resumenPorPagar(fs,[],[],ctx({proveedores:new Set([P2])},ligas)).facturas.map(f=>f.folio),['A-3']);
});

const fecha=(compromiso_id:string,vence:string,servicio_nota:string|null=null)=>({compromiso_id,vence,fecha_id:null,factura_id:null,factura_estado:null,factura_saldo:null,omitida_motivo:null,servicio:'pendiente',servicio_fecha:null,servicio_nota,revision:0});
test('por_pagar: compromisos sin factura van aparte como estimado; los variables no suman',()=>{
 const compromisos=[{id:'c1',concepto:'renta',sucursal_id:S1,proveedor_id:P2,proveedores:prov(P2),monto:11600,variable:false},{id:'c2',concepto:'internet',sucursal_id:S1,proveedor_id:P2,proveedores:prov(P2),monto:null,variable:true}] as never;
 const fechas=[fecha('c1','2026-11-01'),fecha('c1','2026-12-01','nota interna'),fecha('c2','2026-11-22'),fecha('c1','2027-03-01')] as never;
 const r=resumenPorPagar([],compromisos,fechas,ctx());
 assert.equal(r.compromisosSinFactura.disponible,true);
 assert.deepEqual(r.compromisosSinFactura.resumen,{vencidoEstimado:11600,estaSemanaEstimado:0,proximos30DiasEstimado:11600,conMontoVariable:1});
 assert.deepEqual(r.compromisosSinFactura.lista.map(x=>[x.concepto,x.vence,x.fechaPago,x.montoEstimado,x.vencido]),[['Renta','2026-11-01','2026-11-20',11600,true],['Internet','2026-11-22','2026-11-20',null,false],['Renta','2026-12-01','2026-11-27',11600,false]]);
 assert.equal(r.compromisosSinFactura.listaTruncada,false);
 assert.ok(!JSON.stringify(r).includes('nota interna'));
 assert.equal(r.resumen.saldoTotal,0);
});

test('por_pagar: si los compromisos no cargaron se dice, no se reportan en cero',()=>{
 const r=resumenPorPagar([fac('1',{})],null,[],ctx());
 assert.deepEqual(r.compromisosSinFactura,{disponible:false,resumen:null,lista:[],listaTruncada:false});
 assert.equal(r.resumen.saldoTotal,1000);
});

const ap=(pago_id:string,monto:number,o:Record<string,unknown>={})=>({pago_id,factura_id:'f'+pago_id,monto:String(monto),facturas:{sucursal_id:S1,rfc_receptor:RFC_A},
 pagos:{fecha:'2026-11-06',anulado_en:null,proveedor_id:P1,forma:'transferencia',origen_fondos:'transferencia',referencia:'REF-SECRETA',cuenta_origen:'CLABE-SECRETA'},...o}) as never;
const nombres=new Map([[P1,'Lácteos Bajío'],[P2,'Harinas Finas SA']]);

test('pagos: suma lo aplicado sin anulados, agrupa por proveedor, forma, origen y razón social',()=>{
 const r=resumenPagosHechos([
  ap('1',700),ap('1',300,{factura_id:'f9'}),
  ap('2',250,{pagos:{fecha:'2026-11-13',anulado_en:null,proveedor_id:P2,forma:'efectivo',origen_fondos:'boveda'},facturas:{sucursal_id:S2,rfc_receptor:RFC_B}}),
  ap('3',999,{pagos:{fecha:'2026-11-14',anulado_en:'2026-11-15T10:00:00Z',proveedor_id:P1,forma:'transferencia',origen_fondos:'transferencia'}}),
 ],nombres,ctx());
 assert.deepEqual([r.total,r.pagos],[1250,2]);
 assert.deepEqual(r.porProveedor.map(x=>[x.proveedor,x.monto,x.pagos]),[['Lácteos Bajío',1000,1],['Harinas Finas SA',250,1]]);
 assert.equal(r.porProveedorTruncado,false);
 assert.deepEqual(r.porForma,[{forma:'transferencia',monto:1000},{forma:'efectivo',monto:250}]);
 assert.deepEqual(r.porOrigenFondos,[{origen:'transferencia',monto:1000},{origen:'boveda',monto:250}]);
 assert.deepEqual(r.porRazonSocial.map(x=>[x.razonSocial,x.monto]),[['Helper Comercializadora Master',1000],['Dodo Occidente',250]]);
 assert.deepEqual(r.lista.map(x=>[x.fecha,x.proveedor,x.monto]),[['2026-11-13','Harinas Finas SA',250],['2026-11-06','Lácteos Bajío',1000]]);
 assert.ok(!/SECRETA/.test(JSON.stringify(r)));
});

test('pagos: con filtro de sucursal solo cuenta lo aplicado a facturas de esa sucursal',()=>{
 const r=resumenPagosHechos([ap('1',700),ap('1',300,{factura_id:'f9',facturas:{sucursal_id:S2,rfc_receptor:RFC_A}})],nombres,ctx({sucursal:S2}));
 assert.deepEqual([r.total,r.pagos],[300,1]);
});

const em=(id:string,o:Record<string,unknown>)=>({id,proveedor_id:P1,sucursal_id:S1,rfc_receptor:RFC_A,neto:'1160.00',estado:'pagada',tipo:'ingreso',fecha_emision:'2026-11-05',proveedores:prov(P1),...o}) as never;
test('compras: neto facturado sin canceladas ni notas de crédito, por proveedor y sucursal; sin cuenta del P&L',()=>{
 const ligas=[{factura_id:'3',ordenes_compra:{sucursal_id:S1}},{factura_id:'3',ordenes_compra:{sucursal_id:S2}}];
 const r=resumenCompras([
  em('1',{}),em('2',{neto:'580',proveedor_id:P2,proveedores:prov(P2),sucursal_id:null}),
  em('3',{neto:'232'}),em('4',{estado:'cancelada',neto:'9999'}),em('5',{tipo:'egreso',neto:'0'}),
 ],ctx({},ligas));
 assert.deepEqual([r.total,r.facturas],[1972,3]);
 assert.deepEqual(r.porProveedor.map(x=>[x.proveedor,x.monto,x.facturas]),[['Lácteos Bajío',1392,2],['Harinas Finas SA',580,1]]);
 assert.deepEqual(r.porSucursal,[{sucursal:'Zapopan-1 La Calma',monto:1160},{sucursal:'Oficina',monto:580},{sucursal:'Varias sucursales',monto:232}]);
 assert.equal('porCuentaPL' in r,false);
});

const oc=(id:string,o:Record<string,unknown>)=>({id,folio:'OC-'+id,proveedor_id:P1,sucursal_id:S1,estado:'confirmada',entrega_esperada:'2026-11-18',notas:'NOTA PRIVADA',proveedores:prov(P1),sucursales:{nombre:'Zapopan-1 La Calma'},...o}) as never;
const ren=(orden_id:string,descripcion:string,cantidad:number,recibido:number,precio=100)=>({orden_id,descripcion,cantidad:String(cantidad),precio:String(precio),tasa_iva:'16',recibido:String(recibido)}) as never;
test('ordenes: confirmadas que faltan por llegar, por estado de entrega, con lo pendiente y su valor',()=>{
 const r=resumenOrdenes([
  oc('1',{}),                                                        // atrasada 1 día, parcial
  oc('2',{entrega_esperada:'2026-11-19'}),                           // hoy
  oc('3',{entrega_esperada:null,proveedor_id:P2,proveedores:prov(P2)}),// sin fecha
  oc('4',{entrega_esperada:'2026-11-25'}),                           // completa: fuera
  oc('5',{estado:'enviada'}),oc('6',{estado:'cerrada'}),            // cotización y cerrada: fuera
 ],[ren('1','Queso mozzarella kg',10,4),ren('1','Pepperoni kg',5,5),ren('2','Harina 25 kg',2,0,500),ren('3','Cajas',100,0,3),ren('4','Salsa',1,1)],ctx());
 assert.deepEqual(r.resumen,{ordenes:3,atrasadas:1,atrasadasMas30Dias:0,hoy:1,aTiempo:0,sinFecha:1,totalPendiente:2204});
 assert.deepEqual(r.ordenes.map(o=>[o.folio,o.estadoEntrega,o.diasAtraso,o.avance,o.total,o.totalPendiente]),[['OC-1','atrasada',1,'parcial',1740,696],['OC-2','hoy',0,'nada',1160,1160],['OC-3','sin_fecha',null,'nada',348,348]]);
 assert.deepEqual(r.ordenes[0].pendientes,[{descripcion:'Queso mozzarella kg',pedido:10,recibido:4,falta:6}]);
 assert.equal(r.ordenes[0].pendientesTotal,1);
 assert.ok(!JSON.stringify(r).includes('NOTA PRIVADA'));
 assert.deepEqual(resumenOrdenes([oc('1',{}),oc('3',{proveedor_id:P2,proveedores:prov(P2)})],[ren('1','x',1,0),ren('3','y',1,0)],ctx({proveedores:new Set([P2])})).ordenes.map(o=>o.folio),['OC-3']);
});

test('ordenes: las atrasadas de hace más de 30 días van al final y se cuentan aparte',()=>{
 const r=resumenOrdenes([oc('viejo',{entrega_esperada:'2026-08-01'}),oc('nuevo',{entrega_esperada:'2026-11-25'}),oc('ayer',{entrega_esperada:'2026-11-18'}),oc('sin',{entrega_esperada:null})],
  [ren('viejo','a',1,0),ren('nuevo','b',1,0),ren('ayer','c',1,0),ren('sin','d',1,0)],ctx());
 assert.deepEqual(r.ordenes.map(o=>[o.folio,o.diasAtraso]),[['OC-ayer',1],['OC-nuevo',null],['OC-sin',null],['OC-viejo',110]]);
 assert.deepEqual([r.resumen.atrasadas,r.resumen.atrasadasMas30Dias],[2,1]);
});
