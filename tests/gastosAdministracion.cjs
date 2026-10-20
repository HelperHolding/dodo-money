const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
function escenario({rol='admin',gasto=true,errorRpc=null}={}) {
 const llamadas=[];
 const consulta={select:()=>consulta,eq:(k,v)=>{llamadas.push(['filtro',k,v]);return consulta;},maybeSingle:async()=>({data:gasto?{id:'gasto'}:null,error:null})};
 const supabase={from:n=>{llamadas.push(['tabla',n]);return consulta;},rpc:async(n,p)=>{llamadas.push(['rpc',n,p]);return {error:errorRpc?{message:errorRpc}:null};}};
 const mocks={'@/lib/contexto':{obtenerContextoParaEscribir:async()=>({supabase,perfil:{rol},sucursal:{id:'sucursal-activa'}})},'next/navigation':{redirect:url=>{throw {redirect:url};}},'next/cache':{revalidatePath:(...p)=>llamadas.push(['revalidar',...p])}};
 const js=ts.transpileModule(fs.readFileSync('app/(app)/caja-chica/administrar.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',js)(id=>mocks[id]??require(id),mod,mod.exports);
 const fd=new FormData();for(const [k,v] of Object.entries({id:'gasto',version:'2',solicitud:'sol',accion:'eliminar',motivo:'Captura equivocada',confirmado:'si'}))fd.set(k,v);
 return {accion:mod.exports.administrarGasto,fd,llamadas};
}
const destino=t=>e=>e.redirect?.includes(`?${t}=`);
test('gastos: solo admin alcanza consulta y escritura',async()=>{
 for(const rol of ['gerente','encargado','operacion','corporativo']){const s=escenario({rol});await assert.rejects(s.accion(s.fd),destino('error'));assert.equal(s.llamadas.length,0);}
});
test('gastos: eliminación exige confirmación antes de consultar',async()=>{
 const s=escenario();s.fd.delete('confirmado');await assert.rejects(s.accion(s.fd),destino('error'));assert.equal(s.llamadas.length,0);
});
test('gastos: no acepta un id de otra sucursal',async()=>{
 const s=escenario({gasto:false});await assert.rejects(s.accion(s.fd),destino('error'));assert.ok(s.llamadas.some(c=>c[1]==='sucursal_id'&&c[2]==='sucursal-activa'));assert.ok(!s.llamadas.some(c=>c[0]==='rpc'));
});
test('gastos: RPC recibe versión e identificador; borrar no envía datos editables',async()=>{
 const s=escenario();await assert.rejects(s.accion(s.fd),destino('ok'));
 assert.deepEqual(s.llamadas.find(c=>c[0]==='rpc')[2],{p_solicitud:'sol',p_id:'gasto',p_version:2,p_accion:'eliminar',p_datos:{},p_motivo:'Captura equivocada'});
});
test('gastos: error de saldo o versión no informa éxito',async()=>{
 const s=escenario({errorRpc:'El gasto cambió'});await assert.rejects(s.accion(s.fd),destino('error'));assert.ok(!s.llamadas.some(c=>c[0]==='revalidar'));
});
