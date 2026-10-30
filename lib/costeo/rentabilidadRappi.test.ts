import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Extensión explícita para las pruebas con Node strip-types.
import {rentabilidadRappi,precioMinimoRappi,utilidadPOS,type EntradaRentabilidad,type OrdenRentabilidad} from './rentabilidadRappi.ts';
const cerca=(a:number|null,b:number,t=.01)=>{assert.ok(a!==null&&Math.abs(a-b)<t,`${a} ≠ ${b}`);};
// Dodo Supreme 30 cm (88): costo 58.73, lista Rappi 279, POS 229. Alitas (208): costo 66.19.
const productos:Record<number,{dodo_id:number;nombre:string}>={1:{dodo_id:88,nombre:'Dodo Supreme Mediano'},2:{dodo_id:208,nombre:'Alitas Buffalo'}};
const costos:Record<number,number>={88:58.73,208:66.19};
const orden=(id:string,lineas:OrdenRentabilidad['rappi_lineas'],descuento:number,estado='Finalizado'):OrdenRentabilidad=>({rappi_id:id,fecha:'2026-10-10',estado,bruto:lineas.reduce((s,l)=>s+l.importe,0),descuento_restaurante:descuento,rappi_lineas:lineas});
const base=(ordenes:OrdenRentabilidad[],extra:Partial<EntradaRentabilidad>={}):EntradaRentabilidad=>({ordenes,productoDe:id=>productos[id]??null,costoDe:d=>costos[d]??null,posDe:d=>d===88?229:null,comisionPct:()=>18,comisionReal:new Map(),regaliasPct:3.5,terminalPct:1,metaPct:45,ajustes:{compensaciones:0,cancelaciones:0},...extra});

test('rentabilidad Rappi: descuento de la tienda, comisión sobre lo cobrado, regalías y costo',()=>{
 // 279 − 48.75 = 230.25 cobrado → 198.49 sin IVA; comisión 41.45; regalías 6.95; utilidad 91.37 → 46.03 %
 const r=rentabilidadRappi(base([orden('1',[{producto_id:1,nombre:'Dodo Supreme',cantidad:1,importe:279}],48.75)]));
 const f=r.filas[0];
 cerca(f.cobrado,230.25);cerca(f.neto,198.49);cerca(f.comision,41.45);cerca(f.regalias,6.95);cerca(f.utilidad,91.37);cerca(f.margen,46.03);
 cerca(f.utilidadPOS,utilidadPOS(229,58.73,{terminalPct:1,regaliasPct:3.5}));cerca(f.utilidadPOS,129.48);
 assert.equal(r.total.cumple,true);cerca(r.total.margen,46.03);
});
test('rentabilidad Rappi: el precio mínimo con el descuento real deja exactamente la meta',()=>{
 const p=precioMinimoRappi(58.73,48.75/279*100,{comisionPct:18,regaliasPct:3.5,metaPct:45})!;
 const r=rentabilidadRappi(base([orden('1',[{producto_id:1,nombre:'x',cantidad:1,importe:p}],p*48.75/279)])).filas[0];
 assert.ok(r.margen!>=45);
 const menos=rentabilidadRappi(base([orden('1',[{producto_id:1,nombre:'x',cantidad:1,importe:p-.01}],(p-.01)*48.75/279)])).filas[0];
 assert.ok(menos.margen!<45);
 assert.equal(precioMinimoRappi(10,0,{comisionPct:60,regaliasPct:3.5,metaPct:45}),null);
});
test('rentabilidad Rappi: comisión real del reporte, reparto por renglón, sin costo aparte y ajustes',()=>{
 const o1=orden('1',[{producto_id:1,nombre:'Dodo',cantidad:1,importe:279},{producto_id:2,nombre:'Alitas',cantidad:1,importe:210}],0);
 const o2=orden('2',[{producto_id:9,nombre:'Combo Rappi',cantidad:2,importe:300}],60),o3=orden('3',[{producto_id:1,nombre:'Dodo',cantidad:1,importe:279}],0,'Cancelado');
 const r=rentabilidadRappi(base([o1,o2,o3],{comisionReal:new Map([['1',50]]),ajustes:{compensaciones:20,cancelaciones:10}}));
 assert.equal(r.ordenes,2);assert.equal(r.ordenesConComisionReal,1);
 const dodo=r.filas.find(f=>f.dodo_id===88)!,alitas=r.filas.find(f=>f.dodo_id===208)!,combo=r.filas.find(f=>f.dodo_id===null)!;
 // La comisión real (50) se reparte por lo cobrado: 279/489 y 210/489.
 cerca(dodo.comision,50*279/489);cerca(alitas.comision,50*210/489);
 assert.equal(combo.utilidad,null);assert.equal(combo.precioMinimo,null);cerca(r.sinCosto.neto,240/1.16);assert.equal(r.sinCosto.productos,1);
 cerca(r.comision,50+240*.18);
 cerca(r.total.utilidad,dodo.utilidad!+alitas.utilidad!-30);
 assert.deepEqual(r.promos.map(p=>[p.monto,p.ordenes]),[[60,1],[0,1]]);cerca(r.promos[0].pct,20);
});
