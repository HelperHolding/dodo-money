import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seleccionarCorrida,libroCorrida,nombresCorrida,validarFiltroCorrida,type FacturaCorrida} from './corridaPagos.ts';
import {escribirXlsx} from '../xlsx-escribir.ts';
import {leerHojas} from '../ventas/xlsx.ts';
const filtro={desde:'2026-10-15',hasta:'2026-10-16',fecha:'2026-10-16'};
const sedes=new Map([['z','Zapopan-1'],['d','dodo-2']]);
const factura:FacturaCorrida={id:'f1',uuid:'12345678-1234-1234-1234-123456789ABC',proveedor_id:'p',proveedor:'Proveedor de prueba',nombre:'001',rfc_receptor:'HCM260306B93',empresa:'HELPER COMERCIALIZADORA MASTER',empresaActiva:true,sucursal_id:'z',fecha_emision:'2026-10-10',vence_el:'2026-10-15',fechaPago:'2026-10-15',pago_programado_el:'2026-10-15',formaPrevista:'Transferencia',estado:'parcial',tipo:'ingreso',saldo:60.20,total:100.20,origen:'cfdi',falta_complemento:false,conceptos:['Insumos']};

test('corrida: el UUID manual aparece identificado sin alterar el saldo',()=>{
 const filas=seleccionarCorrida([{...factura,origen:'manual'}],[],sedes,filtro);
 assert.ok(filas[0].advertencias.includes('UUID capturado manualmente; XML pendiente.'));
 const libro=libroCorrida(filas,filtro,'2026-10-16');const z=libro.hojas.find(h=>h.nombre==='Zapopan-1')!;
 assert.equal(z.filas[4][10],factura.uuid);assert.equal(libro.total,60.20);
 assert.ok(String(z.filas[4][9]).includes('XML pendiente'));
});

