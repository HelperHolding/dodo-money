import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {filtrarArticulos,FILTROS_ARTICULOS_VACIOS} from './filtrosArticulos.ts';
const indice=[{id:'a',texto:'Azúcar kg Proveedor A',tipo:'consumible',iva:'0',proveedores:['p1','p2']},{id:'b',texto:'Servicio mensual Proveedor A',tipo:'servicio',iva:'exento',proveedores:['p1']},{id:'c',texto:'Horno eléctrico',tipo:'activo_fijo',iva:'16',proveedores:[]}];
test('artículos: combina búsqueda, tipo, IVA y cualquier proveedor asociado',()=>{
 assert.deepEqual(filtrarArticulos(indice,{q:'azucar',tipo:'consumible',iva:'0',proveedor:'p2'}).map(a=>a.id),['a']);
 assert.equal(filtrarArticulos(indice,{q:'azucar',tipo:'servicio',iva:'0',proveedor:'p2'}).length,0);
});
test('artículos: distingue IVA cero de exento, sin proveedor y limpiar filtros',()=>{
 assert.deepEqual(filtrarArticulos(indice,{...FILTROS_ARTICULOS_VACIOS,iva:'exento'}).map(a=>a.id),['b']);
 assert.deepEqual(filtrarArticulos(indice,{...FILTROS_ARTICULOS_VACIOS,proveedor:'sin-proveedor'}).map(a=>a.id),['c']);
 assert.equal(filtrarArticulos(indice,FILTROS_ARTICULOS_VACIOS).length,3);
});

test('artículos: nombres aproximados, prioridad exacta y filtros protegidos',()=>{
 const mas=[{...indice[0],id:'parecido',texto:'Azucer kg'},...indice];
 assert.deepEqual(filtrarArticulos(mas,{...FILTROS_ARTICULOS_VACIOS,q:'azucar'}).map(a=>a.id),['a','parecido']);
 assert.equal(filtrarArticulos(indice,{...FILTROS_ARTICULOS_VACIOS,q:'azucar',iva:'16'}).length,0);
 assert.equal(filtrarArticulos(indice,{...FILTROS_ARTICULOS_VACIOS,q:'electirco'})[0].id,'c');
 assert.equal(filtrarArticulos([{...indice[0],texto:'Azúcar 12345'}],{...FILTROS_ARTICULOS_VACIOS,q:'12346'}).length,0);
});
