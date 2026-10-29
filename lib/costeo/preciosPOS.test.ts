import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Extensión explícita para las pruebas con Node strip-types.
import {ultimosPreciosPOS,type LineaPrecioPOS} from './preciosPOS.ts';
const linea=(dodo_id:number,precio:number,fecha:string,hora='12:00:00',extra:Partial<LineaPrecioPOS['pedidos']>={}):LineaPrecioPOS=>({dodo_id,precio_sin_descuento:precio,pedidos:{fecha,hora,agregador:null,tipo:'en_tienda',estado:'entregado',origen:'mostrador',...extra}});

test('precio POS: el precio de lista del cobro más reciente en tienda',()=>{
 const p=ultimosPreciosPOS([linea(88,219,'2026-10-01'),linea(88,229,'2026-10-20','09:00:00'),linea(88,225,'2026-10-20','08:00:00'),linea(90,269,'2026-10-05')],'2026-10-29');
 assert.deepEqual(p.get(88),{precio:229,fecha:'2026-10-20'});
 assert.deepEqual(p.get(90),{precio:269,fecha:'2026-10-05'});
});
test('precio POS: ignora Rappi, personal, cancelados, cortesías y fechas futuras',()=>{
 const p=ultimosPreciosPOS([linea(88,229,'2026-10-01'),linea(88,279,'2026-10-20','12:00:00',{agregador:'Rappi'}),linea(88,0,'2026-10-21'),linea(88,100,'2026-10-22','12:00:00',{tipo:'personal'}),linea(88,199,'2026-10-23','12:00:00',{estado:'cancelado'}),linea(88,239,'2026-11-01')],'2026-10-29');
 assert.deepEqual(p.get(88),{precio:229,fecha:'2026-10-01'});
 assert.equal(ultimosPreciosPOS([],'2026-10-29').size,0);
});
test('precio POS: la comida de personal de la API (en tienda, origen Pizzeria = otro) no cuenta',()=>{
 // Alitas: 185 en kiosco el 25/10; el 26/10 la API trae a un empleado pagando 139 como venta en tienda.
 const p=ultimosPreciosPOS([linea(208,185,'2026-10-25','12:00:00',{origen:'kiosco'}),linea(208,139,'2026-10-26','12:00:00',{origen:'otro'})],'2026-10-29');
 assert.deepEqual(p.get(208),{precio:185,fecha:'2026-10-25'});
});
