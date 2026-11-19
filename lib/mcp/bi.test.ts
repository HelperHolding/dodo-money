import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrosBI,parametrosBI,periodoBI,resumenBI} from './bi.ts';

const SUC='0c9a8b7e-1234-4abc-8def-0123456789ab';
const vacio={kpis:{ventas:0,tickets:0,productos:0},canales:[],origenes:[],tipos:[],pagos:[],dias:[],horas:[],semanas:[],categorias:[]};

test('bi: filtros y parámetros iguales a los de la pantalla, con el rango de comparación',()=>{
 const f=filtrosBI({desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC,canal:'rappi',comparar:'anterior',dias:null},'2026-11-19');
 const p=parametrosBI(f,'anterior');
 assert.deepEqual(p.actual,{desde:'2026-11-09',hasta:'2026-11-15',sucursales:[SUC],rfc:null,edad_min:null,edad_max:null,canal:'rappi',origenes:null,tipos:null,dias:null,hora_desde:null,hora_hasta:null,categorias:null,producto:null,pagos:null});
 assert.deepEqual([p.anterior.desde,p.anterior.hasta],['2026-11-02','2026-11-08']);
 assert.deepEqual([p.comparacion.desde,p.comparacion.hasta,p.comparacion.tipo],['2026-11-02','2026-11-08','anterior']);
 const anio=parametrosBI(filtrosBI({desde:'2026-11-09',hasta:'2026-11-15',sucursal:null,canal:null,comparar:'anio',dias:null},'2026-11-19'),'anio');
 assert.deepEqual([anio.anterior.desde,anio.anterior.hasta,anio.actual.sucursales],['2025-11-09','2025-11-15',null]);
 assert.match(p.fuente,/^\/ventas\/bi\?desde=2026-11-09&hasta=2026-11-15&comp=anterior&suc=0c9a8b7e/);
});

test('bi: KPIs con ticket promedio, piezas por ticket y cambio contra el periodo anterior (los numeric llegan como texto)',()=>{
 const actual={...vacio,kpis:{ventas:'12000.00',tickets:'100',productos:'250'}};
 const anterior={...vacio,kpis:{ventas:'10000',tickets:80,productos:160}};
 const r=resumenBI(actual,anterior,{desde:'2026-11-09',hasta:'2026-11-15'});
 assert.deepEqual(r.kpis,{ventaNeta:12000,tickets:100,ticketPromedio:120,piezasPorTicket:2.5});
 assert.deepEqual(r.anterior,{ventaNeta:10000,tickets:80,ticketPromedio:125,piezasPorTicket:2});
 assert.deepEqual(r.cambioPct,{ventaNeta:20,tickets:25,ticketPromedio:-4,piezasPorTicket:25});
});

test('bi: sin venta en el periodo de comparación el cambio es null, no infinito ni cero',()=>{
 const r=resumenBI({...vacio,kpis:{ventas:500,tickets:5,productos:7}},vacio,{desde:'2026-11-09',hasta:'2026-11-15'});
 assert.deepEqual(r.cambioPct,{ventaNeta:null,tickets:null,ticketPromedio:null,piezasPorTicket:null});
 assert.equal(r.anterior.ticketPromedio,null);
});

