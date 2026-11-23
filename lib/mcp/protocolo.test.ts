import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leerPeticion,esRespuesta,ok,fallo,inicializar,resultadoTexto,VERSIONES} from './protocolo.ts';

test('protocolo: petición válida con y sin id',()=>{
 assert.deepEqual(leerPeticion('{"jsonrpc":"2.0","id":7,"method":"tools/list"}'),{id:7,method:'tools/list',params:undefined});
 assert.deepEqual(leerPeticion('{"jsonrpc":"2.0","method":"notifications/initialized"}'),{id:undefined,method:'notifications/initialized',params:undefined});
 assert.deepEqual(leerPeticion('{"jsonrpc":"2.0","id":"a","method":"x","params":{"b":1}}'),{id:'a',method:'x',params:{b:1}});
});
test('protocolo: errores de lectura',()=>{
 const casos:[string,number][]=[['{no json',-32700],['[{"jsonrpc":"2.0","id":1,"method":"x"}]',-32600],['"hola"',-32600],['{"id":1,"method":"x"}',-32600],['{"jsonrpc":"2.0","id":1}',-32600],['{"jsonrpc":"2.0","id":1.5,"method":"x"}',-32600],['{"jsonrpc":"2.0","id":1,"method":"x","params":[1]}',-32600]];
 for(const [raw,code] of casos){const r=leerPeticion(raw);assert.ok(esRespuesta(r),raw);assert.equal(r.error?.code,code,raw);}
});
test('protocolo: respuestas y negociación de versión',()=>{
 assert.deepEqual(ok(1,{a:1}),{jsonrpc:'2.0',id:1,result:{a:1}});
 assert.deepEqual(fallo(null,-32601,'No'),{jsonrpc:'2.0',id:null,error:{code:-32601,message:'No'}});
 assert.equal(inicializar('2025-03-26','i').protocolVersion,'2025-03-26');
 assert.equal(inicializar('2099-01-01','i').protocolVersion,VERSIONES[0]);
 assert.equal(inicializar(undefined,'i').protocolVersion,'2025-06-18');
 const r=inicializar('2025-06-18','Instrucciones');
 assert.deepEqual(r.capabilities,{tools:{}});assert.equal(r.serverInfo.name,'dodo-money');assert.equal(r.instructions,'Instrucciones');
});
test('protocolo: resultado de herramienta',()=>{
 assert.deepEqual(resultadoTexto({a:1}),{content:[{type:'text',text:'{"a":1}'}]});
 assert.deepEqual(resultadoTexto('Mal',true),{content:[{type:'text',text:'Mal'}],isError:true});
});
