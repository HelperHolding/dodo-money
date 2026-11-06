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
