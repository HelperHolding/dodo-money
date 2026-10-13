const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function cargar(archivo,mocks) {
 const js=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(id=>id in mocks?mocks[id]:require(id),mod,mod.exports);
 return mod.exports;
}
function escenario({rol='admin',confirmado=false,existente=false,fallo=null,reservaError=null}={}) {
 const llamadas=[];
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{email_confirmed_at:confirmado?'2026-10-13':null}}}),inviteUserByEmail:async(email,options)=>{llamadas.push(['invite',email,options]);return {error:fallo?{message:fallo}:null};}},resetPasswordForEmail:async(email,options)=>{llamadas.push(['recovery',email,options]);return {error:null};}},rpc:async(n,p)=>{llamadas.push([n,p]);return {error:null};}};
 const supabase={rpc:async(n,p)=>{llamadas.push([n,p]);return {data:{id:'invitacion',correo:'persona@example.invalid',usuario_id:existente?'usuario':null},error:reservaError?{message:reservaError}:null};}};
 const acciones=cargar('app/administracion/usuarios/invitaciones.ts',{
  'next/navigation':{redirect:url=>{throw {redirect:url};}},'next/cache':{revalidatePath:()=>{}},
  '@/lib/contexto':{obtenerPerfil:async()=>({supabase,perfil:{rol}})},
  '@/lib/supabase/admin':{crearClienteAdmin:()=>{llamadas.push(['admin']);return admin;},urlInvitacion:()=> 'https://dodo.invalid/invitacion'}
 });
 return {acciones,llamadas};
}
const destino=(tipo)=>e=>typeof e.redirect==='string'&&e.redirect.includes(`?${tipo}=`);
test('gerente no accede a cliente privilegiado ni envía correos',async()=>{
 const {acciones,llamadas}=escenario({rol:'gerente'});
 await assert.rejects(acciones.invitarUsuario(new FormData()),e=>e.redirect==='/');assert.equal(llamadas.length,0);
});
test('primer envío usa únicamente asignación reservada y registra cierre',async()=>{
 const {acciones,llamadas}=escenario();const f=new FormData();f.set('correo','otro@example.invalid');
 await assert.rejects(acciones.invitarUsuario(f),destino('ok'));
 const invite=llamadas.find(l=>l[0]==='invite');assert.equal(invite[1],'persona@example.invalid');
 assert.deepEqual(invite[2].data,{dodo_invitacion_id:'invitacion'});
 assert.equal(llamadas.at(-1)[0],'finalizar_envio_invitacion');assert.equal(llamadas.at(-1)[1].p_error,null);
});
test('reserva rechazada no llama Auth',async()=>{
 const {acciones,llamadas}=escenario({reservaError:'Cuenta existente'});
 await assert.rejects(acciones.invitarUsuario(new FormData()),destino('error'));
 assert.equal(llamadas.some(l=>l[0]==='invite'||l[0]==='recovery'),false);
});
test('SMTP rechazado conserva el error para reintentar y no muestra éxito',async()=>{
 const {acciones,llamadas}=escenario({fallo:'SMTP rechazó envío'});
 await assert.rejects(acciones.invitarUsuario(new FormData()),destino('error'));
 assert.equal(llamadas.at(-1)[1].p_error,'SMTP rechazó envío');
});
test('correo ya confirmado con contraseña pendiente recibe recuperación',async()=>{
 const {acciones,llamadas}=escenario({existente:true,confirmado:true});
 await assert.rejects(acciones.invitarUsuario(new FormData()),destino('ok'));
 assert.equal(llamadas.some(l=>l[0]==='invite'),false);assert.equal(llamadas.some(l=>l[0]==='recovery'),true);
});
test('pendiente no confirmado reenvía invitación a la misma cuenta',async()=>{
 const {acciones,llamadas}=escenario({existente:true});
 await assert.rejects(acciones.invitarUsuario(new FormData()),destino('ok'));
 assert.equal(llamadas.some(l=>l[0]==='invite'),true);
});
test('contraseña solo se establece con invitación validada en servidor',async()=>{
 let actualizaciones=0;
 const acciones=cargar('app/invitacion/acciones.ts',{
  'next/navigation':{redirect:url=>{throw {redirect:url};}},
  '@/lib/supabase/server':{crearClienteServidor:async()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}}),updateUser:async()=>{actualizaciones++;return {error:null};}},rpc:async()=>({data:false,error:null})})}
 });
 const f=new FormData();f.set('nueva','Password123');f.set('confirmar','Password123');
 await assert.rejects(acciones.establecerContrasena(f),e=>e.redirect.startsWith('/invitacion?error='));assert.equal(actualizaciones,0);
});
test('token de invitación válido redirige a ruta fija y no reexpone el token',async()=>{
 let verificado;
 const ruta=cargar('app/auth/confirm/route.ts',{
  'next/server':{NextResponse:{redirect:(url,options)=>({url:String(url),options})}},
  '@/lib/supabase/server':{crearClienteServidor:async()=>({auth:{verifyOtp:async(p)=>{verificado=p;return {error:null};}}})}
 });
 const url='https://dodo.invalid/auth/confirm?token_hash=secreto&type=invite&next=https://evil.invalid';
 const respuesta=await ruta.GET({url,nextUrl:new URL(url)});
 assert.deepEqual(verificado,{token_hash:'secreto',type:'invite'});
 assert.equal(respuesta.url,'https://dodo.invalid/invitacion');assert.equal(respuesta.options.headers['Referrer-Policy'],'no-referrer');
});
test('callback rechaza otros tipos de token sin ejecutar Auth',async()=>{
 let llamadas=0;
 const ruta=cargar('app/auth/confirm/route.ts',{
  'next/server':{NextResponse:{redirect:(url)=>({url:String(url)})}},
  '@/lib/supabase/server':{crearClienteServidor:async()=>{llamadas++;return {};}}
 });
 const url='https://dodo.invalid/auth/confirm?token_hash=secreto&type=signup';
 const respuesta=await ruta.GET({url,nextUrl:new URL(url)});
 assert.equal(llamadas,0);assert.equal(respuesta.url,'https://dodo.invalid/invitacion?error=enlace');
});
