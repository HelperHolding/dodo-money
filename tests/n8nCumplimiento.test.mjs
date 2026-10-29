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
 // 3 grupos × 15 títulos muy largos: el corte por largo (3800) actúa antes del tope de 15 por grupo.
 const av=(t,i)=>({clave:`${t}:${i}`,titulo:`Titulo largo de prueba numero ${i} `+'x'.repeat(220),ambito:'Sucursal',dias:-3,tipo_aviso:t,url:`https://app.test/c/${t}/${i}`});
 const lista=t=>Array.from({length:15},(_,i)=>av(t,i));
 const payload={hoy:'2026-10-29',avisos:{vencida:lista('vencida'),por_vencer:lista('por_vencer'),sin_factura:lista('sin_factura')}};
 const {text,claves}=new Function('$input',code)({first:()=>({json:payload})})[0].json;
 assert.ok(text.length<=3800,`largo ${text.length}`);
 assert.ok(claves.length>0&&claves.length<15,`el largo corta antes del tope por grupo (${claves.length})`);
 const todas=[...payload.avisos.vencida,...payload.avisos.por_vencer,...payload.avisos.sin_factura];
 // La liga va como <url|título>: el "|" evita que /1 coincida con /10.
 const mostradas=todas.filter(a=>text.includes(`<${a.url}|`)).map(a=>a.clave);
 assert.deepEqual([...claves].sort(),mostradas.sort());
 assert.match(text,new RegExp(`… y ${45-claves.length} más en el portal`));
});

test('n8n cumplimiento: el correo muestra y confirma 200 avisos como máximo, en orden',()=>{
 const wf=leer('docs/n8n/cumplimiento-avisos.json');
 const code=wf.nodes.find(n=>n.name==='Armar correo').parameters.jsCode;
 const av=(t,i)=>({clave:`${t}:${i}`,titulo:`Aviso ${t} ${i}`,ambito:'Sucursal',detalle:'',vence:'2026-10-01',dias:-3,tipo_aviso:t,ruta:`/cumplimiento/${t}-${i}#fecha-2026-10-01`,url:`https://app.test/cumplimiento/${t}-${i}#fecha-2026-10-01`});
 const lista=(t,n)=>Array.from({length:n},(_,i)=>av(t,i));
 const correr=avisos=>new Function('$input',code)({first:()=>({json:{hoy:'2026-10-29',destinatarios:['a@b.mx'],avisos}})})[0].json;
 const {html,claves}=correr({vencida:lista('vencida',150),por_vencer:lista('por_vencer',300),sin_factura:lista('sin_factura',150)});
 assert.equal(claves.length,200);
 assert.deepEqual(claves.slice(0,150),lista('vencida',150).map(a=>a.clave),'primero las vencidas');
 assert.ok(claves.slice(150).every(c=>c.startsWith('por_vencer:')),'luego por vencer');
 const todas=[...lista('vencida',150),...lista('por_vencer',300),...lista('sin_factura',150)];
 // La url completa con su comilla de cierre: /1#… no coincide con /10#….
 const mostradas=todas.filter(a=>html.includes(`href="${a.url}"`)).map(a=>a.clave);
 assert.deepEqual(mostradas,claves);
 for(const a of todas.filter(a=>claves.includes(a.clave))) assert.ok(html.includes(`>${a.titulo}</a>`),a.titulo);
 assert.ok(html.includes('… y 400 más en el <a href="https://app.test/cumplimiento">portal</a>'));
 const pocos=correr({vencida:lista('vencida',2),por_vencer:[],sin_factura:lista('sin_factura',1)});
 assert.deepEqual(pocos.claves,['vencida:0','vencida:1','sin_factura:0']);assert.ok(!pocos.html.includes('más en el'));
});

