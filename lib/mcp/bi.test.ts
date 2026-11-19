import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrosBI,parametrosBI,resumenBI} from './bi.ts';

const SUC='0c9a8b7e-1234-4abc-8def-0123456789ab';
const vacio={kpis:{ventas:0,tickets:0,productos:0},canales:[],origenes:[],tipos:[],pagos:[],dias:[],horas:[],semanas:[],categorias:[]};

test('bi: filtros y parámetros iguales a los de la pantalla, con el rango de comparación',()=>{
 const f=filtrosBI({desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC,canal:'rappi',comparar:'anterior'});
 const p=parametrosBI(f);
 assert.deepEqual(p.actual,{desde:'2026-11-09',hasta:'2026-11-15',sucursales:[SUC],rfc:null,edad_min:null,edad_max:null,canal:'rappi',origenes:null,tipos:null,dias:null,hora_desde:null,hora_hasta:null,categorias:null,producto:null,pagos:null});
 assert.deepEqual([p.anterior.desde,p.anterior.hasta],['2026-11-02','2026-11-08']);
 assert.deepEqual([p.comparacion.desde,p.comparacion.hasta,p.comparacion.tipo],['2026-11-02','2026-11-08','anterior']);
 const anio=parametrosBI(filtrosBI({desde:'2026-11-09',hasta:'2026-11-15',sucursal:null,canal:null,comparar:'anio'}));
 assert.deepEqual([anio.anterior.desde,anio.anterior.hasta,anio.actual.sucursales],['2025-11-09','2025-11-15',null]);
 assert.match(p.fuente,/^\/ventas\/bi\?desde=2026-11-09&hasta=2026-11-15&comp=anterior&suc=0c9a8b7e/);
});

test('bi: KPIs con ticket promedio, piezas por ticket y cambio contra el periodo anterior (los numeric llegan como texto)',()=>{
 const actual={...vacio,kpis:{ventas:'12000.00',tickets:'100',productos:'250'}};
 const anterior={...vacio,kpis:{ventas:'10000',tickets:80,productos:160}};
 const r=resumenBI(actual,anterior);
 assert.deepEqual(r.kpis,{ventaNeta:12000,tickets:100,ticketPromedio:120,piezasPorTicket:2.5});
 assert.deepEqual(r.anterior,{ventaNeta:10000,tickets:80,ticketPromedio:125,piezasPorTicket:2});
 assert.deepEqual(r.cambioPct,{ventaNeta:20,tickets:25,ticketPromedio:-4,piezasPorTicket:25});
});

test('bi: sin venta en el periodo de comparación el cambio es null, no infinito ni cero',()=>{
 const r=resumenBI({...vacio,kpis:{ventas:500,tickets:5,productos:7}},vacio);
 assert.deepEqual(r.cambioPct,{ventaNeta:null,tickets:null,ticketPromedio:null,piezasPorTicket:null});
 assert.equal(r.anterior.ticketPromedio,null);
});

test('bi: desgloses con participación y comparación por día de la semana y hora',()=>{
 const actual={...vacio,kpis:{ventas:1000,tickets:10,productos:20},
  canales:[{canal:'pos',ventas:'750',tickets:8},{canal:'rappi',ventas:'250',tickets:2}],
  dias:[{dia:5,ventas:600,tickets:6},{dia:1,ventas:400,tickets:4}],
  horas:[{hora:20,ventas:700,tickets:7},{hora:14,ventas:300,tickets:3}]};
 const anterior={...vacio,kpis:{ventas:800,tickets:8,productos:16},dias:[{dia:5,ventas:500,tickets:5}],horas:[{hora:20,ventas:800,tickets:8}]};
 const r=resumenBI(actual,anterior);
 assert.deepEqual(r.canales,[{canal:'pos',ventaNeta:750,tickets:8,ticketPromedio:93.75,participacionPct:75},{canal:'rappi',ventaNeta:250,tickets:2,ticketPromedio:125,participacionPct:25}]);
 assert.deepEqual(r.dias,[
  {dia:'lunes',ventaNeta:400,tickets:4,ticketPromedio:100,participacionPct:40,ventaNetaAnterior:0,cambioPct:null},
  {dia:'viernes',ventaNeta:600,tickets:6,ticketPromedio:100,participacionPct:60,ventaNetaAnterior:500,cambioPct:20}]);
 assert.deepEqual(r.horas.map(h=>[h.hora,h.ventaNeta,h.ventaNetaAnterior,h.cambioPct]),[[14,300,0,null],[20,700,800,-12.5]]);
 assert.equal(r.horaPico?.hora,20);assert.equal(r.diaPico?.dia,'viernes');
});

test('bi: periodo sin venta lo marca en lugar de inventar picos',()=>{
 const r=resumenBI(vacio,vacio);
 assert.equal(r.sinVenta,true);assert.equal(r.horaPico,null);assert.equal(r.kpis.ticketPromedio,null);
});