test('corrida: UUID real o vacío y liga al calendario en todas las hojas',()=>{
 const filas=seleccionarCorrida([factura,{...factura,id:'manual',uuid:null,origen:'manual'}],[],sedes,filtro);
 const libro=libroCorrida(filas,filtro,'2026-10-16');
 const hojas=leerHojas(escribirXlsx(libro.hojas,{nombres:libro.nombres}));
 const z=hojas.find(h=>h.nombre==='Zapopan-1')!;
 assert.equal(z.celdas.get('K3'),'UUID');assert.equal(z.celdas.get('K5'),factura.uuid);assert.equal(z.celdas.get('K6')??'','');
 const pendientes=hojas.at(-1)!;assert.equal(pendientes.celdas.get('I3'),'UUID');assert.equal(pendientes.celdas.get('I4')??'','');
 for(const h of libro.hojas)assert.ok(h.filas.some(f=>f.some(c=>typeof c==='object'&&c!==null&&'formula' in c&&c.formula==='HYPERLINK("https://dodo-money-j31t.vercel.app/compras/pagos","Abrir calendario de pagos de Dodo MX")')));
 assert.equal(libro.total,120.40);
});
test('corrida: rango inclusivo, saldo real restante y sin pagadas, canceladas, notas ni cero',()=>{
 const filas=seleccionarCorrida([factura,{...factura,id:'fin',fechaPago:'2026-10-16'},...['pagada','cancelada'].map(estado=>({...factura,id:estado,estado})),{...factura,id:'cero',saldo:0},{...factura,id:'nota',tipo:'egreso'},{...factura,id:'fuera',fechaPago:'2026-10-17'}],[],sedes,filtro);
 assert.deepEqual(filas.map(f=>f.id),['f1','fin']);assert.equal(filas[0].saldo,60.20);assert.equal(filas[0].total,100.20);
});
test('corrida: respeta proveedor, sucursal y complemento del calendario',()=>{
 assert.equal(seleccionarCorrida([factura],[],sedes,{...filtro,proveedor:'otro'}).length,0);
 assert.equal(seleccionarCorrida([factura],[],sedes,{...filtro,sucursal:'d'}).length,0);
 assert.equal(seleccionarCorrida([factura],[],sedes,{...filtro,complemento:'si'}).length,0);
 assert.equal(seleccionarCorrida([{...factura,falta_complemento:true}],[],sedes,{...filtro,complemento:'si'}).length,1);
});
test('corrida: varias órdenes de la misma sucursal no duplican factura ni saldo',()=>{
 const filas=seleccionarCorrida([factura,factura],[{factura_id:'f1',sucursal_id:'z'},{factura_id:'f1',sucursal_id:'z'}],sedes,filtro);
 assert.equal(filas.length,1);assert.equal(filas[0].sinDistribuir,false);assert.equal(libroCorrida(filas,filtro,'2026-10-15').total,60.20);
});
test('corrida: una factura de varias sucursales va a revisión sin duplicarla en el pago',()=>{
 const filas=seleccionarCorrida([factura],[{factura_id:'f1',sucursal_id:'z'},{factura_id:'f1',sucursal_id:'d'}],sedes,{...filtro,sucursal:'z'});
 assert.equal(filas[0].sinDistribuir,true);const libro=libroCorrida(filas,filtro,'2026-10-15');assert.equal(libro.total,0);assert.equal(libro.excluidas,1);assert.equal(libro.hojas.at(-1)?.filas[3][1],'NO INCLUIDO');
});
test('corrida: agrupa por sucursal, separa proveedores por empresa y reconcilia centavos',()=>{
 const filas=seleccionarCorrida([factura,{...factura,id:'f2',nombre:'002',rfc_receptor:'CMS230321FI8',empresa:'SITRU',saldo:0.10,total:0.10},{...factura,id:'f3',sucursal_id:'d',saldo:0.20,total:0.20}],[],sedes,filtro);
 const libro=libroCorrida(filas,filtro,'2026-10-15');assert.equal(libro.total,60.50);assert.deepEqual(libro.hojas.map(h=>h.nombre),['Resumen','dodo-2','Zapopan-1','Pendientes de revisión']);
 const z=libro.hojas.find(h=>h.nombre==='Zapopan-1')!;assert.equal(z.filas.filter(f=>typeof f[0]==='string'&&f[0].startsWith('Proveedor de prueba ·')).length,2);
 const leidas=leerHojas(escribirXlsx(libro.hojas,{nombres:libro.nombres}));const resumen=leidas[0].celdas;
 const totalFila=libro.hojas[0].filas.findIndex(f=>f[0]==='TOTAL GENERAL (MXN)')+1;assert.equal(resumen.get('C'+totalFila),60.50);
 assert.equal(resumen.get('D'+totalFila),'');assert.equal(resumen.get('E'+totalFila),'');
});
test('corrida: incluye alertas de datos faltantes sin inventar banco ni duplicar en totales',()=>{
 const filas=seleccionarCorrida([{...factura,formaPrevista:null,origen:'manual',empresaActiva:false,falta_complemento:true}],[],sedes,filtro);
 assert.equal(filas[0].advertencias.length,4);const libro=libroCorrida(filas,filtro,'2026-10-15');assert.equal(libro.total,60.20);assert.equal(libro.hojas.at(-1)?.filas[3][1],'INCLUIDO · REVISAR');
 assert.ok(!JSON.stringify(libro).includes('Banregio'));assert.ok(!JSON.stringify(libro).includes('Paywise'));
});
test('corrida: Oficina, sin datos y nombres incompatibles con Excel',()=>{
 const filas=seleccionarCorrida([{...factura,sucursal_id:null}],[],sedes,filtro);assert.equal(filas[0].destino,'Oficina');
 assert.deepEqual(libroCorrida([],filtro,'2026-10-15').hojas.map(h=>h.nombre),['Resumen','Pendientes de revisión']);
 const nombres=[...nombresCorrida([{id:'1',nombre:'Resumen'},{id:'2',nombre:'Zapopan/1'},{id:'3',nombre:'Zapopan:1'},{id:'4',nombre:'X'.repeat(50)}]).values()];assert.equal(new Set(nombres).size,4);assert.ok(nombres.every(n=>n.length<=31&&!/[\\/?*[\]:]/.test(n)));
});
test('corrida: rechaza fechas inexistentes, rango invertido y rango excesivo',()=>{
 assert.equal(validarFiltroCorrida(filtro),null);assert.ok(validarFiltroCorrida({...filtro,fecha:'2026-02-30'}));assert.ok(validarFiltroCorrida({...filtro,hasta:'2026-10-01'}));assert.ok(validarFiltroCorrida({...filtro,hasta:'2028-10-01'}));
});
