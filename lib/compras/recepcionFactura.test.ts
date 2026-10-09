import test from 'node:test';
import assert from 'node:assert/strict';
import {avanceFactura,cantidadesFactura,type RecepcionFactura} from './recepcionFactura.ts';
const r:RecepcionFactura={id:'r',factura_id:'f',fecha:'2026-10-01',motivo:'Entrega real',renglones:[{id:1,cantidad:2}],anulada_en:null,motivo_anulacion:null,creado_en:'2026-10-02',usuario_id:'a'};
test('factura: parcial, completa, anulada y suma de entregas',()=>{
 assert.equal(avanceFactura([{id:1,cantidad:3}],[r]),'parcial');
 assert.equal(avanceFactura([{id:1,cantidad:3}],[r,{...r,id:'r2',renglones:[{id:1,cantidad:1}]}]),'completa');
 assert.equal(avanceFactura([{id:1,cantidad:3}],[{...r,anulada_en:'2026-10-03'}]),'nada');
 assert.equal(cantidadesFactura([r,r]).get(1),4);
 assert.equal(avanceFactura([],[]),'nada');
});
