import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const wf=JSON.parse(readFileSync(new URL('../docs/n8n/correos-dodo-money.json',import.meta.url),'utf8')),txt=JSON.stringify(wf);
const N=Object.fromEntries(wf.nodes.map(n=>[n.name,n]));
test('n8n correos: cada minuto, lote 8, SMTP sin reintento, pausa 5 s y sin secretos',()=>{
 assert.equal(N['Cada minuto'].parameters.rule.interval[0].field,'minutes');
 assert.match(JSON.stringify(N['Pedir lote'].parameters),/\/api\/correos\/siguiente/);
 assert.match(JSON.stringify(N['Pedir lote'].parameters),/"lote":8|lote\\":8/);
 const smtp=N['Enviar correo'];
 assert.equal(smtp.type,'n8n-nodes-base.emailSend');assert.notEqual(smtp.retryOnFail,true);assert.equal(smtp.onError,'continueErrorOutput');
 assert.equal(smtp.parameters.fromEmail,'Dodo Pizza México <hola@dodopizza.mx>');
 assert.equal(N['Pausa'].parameters.amount,5);
 assert.match(JSON.stringify(N['Reportar'].parameters),/\/api\/correos\/resultado/);
 assert.doesNotMatch(txt,/x-api-key"\s*:\s*"[^"{=]/i,'la llave va en una credencial, no en el flujo');
 assert.equal(wf.settings.timezone,'America/Mexico_City');
});

const conexion=(de,i)=>(wf.connections[de].main[i]||[]).map(c=>c.node);
test('n8n correos: SMTP, conexiones y reporte con reintentos',()=>{
 const p=N['Enviar correo'].parameters;
 assert.equal(p.toEmail,'={{ $json.para }}');assert.equal(p.html,'={{ $json.html }}');assert.equal(p.text,'={{ $json.texto }}');
 assert.equal(p.emailFormat,'both');assert.equal(p.options.replyTo,'hola@dodopizza.mx');
 assert.deepEqual(conexion('Enviar correo',0),['Clasificar']);assert.deepEqual(conexion('Enviar correo',1),['Clasificar']);
 assert.deepEqual(conexion('Pausa',0),['Uno por uno']);assert.equal(N['Uno por uno'].parameters.batchSize,1);
 const r=N['Reportar'];
 assert.equal(r.retryOnFail,true);assert.equal(r.maxTries,3);assert.equal(r.waitBetweenTries,2000);assert.equal(r.onError,'continueRegularOutput');
 assert.deepEqual(conexion('Reportar',0),['Pausa']);
 assert.doesNotMatch(txt,/CORREOS_API_KEY|headerParameters|"value"\s*:/i);
 assert.deepEqual(Object.keys(N['Enviar correo'].credentials),['smtp']);
 for(const n of wf.nodes)if(n.name!=='Enviar correo')assert.equal(n.credentials,undefined);
});
const correr=(json,src)=>new Function('$json','$',N['Clasificar'].parameters.jsCode)(json,()=>({item:src})).json;
const SRC={json:{envio_id:'11111111-1111-4111-8111-111111111111',para:'Ana@Ej.com'}};
test('Clasificar: éxito, errores y envio_id faltante',()=>{
 assert.deepEqual(correr({accepted:['ana@ej.com'],messageId:'<x@y>'},SRC),{envio_id:SRC.json.envio_id,aceptado:true,message_id:'<x@y>',detalle:null});
 const e1=correr({error:'550 5.1.1 User unknown'},SRC);
 assert.equal(e1.aceptado,false);assert.equal(e1.detalle,'550 5.1.1 User unknown');assert.equal(e1.message_id,null);
 assert.equal(correr({error:{message:'Conexión rechazada'}},SRC).detalle,'Conexión rechazada');
 assert.equal(correr({accepted:[]},SRC).detalle,'Resultado incierto');
 assert.throws(()=>correr({accepted:[]},{json:{para:'a@b.c'}}),/envio_id/);
});
