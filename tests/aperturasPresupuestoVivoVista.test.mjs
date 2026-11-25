import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('página: presupuesto vivo solo con acceso a Finanzas; sin él, el corte',()=>{
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/puedeVerFinanzas\(perfil\.rol\)\s*&&\s*capex\s*\?\s*<PresupuestoVivo[^>]*\/>\s*:\s*<CortePresupuesto items=\{items\}\/>/);
 assert.match(p,/puedeVerFinanzas\(perfil\.rol\)\s*\?\s*await cargarPresupuestoVivo\(/,'no consulta CAPEX sin permiso');
 assert.match(p,/indicadoresProyecto\(p,items,hoy,/,'el KPI recibe el presupuesto vivo');
 assert.match(p,/puedeEditar=\{puedeEditarFinanzas\(perfil\.rol\)\}/,'corporativo solo ve');
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
 assert.match(c,/sobrestimado/);
 assert.match(c,/catch\s*\{\s*return null;/,'error al contar = null, no 0');
 assert.match(c,/No se pudo revisar si hay documentos sin categoría CAPEX/);
 assert.match(c,/el total compensa entre categorías/);
 assert.match(c,/puedeEditar \? "Asignar categoría" : "Ver en Finanzas"/);
 assert.match(c,/puedeEditar \? "Capturarlo en Finanzas" : "Ver en Finanzas"/);
});
test('corte: prop plegado con <details> y título del corte original',()=>{
 const c=leer('app/aperturas/CortePresupuesto.tsx');
 assert.match(c,/plegado\?:\s*boolean/);
 assert.match(c,/<details className="akton"/);
 assert.match(c,/Presupuesto original \(corte /);
});
