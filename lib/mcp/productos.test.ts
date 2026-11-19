import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenProductos} from './productos.ts';
import {CATEGORIAS} from '../ventas/calculos.ts';
import {CATEGORIAS_MCP} from './herramientas.ts';

const r=(dodo_id:number,nombre:string,categoria:string|null,cantidad:number,importe:number,fecha='2026-11-10',costo:number|null=10)=>
 ({fecha,dodo_id,nombre,categoria,cantidad,importe,importe_sin_descuento:importe+5,importe_neto:+(importe/1.16).toFixed(2),costo_unitario:costo}) as never;

const RENGLONES=[
 r(1,'Pizza Pepperoni Grande',' pizza'.trim(),3,600),
 r(1,'Pizza Pepperoni Grande','pizza',2,400,'2026-11-11'),
 r(2,'Pizza Pepperoni Mediana','pizza',4,560),
 r(3,'Pizza Hawaiana Grande','pizza',5,1000),
 r(4,'Refresco 600 ml','bebida',10,300),
 r(5,'Pizza Peppéroni Chica','pizza',1,90,'2026-11-12',null),
];

test('productos: las categorías coinciden con las del tablero',()=>{
 assert.deepEqual([...CATEGORIAS_MCP],[...CATEGORIAS]);
});
test('productos: busca sin acentos ni mayúsculas, suma por producto y totaliza lo filtrado',()=>{
 const s=resumenProductos(RENGLONES,{busqueda:'PEPPERONI',categoria:null});
 assert.deepEqual(s.productos.map(p=>[p.nombre,p.piezas,p.importe]),[['Pizza Pepperoni Grande',5,1000],['Pizza Pepperoni Mediana',4,560],['Pizza Peppéroni Chica',1,90]]);
 assert.deepEqual(s.totales,{piezas:10,importe:1650,ventaNeta:1422.42});
 assert.equal(s.totalProductos,3);assert.equal(s.truncado,false);
 assert.equal(s.productos[2].costo,null);
});
test('productos: filtra por categoría y ordena por venta',()=>{
 const s=resumenProductos(RENGLONES,{busqueda:null,categoria:'pizza'});
 assert.deepEqual(s.productos.map(p=>p.dodo_id),[3,1,2,5]);
 assert.equal(resumenProductos(RENGLONES,{busqueda:null,categoria:'bebida'}).totales.piezas,10);
});
test('productos: sin coincidencias devuelve lista vacía con totales en cero y lo dice',()=>{
 const s=resumenProductos(RENGLONES,{busqueda:'calzone',categoria:null});
 assert.deepEqual(s.productos,[]);assert.equal(s.totalProductos,0);assert.deepEqual(s.totales,{piezas:0,importe:0,ventaNeta:0});
});
test('productos: recorta la lista al límite pero los totales cuentan todo',()=>{
 const muchos=Array.from({length:60},(_,i)=>r(100+i,`Producto ${i}`,'otro',1,100+i));
 const s=resumenProductos(muchos,{busqueda:null,categoria:null});
 assert.equal(s.productos.length,50);assert.equal(s.totalProductos,60);assert.equal(s.truncado,true);
 assert.equal(s.totales.piezas,60);assert.equal(s.productos[0].importe,159);
});
