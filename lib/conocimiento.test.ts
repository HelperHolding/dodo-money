import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buscarManuales,type Articulo} from './conocimiento.ts';
test('manuales: búsqueda sin acentos por contenido y categoría',()=>{
 const a=[{titulo:'Cómo hacer un arqueo',contenido:'Revisa la bóveda',categoria:'Efectivo'},{titulo:'Costeo',contenido:'Receta de pizza',categoria:'Ventas'}] as Articulo[];
 assert.equal(buscarManuales(a,'arqueo boveda','Efectivo').length,1);
 assert.equal(buscarManuales(a,'arqueo','Ventas').length,0);
});
