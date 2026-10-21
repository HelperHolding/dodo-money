import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siguientesConsultas} from './seguimiento.ts';
test('seguimiento: contexto de ventas, cortes y costos con preguntas acotadas',()=>{
 assert.match(siguientesConsultas('¿Cuánto vendimos?',[],false)[0],/ventas/);
 assert.match(siguientesConsultas('Revisa el corte',[],true)[0],/diferencias/);
 assert.match(siguientesConsultas('Costo de pizza',[],true)[0],/costo/);
 assert.match(siguientesConsultas('Explícame esto',[{titulo:'Cortes',href:'/cierre'}],false)[0],/diferencias/);
 for(const pregunta of ['ventas','cortes','costos','ayuda'])for(const s of siguientesConsultas(pregunta,[],true)){assert.ok(s.length<2000);assert.ok(!/P&L|consolidado|todas las sucursales/i.test(s));}
});
