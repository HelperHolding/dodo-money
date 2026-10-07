import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avisoMantenimiento,valoresVigentes,type Mantenimiento,type Valuacion} from './activos.ts';
test('mantenimiento: vencidos, semana próxima y servicios cerrados',()=>{
 const m={estado:'pendiente',programado:'2026-10-06'} as Mantenimiento;
 assert.equal(avisoMantenimiento(m,'2026-10-07'),'Vencido');
 assert.equal(avisoMantenimiento({...m,programado:'2026-10-14'},'2026-10-07'),'Próximo (7 días)');
 assert.equal(avisoMantenimiento({...m,programado:'2026-10-15'},'2026-10-07'),'Programado');
 assert.equal(avisoMantenimiento({...m,estado:'completado'},'2026-10-07'),'Completado');
});
test('la valuación vigente depende de fecha efectiva, luego orden de registro; cero es válido',()=>{
 const v={orden:1,activo_id:'a',fecha:'2026-09-01',creado_en:'2026-10-05',valor:500} as Valuacion;
 const vigente={...v,fecha:'2026-10-01',creado_en:'2026-10-01',valor:0};
 assert.equal(valoresVigentes([vigente,v]).get('a')?.valor,0);
 assert.equal(valoresVigentes([vigente,{...vigente,orden:2,creado_en:'2026-10-01',valor:50}]).get('a')?.valor,50);
});
