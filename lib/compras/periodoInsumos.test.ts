import test from 'node:test';
import assert from 'node:assert/strict';
import {soloInsumos} from './periodoInsumos.ts';
test('periodo: insumos explícitos o heredados, conservando servicios y mezclas',()=>{
 assert.equal(soloInsumos(['insumos','insumos']),true);
 assert.equal(soloInsumos(['',null],'insumos'),true);
 assert.equal(soloInsumos(['insumos','servicios'],'insumos'),false);
 assert.equal(soloInsumos([''],null),false);
 assert.equal(soloInsumos([],'insumos'),true);
});
