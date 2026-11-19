import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenTiempos} from './tiempos.ts';

const A='aaaaaaaa-0000-4000-8000-000000000001',B='bbbbbbbb-0000-4000-8000-000000000002';
// Pedido de prueba: empieza a cocinarse a la hora del pedido; `cocina` y `entrega` en minutos (null = sin hora registrada).
function p(id:string,sucursal:string,hora:string,cocina:number|null,entrega:number|null,extra:Record<string,unknown>={}) {
 const base=Date.parse(`2026-11-10T${hora}:00-06:00`),en=(m:number)=>new Date(base+m*60000).toISOString();
 return {dodo_id:id,sucursal_id:sucursal,fecha:'2026-11-10',hora,pago:'tarjeta',tipo:'en_tienda',origen:'mostrador',para_llevar:false,estado:'entregado',total:200,total_sin_descuento:200,
  inicio_coccion:cocina===null?null:en(0),listo:cocina===null?null:en(cocina),entregado:entrega===null?null:en(entrega),...extra} as never;
}
const nombres=new Map([[A,'Zapopan-1 La Calma'],[B,'Guadalajara-1 López Mateos']]);

test('tiempos: medianas, lentos, por hora y cobertura con el cálculo de Ventas',()=>{
 const r=resumenTiempos([p('1',A,'13:05',10,20),p('2',A,'13:40',20,30),p('3',A,'20:10',12,25),p('4',A,'20:30',null,null)],nombres);
 assert.equal(r.sinDatos,false);
 assert.deepEqual(r.cobertura,{pedidos:4,conTiempoCocina:3,conTiempoEntrega:3,pctConTiempo:75,diasConTiempo:1});
 assert.deepEqual([r.general.medianaCocinaMin,r.general.medianaEntregaMin,r.general.lentos,r.general.pctLentos],[12,25,1,33.3]);
 assert.deepEqual(r.general.porHora,[{hora:13,medianaCocinaMin:15,pedidos:2},{hora:20,medianaCocinaMin:12,pedidos:1}]);
 assert.equal(r.general.masLentos[0].minutos,20);assert.equal(r.minutosLento,15);
 assert.equal(r.porSucursal,null);
});

test('tiempos: por sucursal, de la más lenta a la más rápida, solo con varias sucursales',()=>{
 const r=resumenTiempos([p('1',A,'13:00',10,20),p('2',B,'13:00',18,35),p('3',B,'14:00',null,null)],nombres);
 assert.deepEqual(r.porSucursal,[
  {sucursal_id:B,sucursal:'Guadalajara-1 López Mateos',medianaCocinaMin:18,medianaEntregaMin:35,pctLentos:100,pedidosConTiempo:1,pedidos:2,pctConTiempo:50,diasConTiempo:1,muestraChica:true},
  {sucursal_id:A,sucursal:'Zapopan-1 La Calma',medianaCocinaMin:10,medianaEntregaMin:20,pctLentos:0,pedidosConTiempo:1,pedidos:1,pctConTiempo:100,diasConTiempo:1,muestraChica:true}]);
});

test('tiempos: sin horas registradas lo dice, no reporta cero minutos',()=>{
 const r=resumenTiempos([p('1',A,'13:00',null,null),p('2',A,'14:00',null,null)],nombres);
 assert.equal(r.sinDatos,true);
 assert.equal(r.general.medianaCocinaMin,null);assert.equal(r.general.pctLentos,null);
 assert.deepEqual(r.cobertura,{pedidos:2,conTiempoCocina:0,conTiempoEntrega:0,pctConTiempo:0,diasConTiempo:0});
});

test('tiempos: no cuenta comida del personal ni cancelados',()=>{
 const r=resumenTiempos([p('1',A,'13:00',10,20),p('2',A,'13:00',40,50,{tipo:'personal'}),p('3',A,'13:00',40,50,{estado:'cancelado'})],nombres);
 assert.equal(r.cobertura.pedidos,1);assert.equal(r.general.medianaCocinaMin,10);
});

test('tiempos: una sucursal con muestra chica va después de las comparables aunque su mediana sea mayor',()=>{
 const muchos=Array.from({length:30},(_,i)=>p('a'+i,A,'13:00',12,20,{fecha:i<15?'2026-11-10':'2026-11-11'}));
 const r=resumenTiempos([...muchos,p('b1',B,'13:00',25,40),p('b2',B,'13:00',30,45)],nombres);
 assert.deepEqual(r.porSucursal!.map(x=>[x.sucursal,x.medianaCocinaMin,x.muestraChica,x.diasConTiempo]),[['Zapopan-1 La Calma',12,false,2],['Guadalajara-1 López Mateos',27.5,true,1]]);
 assert.equal(r.minimoComparable,30);
});
