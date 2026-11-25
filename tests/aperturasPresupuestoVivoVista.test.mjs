import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('página: presupuesto vivo solo con acceso a Finanzas; sin él, el corte',()=>{
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/puedeVerFinanzas\(perfil\.rol\)\s*&&\s*capex\s*\?\s*<PresupuestoVivo[^>]*\/>\s*:\s*<CortePresupuesto items=\{items\}\/>/);
 assert.match(p,/puedeVerFinanzas\(perfil\.rol\)\s*\?\s*await cargarPresupuestoVivo\(/,'no consulta CAPEX sin permiso');
 assert.match(p,/indicadoresProyecto\(p,items,hoy,/,'el KPI recibe el presupuesto vivo');
 assert.match(p,/<ResumenCapexApertura/,'la tarjeta CAPEX se queda');
});
test('componente: cálculo vivo, aviso sin categoría con liga a Finanzas y corte plegado',()=>{
 const c=leer('app/aperturas/PresupuestoVivo.tsx');
 assert.match(c,/presupuestoVivo\(/);
 assert.match(c,/sin categoría CAPEX/);
 assert.match(c,/\/finanzas\/capex\//);
 assert.match(c,/<CortePresupuesto[^>]*plegado/);
 assert.match(c,/from\(["']capex_resumen["']\)[^;]*\.eq\(["']proyecto_id["']/);
 assert.match(c,/data-label="Cotizado sin OC"/);
 assert.match(c,/akton-subtotal/);
});
test('corte: prop plegado con <details> y título del corte original',()=>{
 const c=leer('app/aperturas/CortePresupuesto.tsx');
 assert.match(c,/plegado\?:\s*boolean/);
 assert.match(c,/<details className="akton"/);
 assert.match(c,/Presupuesto original \(corte /);
});