test('bi: desgloses con participación y comparación por día de la semana y hora',()=>{
 const actual={...vacio,kpis:{ventas:1000,tickets:10,productos:20},
  canales:[{canal:'pos',ventas:'750',tickets:8},{canal:'rappi',ventas:'250',tickets:2}],
  dias:[{dia:5,ventas:600,tickets:6},{dia:1,ventas:400,tickets:4}],
  horas:[{hora:20,ventas:700,tickets:7},{hora:14,ventas:300,tickets:3}]};
 const anterior={...vacio,kpis:{ventas:800,tickets:8,productos:16},dias:[{dia:5,ventas:500,tickets:5}],horas:[{hora:20,ventas:800,tickets:8}]};
 const r=resumenBI(actual,anterior,{desde:'2026-11-09',hasta:'2026-11-15'});
 assert.deepEqual(r.canales,[{canal:'pos',ventaNeta:750,tickets:8,ticketPromedio:93.75,participacionPct:75},{canal:'rappi',ventaNeta:250,tickets:2,ticketPromedio:125,participacionPct:25}]);
 assert.deepEqual(r.dias,[
  {dia:'lunes',ventaNeta:400,tickets:4,ticketPromedio:100,participacionPct:40,ventaNetaAnterior:0,cambioPct:null,ocurrencias:1,ventaNetaPromedioDia:400},
  {dia:'viernes',ventaNeta:600,tickets:6,ticketPromedio:100,participacionPct:60,ventaNetaAnterior:500,cambioPct:20,ocurrencias:1,ventaNetaPromedioDia:600}]);
 assert.deepEqual(r.horas.map(h=>[h.hora,h.ventaNeta,h.ventaNetaAnterior,h.cambioPct]),[[14,300,0,null],[20,700,800,-12.5]]);
 assert.equal(r.horaPico?.hora,20);assert.equal(r.diaPico?.dia,'viernes');
});

test('bi: periodo sin venta lo marca en lugar de inventar picos',()=>{
 const r=resumenBI(vacio,vacio,{desde:'2026-11-09',hasta:'2026-11-15'});
 assert.equal(r.sinVenta,true);assert.equal(r.horaPico,null);assert.equal(r.kpis.ticketPromedio,null);
});

const base={desde:'2026-11-16',hasta:'2026-11-19',sucursal:null,canal:null,comparar:'anterior',dias:null} as const;
test('bi: un hasta futuro se recorta a hoy y se avisa; un periodo futuro es error',()=>{
 const f=filtrosBI({...base,desde:'2026-11-01',hasta:'2026-11-30'},'2026-11-19');
 assert.deepEqual([f.hasta],['2026-11-19']);
 const p=parametrosBI(f,'anterior');
 assert.deepEqual([p.anterior.desde,p.anterior.hasta],['2026-10-13','2026-10-31']);
 assert.deepEqual(periodoBI({...base,desde:'2026-11-01',hasta:'2026-11-30'},'2026-11-19'),{desde:'2026-11-01',hasta:'2026-11-19',hastaPedido:'2026-11-30',incluyeHoy:true});
 assert.deepEqual(periodoBI({...base,hasta:'2026-11-18'},'2026-11-19'),{desde:'2026-11-16',hasta:'2026-11-18',hastaPedido:null,incluyeHoy:false});
 assert.throws(()=>filtrosBI({...base,desde:'2026-11-20',hasta:'2026-11-22'},'2026-11-19'),/futuro/);
});
test('bi: comparar semana usa los mismos días de la semana anterior',()=>{
 const p=parametrosBI(filtrosBI(base,'2026-11-19'),'semana');
 assert.deepEqual([p.anterior.desde,p.anterior.hasta,p.comparacion.tipo],['2026-11-09','2026-11-12','semana']);
});
test('bi: filtro por día de la semana llega a ventas_bi y a la liga',()=>{
 const p=parametrosBI(filtrosBI({...base,desde:'2026-10-20',hasta:'2026-11-16',dias:[5]},'2026-11-19'),'anterior');
 assert.deepEqual(p.actual.dias,[5]);assert.deepEqual(p.anterior.dias,[5]);assert.match(p.fuente,/dia=5/);
});
test('bi: por día cuenta cuántas veces ocurre cada día y el pico usa el promedio',()=>{
 // Del domingo 1 al jueves 19 de noviembre: domingos 3, lunes a jueves 3, viernes y sábado 2.
 const actual={...vacio,kpis:{ventas:3300,tickets:30,productos:60},dias:[{dia:4,ventas:1500,tickets:15},{dia:6,ventas:1200,tickets:10},{dia:7,ventas:600,tickets:5}]};
 const r=resumenBI(actual,vacio,{desde:'2026-11-01',hasta:'2026-11-19'});
 assert.deepEqual(r.dias.map(d=>[d.dia,d.ocurrencias,d.ventaNetaPromedioDia]),[['jueves',3,500],['sábado',2,600],['domingo',3,200]]);
 assert.equal(r.diaPico?.dia,'sábado');
});
