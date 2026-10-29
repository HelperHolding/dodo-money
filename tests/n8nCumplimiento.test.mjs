import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));

test('n8n cumplimiento: nodos, horario, canales y sin secretos',()=>{
 const wf=leer('docs/n8n/cumplimiento-avisos.json'),texto=JSON.stringify(wf);
 const nombres=wf.nodes.map(n=>n.name);
 for(const n of ['Cada mañana (correo)','Cada mañana (chat)','Avisos por correo','¿Hay avisos por correo?','Armar correo','Enviar correo','Confirmar correo','Avisos por chat','¿Hay avisos por chat?','Armar mensaje','Enviar a Google Chat','Confirmar chat'])
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

test('n8n cumplimiento: confirmar solo tras enviar, canales independientes y mensaje de Chat acotado',()=>{
 const wf=leer('docs/n8n/cumplimiento-avisos.json');
 const entrantes=n=>Object.entries(wf.connections).filter(([,c])=>c.main.some(s=>s.some(d=>d.node===n))).map(([o])=>o);
 assert.deepEqual(entrantes('Confirmar correo'),['Enviar correo']);
 assert.deepEqual(entrantes('Confirmar chat'),['Enviar a Google Chat']);
 assert.deepEqual(entrantes('Avisos por correo'),['Cada mañana (correo)']);
 assert.deepEqual(entrantes('Avisos por chat'),['Cada mañana (chat)']);
 const code=wf.nodes.find(n=>n.name==='Armar mensaje').parameters.jsCode;
 const av=(t,i)=>({clave:`${t}:${i}`,titulo:`Titulo largo de prueba numero ${i} `+'x'.repeat(60),ambito:'Sucursal',dias:-3,tipo_aviso:t,url:`https://app.test/c/${i}`});
 const payload={hoy:'2026-10-29',avisos:{vencida:Array.from({length:60},(_,i)=>av('vencida',i)),por_vencer:[av('por_vencer',1)],sin_factura:[]}};
 const {text,claves}=new Function('$input',code)({first:()=>({json:payload})})[0].json;
 assert.ok(text.length<=3800,`largo ${text.length}`);
 assert.ok(claves.length>0&&claves.length<61);
 const todas=[...payload.avisos.vencida,...payload.avisos.por_vencer];
 const mostradas=todas.filter(a=>text.includes(a.url)).map(a=>a.clave);
 assert.deepEqual([...claves].sort(),mostradas.sort());
 assert.match(text,/… y \d+ más en el portal/);
});
