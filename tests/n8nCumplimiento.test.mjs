import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));

test('n8n cumplimiento: nodos, horario, canales y sin secretos',()=>{
 const wf=leer('docs/n8n/cumplimiento-avisos.json'),texto=JSON.stringify(wf);
 const nombres=wf.nodes.map(n=>n.name);
 for(const n of ['Cada mañana','Avisos por correo','¿Hay avisos por correo?','Armar correo','Enviar correo','Confirmar correo','Avisos por chat','¿Hay avisos por chat?','Armar mensaje','Enviar a Google Chat','Confirmar chat'])
  assert.ok(nombres.includes(n),n);
 assert.equal(wf.settings.timezone,'America/Mexico_City');
 assert.match(texto,/canal=correo/);assert.match(texto,/canal=chat/);assert.match(texto,/avisos\/entregados/);
 assert.ok(!/x-api-key"\s*:\s*"[^{]/.test(texto),'la llave va en una credencial, no en el JSON');
 assert.ok(!/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9]/.test(texto),'el webhook va en una variable');
 for(const [origen,destinos] of Object.entries(wf.connections))
  for(const salida of destinos.main) for(const d of salida) assert.ok(nombres.includes(d.node),`${origen} → ${d.node}`);
 const error=leer('docs/n8n/cumplimiento-avisos-error.json');
 assert.ok(error.nodes.some(n=>n.type==='n8n-nodes-base.errorTrigger'));
});
