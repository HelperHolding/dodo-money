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

// Nombres reales de Dodo IS y Rappi (catálogo y cargas del repo).
const REALES=[
 r(11,'Pepperoni Grande','pizza',10,2000),
 r(12,'Pepperoni Mediano T','pizza',5,700),
 r(13,'Pepperoni 30Т','pizza',2,300),
 r(14,'Doble pepperoni 35','pizza',3,750),
 r(15,'Pepperoni Mango Grande','pizza',4,880),
 r(16,'Mitad y mitad Grande','pizza',6,1260),
 r(-901,'Plan Dúo · Pepperoni Grande, Hawaiana Grande',null,2,700),
 r(17,'Dip ranch','snack',8,160),
];
test('productos: agrupa por sabor sin tamaño y no mezcla sabores parecidos',()=>{
 const s=resumenProductos(REALES,{busqueda:'pepperoni',categoria:null});
 assert.deepEqual(s.porSabor.map(x=>[x.sabor,x.piezas]),[['Pepperoni',17],['Pepperoni Mango',4],['Doble pepperoni',3]]);
 assert.equal(s.productos.find(p=>p.dodo_id===14)!.sabor,'Doble pepperoni');
});
test('productos: los renglones de Rappi sin vincular (combos) van aparte y no entran a totales ni a sabores',()=>{
 const s=resumenProductos(REALES,{busqueda:'pepperoni',categoria:null});
 assert.equal(s.productos.find(p=>p.dodo_id===-901)!.rappiSinVincular,true);
 assert.deepEqual(s.rappiSinVincular,{productos:1,piezas:2,importe:700});
 assert.equal(s.totales.piezas,24);
});
test('productos: al buscar un sabor informa las Mitad y mitad del periodo como no atribuibles',()=>{
 assert.deepEqual(resumenProductos(REALES,{busqueda:'pepperoni',categoria:null}).mitadYMitad,{piezas:6,importe:1260});
 assert.equal(resumenProductos(REALES,{busqueda:null,categoria:'pizza'}).mitadYMitad,null);
});
test('productos: "pizza pepperoni" busca por palabras e ignora "pizza"',()=>{
 const s=resumenProductos(REALES,{busqueda:'Pizza de Pepperoni',categoria:null});
 assert.equal(s.totales.piezas,24);assert.equal(s.sinCoincidencias,false);
});
test('productos: sin coincidencias lo dice en lugar de parecer venta cero',()=>{
 const s=resumenProductos(REALES,{busqueda:'calzone',categoria:null});
 assert.equal(s.sinCoincidencias,true);
 assert.equal(resumenProductos(REALES,{busqueda:null,categoria:'postre'}).sinCoincidencias,false);
});
test('productos: con filtro de categoría cuenta lo que quedó fuera por no tener categoría',()=>{
 const s=resumenProductos(REALES,{busqueda:'pepperoni',categoria:'pizza'});
 assert.deepEqual(s.sinCategoria,{productos:1,piezas:2});
 assert.equal(resumenProductos(REALES,{busqueda:'pepperoni',categoria:null}).sinCategoria,null);
});
