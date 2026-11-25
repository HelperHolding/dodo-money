import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('checklist: nombres de paso por bloque y peso de cada módulo',()=>{
 const f=leer('app/aperturas/ChecklistEditable.tsx');
 assert.match(f,/nombreEstado\(/);assert.match(f,/PESOS_BLOQUE\[/);assert.match(f,/% del total/);
});
test('ficha del item usa el nombre de paso por bloque',()=>{
 assert.match(leer('app/aperturas/[id]/items/[item]/page.tsx'),/nombreEstado\(/);
});
test('listas y calendario usan el nombre de paso',()=>{
 for(const a of ['Calendario','Cronograma','Gantt','ListaConceptos'])assert.match(leer(`app/aperturas/${a}.tsx`),/nombreEstado\(/,a);
});
test('vista de compras muestra el conteo de equipo por etapa',()=>{
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/conteoEtapasEquipo\(/);assert.match(p,/sin cotizar/);
});
