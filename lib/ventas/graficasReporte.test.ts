import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ventasMensuales,ventasHorarias} from './graficasReporte.ts';
import {hojasVentas,participacionCanales} from './reporte.ts';
test('mensuales: separa año, corta periodo y no inventa meses sin datos',()=>{
 assert.deepEqual(ventasMensuales({'2025-10-10':10,'2026-09-30':100.1,'2026-10-01':.1,'2026-10-02':.2,'2026-10-22':999},'2025-11-01','2026-10-21'),[{mes:'2026-09',total:100.1,dias:1},{mes:'2026-10',total:.3,dias:2}]);
 assert.deepEqual(ventasMensuales({'2025-10-01':1,'2026-10-01':2},'2025-01-01','2026-12-31').map(m=>m.mes),['2025-10','2026-10']);
});
test('horas: días distintos, medianoche y centavos exactos; hora faltante no es cero',()=>{
 const r=ventasHorarias([{fecha:'2026-10-01',hora:'00:05:00',total:.1},{fecha:'2026-10-01',hora:'00:55',total:.2},{fecha:'2026-10-02',hora:'00:20',total:10},{fecha:'2026-10-01',hora:'24:00',total:50},{fecha:'2026-10-01',hora:'',total:20}]);
 assert.equal(r.sinHora,2);assert.deepEqual(r.horas,[{fecha:'2026-10-01',hora:0,total:.3,pedidos:2},{fecha:'2026-10-02',hora:0,total:10,pedidos:1}]);
});
test('participación usa importes con IVA, cero no inventa porcentajes',()=>{
 assert.deepEqual(participacionCanales([750,250]),[.75,.25]);assert.deepEqual(participacionCanales([0,0]),[null,null]);assert.deepEqual(participacionCanales([100,0]),[1,0]);
});
test('Excel conserva resumen y agrega datos auditables de gráficas',()=>{
 const graficas={desde:'2025-11-01',hasta:'2026-10-21',mensuales:[{mes:'2026-10',total:100,dias:1}],horas:[{fecha:'2026-10-01',hora:12,total:100,pedidos:2}],sinHora:0};
 const h=hojasVentas({titulo:'Ensayo',periodo:{desde:'2026-10-01',hasta:'2026-10-21'},generado:'Ensayo',resumen:[],dias:[],graficas});
 assert.deepEqual(h.slice(2).map(x=>x.nombre),['Participación por canal','Ventas mensuales','Ventas por hora']);
 assert.deepEqual(h[3].filas[2],['2026-10',{valor:100,formato:'pesos'},1]);
 assert.deepEqual(h[4].filas[2],[{fecha:'2026-10-01'},'12:00',{valor:100,formato:'pesos'},2]);
});
