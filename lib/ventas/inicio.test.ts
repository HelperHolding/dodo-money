import test from 'node:test';
import assert from 'node:assert/strict';
import {periodoInicioVentas} from './inicio.ts';
test('inicio ventas: mes actual termina hoy; meses completos respetan febrero bisiesto',()=>{
 assert.deepEqual(periodoInicioVentas(undefined,'2026-10-09'),{desde:'2026-10-01',hasta:'2026-10-09'});
 assert.deepEqual(periodoInicioVentas('2024-02','2026-10-09'),{desde:'2024-02-01',hasta:'2024-02-29'});
 assert.deepEqual(periodoInicioVentas('2026-09','2026-10-09'),{desde:'2026-09-01',hasta:'2026-09-30'});
});
test('inicio ventas: meses futuros o inválidos regresan al actual',()=>{
 for(const mes of ['2026-11','2026-13','2026-00','invalido','2026-2'])assert.deepEqual(periodoInicioVentas(mes,'2026-10-09'),{desde:'2026-10-01',hasta:'2026-10-09'});
});

import {historialVentas,origenesPedidos} from './inicio.ts';
test('orígenes: mostrador es el resto de POS, Rappi aparte y los % suman 100',()=>{
 const o=origenesPedidos([
  {tipo:'app',pedidos:10,total:1000},{tipo:'agregador',pedidos:20,total:2000},
  {tipo:'entrega',pedidos:25,total:2500}, // servicio: no cuenta como origen
 ],100,50);
 assert.deepEqual(o.map(x=>[x.clave,x.pedidos]),[['mostrador',70],['app',10],['sitio',0],['centro_llamadas',0],['agregador',20],['rappi',50]]);
 assert.equal(Math.round(o.reduce((s,x)=>s+x.porcentaje,0)*1000)/1000,1);
});
test('orígenes: sin POS pero con Rappi no hay negativos ni división entre cero',()=>{
 const o=origenesPedidos([{tipo:'app',pedidos:3,total:1}],0,8);
 assert.equal(o.find(x=>x.clave==='mostrador')?.pedidos,0);
 assert.equal(o.find(x=>x.clave==='rappi')?.porcentaje,8/11);
 assert.deepEqual(origenesPedidos([],0,0).map(x=>x.porcentaje),[0,0,0,0,0,0]);
});
test('historial mensual: últimos 12 meses con datos, mes actual parcial, sin ceros inventados',()=>{
 const venta={'2025-10-31':5,'2025-11-02':100,'2026-03-01':50,'2026-03-02':25,'2026-11-08':10};
 assert.deepEqual(historialVentas(venta,'2026-11-09','mensual').map(p=>[p.clave,p.total,p.parcial]),[['2026-03',75,false],['2026-11',10,true]]);
});
test('historial semanal y anual',()=>{
 const venta={'2026-11-02':10,'2026-11-08':5,'2026-11-09':7,'2024-05-01':3};
 assert.deepEqual(historialVentas(venta,'2026-11-09','semanal').map(p=>[p.clave,p.total,p.parcial]),[['2026-11-02',15,false],['2026-11-09',7,true]]);
 assert.deepEqual(historialVentas(venta,'2026-11-09','anual').map(p=>[p.clave,p.total,p.parcial]),[['2024',3,false],['2026',22,true]]);
});

import {urlDashboard} from './inicio.ts';
test('url del dashboard: conserva mes, sucursal, periodo y alcance; fecha solo si hay',()=>{
 const base={ventas_mes:'2026-11',ventas_sucursal:'todas',hist:'mensual',alcance:'red'};
 assert.equal(urlDashboard('/corporativo',{...base,fecha:'2026-11-09'},{hist:'semanal'}),'/corporativo?fecha=2026-11-09&ventas_mes=2026-11&ventas_sucursal=todas&hist=semanal&alcance=red');
 assert.equal(urlDashboard('/',base,{ventas_sucursal:'abc',alcance:'sucursal'}),'/?ventas_mes=2026-11&ventas_sucursal=abc&hist=mensual&alcance=sucursal');
});
