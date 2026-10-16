import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buscarProveedores} from './busquedaProveedores.ts';
const filas=[{id:'1',razon_social:'Distribuidora Frutigo SA',nombre_comercial:'Frutigo',rfc:'FRU123456AB1'},{id:'2',razon_social:'Papelería y Consumibles KARISMA',nombre_comercial:'Karisma',rfc:'PCK010102II6'},{id:'3',razon_social:'Comercial de Agua',nombre_comercial:'Agua Clyra',rfc:'AGU123456CD2'}];
test('proveedores: vacío, cada letra, acentos y palabras en distinto orden',()=>{
 assert.deepEqual(buscarProveedores(filas,''),filas);
 for(const q of ['f','fr','fru','frut','fruti'])assert.equal(buscarProveedores(filas,q)[0].id,'1');
 assert.equal(buscarProveedores(filas,'papeleria KARISMA')[0].id,'2');
 assert.equal(buscarProveedores(filas,'clyra agua')[0].id,'3');
});
test('proveedores: errores pequeños y transposición, sin asociaciones arbitrarias',()=>{
 for(const q of ['frutgo','frutgio','karizma'])assert.equal(buscarProveedores(filas,q).length,1);
 assert.equal(buscarProveedores(filas,'restaurante desconocido').length,0);
 assert.equal(buscarProveedores(filas,'zx').length,0);
 assert.equal(buscarProveedores(filas,'PCK010102II7').length,0);
 assert.equal(buscarProveedores(filas,'pck010102')[0].id,'2');
});
test('proveedores: exactos primero, no modifica ni amplía el conjunto autorizado',()=>{
 const mas=[{...filas[0],id:'casi',nombre_comercial:'Frutiga'},...filas];
 assert.equal(buscarProveedores(mas,'frutigo')[0].id,'1');
 assert.equal(buscarProveedores(filas.filter(p=>p.id!=='1'),'frutigo').length,0);
 assert.equal(mas[0].id,'casi');
});
