import {test} from 'node:test';import assert from 'node:assert/strict';import {analisisInversion,resumirInversion,type DetalleInversion} from './inversionApertura.ts';
test('suma detalle una vez y conserva depósitos separados',()=>{const d=(tipo:string,monto:number)=>({tipo,monto} as DetalleInversion);assert.deepEqual(resumirInversion([d('CAPEX',.1),d('CAPEX',.2),d('Depósitos',40000)]),{total:40000.3,grupos:[{tipo:'CAPEX',monto:.3},{tipo:'Depósitos',monto:40000}]});});
const d=(id:string,tipo:string,monto:number):DetalleInversion=>({id,mayor:'M',fecha:'2026-10-01',proveedor:'P',concepto:'C',tipo,categoria:'K',monto,fuente:'F',nota:null});
test('inversión: grupos ordenados, porcentajes y lectura',()=>{
 const a=analisisInversion([d('1','Obra',600),d('2','Equipo',300),d('3','Obra',100),d('4','Mobiliario',0.5)],1000.5);
 assert.deepEqual(a.grupos.map(g=>[g.tipo,g.monto,g.pct]),[['Obra',700,70],['Equipo',300,30],['Mobiliario',0.5,0]]);
 assert.equal(a.total,1000.5);assert.equal(a.movimientos,4);assert.equal(a.cuadra,true);
 assert.equal(a.lectura.length,1);assert.equal(a.lectura[0].titulo,'Donde más se invirtió: Obra');
 assert.match(a.lectura[0].texto,/^Obra \$700\.00 \(70 %\), Equipo \$300\.00 \(30 %\) y Mobiliario \$0\.50 \(0 %\)\.$/);
});
test('inversión: detalle que no cuadra con la fuente',()=>{
 const a=analisisInversion([d('1','Obra',600)],650);
 assert.equal(a.cuadra,false);assert.equal(a.diferencia,-50);
 assert.equal(a.lectura[1].titulo,'El detalle no cuadra con la fuente');
 assert.equal(a.lectura[1].texto,'El detalle suma $600.00 y la fuente $650.00: diferencia de $50.00.');
 assert.deepEqual(analisisInversion([],0).lectura,[]);
});
