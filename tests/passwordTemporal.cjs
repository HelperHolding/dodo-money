const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function cargar(path,mocks={}){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',js)(id=>id in mocks?mocks[id]:require(id),mod,mod.exports);return mod.exports;
}
const validacion=cargar('lib/contrasenaTemporal.ts');
function escenario({rol='admin',reserva='preparada',errorReserva=null,errorAuth=null,throwsAuth=false}={}){
 const llamadas=[];
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{app_metadata:{provider:'email'}}},error:null}),updateUserById:async(id,p)=>{llamadas.push(['auth',id,p]);if(throwsAuth)throw Error('timeout');return {error:errorAuth?{message:errorAuth}:null};}}}};
 const supabase={rpc:async(n,p)=>{llamadas.push([n,p]);return {data:reserva,error:n==='preparar_password_temporal'&&errorReserva?{message:errorReserva}:null};}};
 const accion=cargar('app/administracion/usuarios/accionesPasswordTemporal.ts',{
  'next/navigation':{redirect:url=>{throw {redirect:url};}},'next/cache':{revalidatePath:p=>llamadas.push(['revalidate',p])},
  '@/lib/contexto':{obtenerPerfil:async()=>({supabase,perfil:{id:'yo',rol}})},
  '@/lib/supabase/admin':{crearClienteAdmin:()=>{llamadas.push(['admin']);return admin;}},
  '@/lib/contrasenaTemporal':validacion
 });
 const fd=new FormData();fd.set('usuario','destino');fd.set('solicitud','solicitud');fd.set('temporal','Temporal!123456');fd.set('confirmar','Temporal!123456');fd.set('motivo','Recuperación solicitada');
 return {accion,llamadas,fd};
}
const destino=tipo=>e=>typeof e.redirect==='string'&&e.redirect.includes(`?${tipo}=`);
test('temporal: longitud, confirmación y motivo',()=>{
 assert.ok(validacion.errorContrasenaTemporal('corta','corta','Motivo válido'));
 assert.ok(validacion.errorContrasenaTemporal('Temporal!123456','Otra!12345678','Motivo válido'));
 assert.ok(validacion.errorContrasenaTemporal('Temporal!123456','Temporal!123456',''));
 assert.equal(validacion.errorContrasenaTemporal('Temporal!123456','Temporal!123456','Motivo válido'),null);
});
test('temporal: solo admin llega al cliente privilegiado',async()=>{
 for(const rol of ['gerente','encargado','operacion','corporativo']){
  const s=escenario({rol});await assert.rejects(s.accion.asignarContrasenaTemporal(s.fd),e=>e.redirect==='/');assert.equal(s.llamadas.length,0);
 }
});
test('temporal: propia cuenta y datos inválidos no reservan ni tocan Auth',async()=>{
 for(const [campo,valor] of [['usuario','yo'],['confirmar','distinta'],['motivo','']]){
  const s=escenario();s.fd.set(campo,valor);await assert.rejects(s.accion.asignarContrasenaTemporal(s.fd),destino('error'));assert.equal(s.llamadas.length,0);
 }
});
test('temporal: reserva rechazada no cambia password',async()=>{
 const s=escenario({errorReserva:'Usuario inactivo'});await assert.rejects(s.accion.asignarContrasenaTemporal(s.fd),destino('error'));assert.equal(s.llamadas.some(c=>c[0]==='auth'),false);
});
test('temporal: doble envío aplicado no repite Auth',async()=>{
 const s=escenario({reserva:'aplicada'});await assert.rejects(s.accion.asignarContrasenaTemporal(s.fd),destino('ok'));assert.equal(s.llamadas.some(c=>c[0]==='auth'),false);
});
test('temporal: marcador privado vinculado a reserva, sin password en RPC ni URL',async()=>{
 const s=escenario();let redireccion;try{await s.accion.asignarContrasenaTemporal(s.fd);}catch(e){redireccion=e.redirect;}
 assert.ok(redireccion.includes('?ok='));assert.ok(!redireccion.includes('Temporal!123456'));
 const a=s.llamadas.find(c=>c[0]==='auth');assert.equal(a[1],'destino');assert.deepEqual(a[2],{password:'Temporal!123456',app_metadata:{provider:'email',dodo_password_temporal_id:'solicitud'}});
 for(const c of s.llamadas.filter(c=>c[0]!=='auth'))assert.ok(!JSON.stringify(c).includes('Temporal!123456'));
});
test('temporal: fallo o timeout de Auth no informa éxito y cancela reserva sin reactivar cuenta',async()=>{
 for(const opciones of [{errorAuth:'No permitido'},{throwsAuth:true}]){
  const s=escenario(opciones);await assert.rejects(s.accion.asignarContrasenaTemporal(s.fd),destino('error'));
  assert.equal(s.llamadas.at(-1)[0],'fallar_password_temporal');assert.equal(s.llamadas.some(c=>c[0]==='revalidate'),false);
 }
});
