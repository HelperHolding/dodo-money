const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function cargar(respuesta={error:null}) {
 const llamadas=[];
 const modulo={exports:{}};
 const codigo=ts.transpileModule(fs.readFileSync('app/compras/ordenes/acciones.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const volver=(_ruta,_clave,mensaje)=>{throw Error('REDIRECT:'+mensaje)};
 const req=id=>id==='../servidor'?{clienteAdmin:async()=>({rpc:async(nombre,datos)=>{llamadas.push({nombre,datos});return respuesta}}),volver}:id==='next/cache'?{revalidatePath:()=>{}}:id==='next/navigation'?{redirect:volver}:{};
 new Function('require','module','exports',codigo)(req,modulo,modulo.exports);
 return {accion:modulo.exports.registrarRecepcionOrden,llamadas};
}
function formulario(nota,cantidad='70') {const fd=new FormData();for(const [k,v] of Object.entries({id:'orden',lote:'lote',fecha_recepcion:'2026-10-15',motivo:nota,renglon:'r1',cantidad_r1:cantidad}))fd.set(k,v);return fd;}
test('nota corta devuelve el error concreto sin registrar recepción',async()=>{const {accion,llamadas}=cargar();const r=await accion(null,formulario(' ok '));assert.match(r.error,/ahora tiene 2/);assert.equal(llamadas.length,0)});
test('sin cantidades no envía una recepción',async()=>{const {accion,llamadas}=cargar();assert.match((await accion(null,formulario('Entrega completa',''))).error,/cantidad recibida/);assert.equal(llamadas.length,0)});
test('envía nota y cantidades correctas a la RPC y redirige al confirmar',async()=>{const {accion,llamadas}=cargar();await assert.rejects(()=>accion(null,formulario('  Entrega completa  ')),/REDIRECT:Recepción registrada/);assert.deepEqual(llamadas,[{nombre:'registrar_recepcion_orden',datos:{p_orden:'orden',p_fecha:'2026-10-15',p_motivo:'Entrega completa',p_renglones:[{id:'r1',cantidad:70}],p_lote:'lote'}}])});
test('rechazo de base de datos se devuelve al formulario sin redirección',async()=>{const {accion}=cargar({error:{message:'La cantidad supera lo pendiente.'}});assert.equal((await accion(null,formulario('Entrega completa'))).error,'La cantidad supera lo pendiente.')});
