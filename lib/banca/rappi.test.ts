import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leerFinancieroRappi,resumenFinancieroRappi,efectoPLRappi,type MovimientoRappi,type ReporteRappi} from './rappi.ts';
import type {Hoja} from '../ventas/xlsx.ts';
const fila=(c:Partial<MovimientoRappi>={}):MovimientoRappi=>({fila:3,fecha:'2026-10-02',orden:'99999001',tienda:'99999000',lote:'99999100',tipo:'ORDEN',estado:'pending_review',bruta:165,aliado:-39.6,dar:-26.4,compensacion:0,cancelacion:0,comision:-22.572,creditoDar:22.758622,ivaComision:-3.61152,creditoDarIva:3.641379,retencionIva:-6.827586,retencionIsr:-2.133621,neto:90.255274,...c});
const reporte=(movimientos:MovimientoRappi[]):ReporteRappi=>({desde:'2026-10-02',hasta:'2026-10-03',tienda:'99999000',movimientos,uuidsComision:[],facturasComision:[]});
test('financiero: DAR se resta y se repone; neto conserva seis decimales y no es otra venta',()=>{
 const r=resumenFinancieroRappi([fila()]);assert.equal(r.efectiva,99);assert.equal(r.neto,90.26);assert.equal(r.baseRetencion,85.34);assert.equal(r.facturacion,99);assert.equal(r.creditoDar+r.creditoDarIva,26.400000000000002);assert.equal(r.excedente,.19);assert.equal(r.comisionEsperada,0);
});
test('financiero: compensación no duplica pedidos y cancelada con cargo se conserva',()=>{
 const r=resumenFinancieroRappi([fila(),fila({tipo:'COMPENSACIÓN',bruta:0,aliado:0,dar:0,comision:0,creditoDar:0,ivaComision:0,creditoDarIva:0,retencionIva:0,retencionIsr:0,compensacion:-10,neto:-10}),fila({orden:'99999002',estado:'canceled_with_charge',bruta:100,aliado:0,dar:0,comision:0,creditoDar:0,ivaComision:0,creditoDarIva:0,retencionIva:0,retencionIsr:0,cancelacion:-60,neto:40})]);
 assert.equal(r.movimientos,3);assert.equal(r.pedidos,2);assert.equal(r.compensaciones,-10);assert.equal(r.cancelaciones,-60);assert.equal(r.neto,120.26);
});
test('P&L: netea DAR a nivel lote completo y reparte rangos sin convertir retención en gasto',()=>{
 const a=fila({comision:-20,creditoDar:0,dar:0,creditoDarIva:0,ivaComision:-3.2}),b=fila({orden:'99999002',fecha:'2026-10-03',comision:-20,creditoDar:30,dar:-34.8,creditoDarIva:4.8,ivaComision:-3.2});
 const r=reporte([a,b]),todo=efectoPLRappi([r],'2026-10-02','2026-10-03'),primero=efectoPLRappi([r],'2026-10-02','2026-10-02'),segundo=efectoPLRappi([r],'2026-10-03','2026-10-03');
 assert.equal(todo.comision,10);assert.equal(todo.excedente,0);assert.equal(primero.comision,5);assert.equal(segundo.comision,5);assert.equal(todo.ajustes,0);
 r.facturasComision=[{uuid:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',lote:'99999100',subtotal:10.01,iva:1.6,total:11.61}];assert.equal(efectoPLRappi([r],r.desde,r.hasta).comision,10.01);
});
test('P&L: sin paidlot es provisional y periodo vacío no inventa ingresos',()=>{
 const r=reporte([fila({lote:null})]);assert.equal(efectoPLRappi([r],r.desde,r.hasta).provisional,true);assert.equal(efectoPLRappi([r],'2026-11-01','2026-11-02').ventaNeta,0);assert.equal(efectoPLRappi([r],'2026-11-01','2026-11-02').excedente,0);assert.equal(efectoPLRappi([r],'2026-11-01','2026-11-02').provisional,false);
});
test('P&L: el centavo del lote se conserva al dividir en días o semanas',()=>{
 const fechas=['2026-10-02','2026-10-03','2026-10-04'],r=reporte(fechas.map((fecha,i)=>fila({orden:String(99999001+i),fecha,comision:-1,creditoDar:.996666})));
 assert.equal(efectoPLRappi([r],fechas[0],fechas[2]).comision,.01);assert.equal(fechas.reduce((s,f)=>s+efectoPLRappi([r],f,f).comision,0),.01);
});
const columnas:Record<string,string>={A:'Fecha de creación orden',B:'ID de la órden',C:'ID del paidlot',D:'ID de la tienda',I:'Estado de la órden',P:'Tipo de transacción',R:'Venta Bruta',T:'Descuento de Producto asumido por el aliado',U:'Descuentos por inversión de Rappi DAR',AA:'Compensaciones',AB:'Costo Canceladas',AC:'Uso y alquiler de plataforma Rappi',AD:'Descuento por inversión de Rappi a aplicar sobre Uso y alquiler de plataforma Rappi DAR',AS:'IVA Uso y alquiler de plataforma Rappi',AT:'Descuento por inversión de Rappi a aplicar sobre el IVA Uso y alquiler de plataforma Rappi DAR',AV:'Reteiva Ventas',AX:'ISR',BL:'Valor Neto',AF:'Tarifa de Integration'};
function hoja():Hoja{const c=new Map<string,string|number>();for(const [k,v]of Object.entries(columnas))c.set(k+'2',v);for(const [k,v]of Object.entries({A:'vie. 02 oct. 2026, 1:00:00 p. m.',B:99999001,C:99999100,D:99999000,I:'pending_review',P:'ORDEN',R:165,T:-39.6,U:-26.4,AA:0,AB:0,AC:-22.572,AD:22.758622,AS:-3.61152,AT:3.641379,AV:-6.827586,AX:-2.133621,BL:90.255274}))c.set(k+'3',v);return {nombre:'Detalle',celdas:c};}
test('importación: lee encabezados por nombre, fecha mexicana y valores financieros originales',()=>{const r=leerFinancieroRappi([hoja()],'2026-10-22');assert.equal(r.movimientos.length,1);assert.equal(r.desde,'2026-10-02');assert.equal(r.movimientos[0].neto,90.255274);});
test('importación: rechaza nuevo cargo no soportado, neto ausente, DAR roto y estados desconocidos',()=>{
 for(const [campo,valor]of [['AF3',10],['BL3',99],['AT3',10],['I3','nuevo_estado'],['A3','vie. 31 feb. 2026']] as const){const h=hoja();(h.celdas as Map<string,string|number>).set(campo,valor);assert.throws(()=>leerFinancieroRappi([h],'2026-10-22'));}
 const h=hoja();(h.celdas as Map<string,string|number>).delete('BL3');assert.throws(()=>leerFinancieroRappi([h],'2026-10-22'),/neto/);
});
test('importación: acepta el Excel como lo exporta Rappi, con Valor Neto sin calcular (todo BL en 0)',()=>{
 const h=hoja(),c=h.celdas as Map<string,string|number>;c.set('BL3',0);
 assert.equal(leerFinancieroRappi([h],'2026-10-22').movimientos[0].neto,90.255274);
 // Si alguna fila sí trae su neto calculado, todas deben cuadrar.
 for(const [k,v]of [...c])if(k.endsWith('3'))c.set(k.slice(0,-1)+'4',v);c.set('B4',99999002);c.set('BL4',90.255274);
 assert.throws(()=>leerFinancieroRappi([h],'2026-10-22'),/BL3/);
});
test('importación: varias compensaciones de una orden se suman en un movimiento',()=>{
 const h=hoja(),c=h.celdas as Map<string,string|number>;c.set('BL3',0);
 // Orden 99999005 con dos productos compensados ($198.55 y $119.15), como en el reporte de octubre.
 for(const [fila,monto]of [[4,-198.55],[5,-119.15]] as const){for(const [k,v]of [...c])if(/^[A-Z]+3$/.test(k))c.set(k.slice(0,-1)+fila,0);c.set('A'+fila,'dom. 25 oct. 2026, 7:29:05 p. m.');c.set('B'+fila,99999005);c.set('C'+fila,99999100);c.set('D'+fila,99999000);c.set('I'+fila,'');c.set('P'+fila,'COMPENSACIÓN');c.set('AA'+fila,monto);}
 const r=leerFinancieroRappi([h],'2026-10-30'),comp=r.movimientos.filter(m=>m.tipo==='COMPENSACIÓN');
 assert.equal(comp.length,1);assert.equal(comp[0].compensacion,-317.7);assert.equal(comp[0].neto,-317.7);
 c.set('C5',99999101);assert.throws(()=>leerFinancieroRappi([h],'2026-10-30'),/misma orden/);
});
test('importación: rechaza movimientos duplicados, sin tienda y futuros',()=>{
 const h=hoja(),c=h.celdas as Map<string,string|number>;for(const [k,v]of [...c])if(k.endsWith('3'))c.set(k.slice(0,-1)+'4',v);assert.throws(()=>leerFinancieroRappi([h],'2026-10-22'),/repetido/);
 const otra=hoja();(otra.celdas as Map<string,string|number>).set('D3','');assert.throws(()=>leerFinancieroRappi([otra],'2026-10-22'));assert.throws(()=>leerFinancieroRappi([hoja()],'2026-10-01'));
});
