const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
// Los helpers reales de HD-19 (ligas y uuidCfdi), transpilados igual que la acción.
const cargarTs=(ruta,mocks={})=>{const js=ts.transpileModule(fs.readFileSync(ruta,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',js)(id=>mocks[id]??require(id),mod,mod.exports);return mod.exports;};
const uuidCfdi=cargarTs('lib/compras/uuidCfdi.ts',{'../ligas.ts':cargarTs('lib/ligas.ts')});
function escenario({rol='admin',gasto=true,errorRpc=null,hintRpc=null,fotoPrevia=null,repetidos=[]}={}) {
 const llamadas=[];
 const consulta={select:()=>consulta,eq:(k,v)=>{llamadas.push(['filtro',k,v]);return consulta;},maybeSingle:async()=>({data:gasto?{id:'gasto',foto_path:fotoPrevia}:null,error:null})};
 const storage={from:b=>({upload:async(r,a,o)=>{llamadas.push(['subir',b,r,o.contentType]);return {error:null};},remove:async rs=>{llamadas.push(['borrar',b,rs]);return {error:null};}})};
 const supabase={storage,from:n=>{llamadas.push(['tabla',n]);return consulta;},rpc:async(n,p)=>{llamadas.push(['rpc',n,p]);if(n==='buscar_uuid_cfdi')return {data:repetidos,error:null};return {error:errorRpc?{message:errorRpc,hint:hintRpc}:null};}};
 const mocks={'@/lib/contexto':{obtenerContextoParaEscribir:async()=>({supabase,perfil:{rol},sucursal:{id:'sucursal-activa'}})},'next/navigation':{redirect:url=>{throw {redirect:url};}},'next/cache':{revalidatePath:(...p)=>llamadas.push(['revalidar',...p])},'@/lib/compras/uuidCfdi':uuidCfdi,'@/lib/fotos':{BUCKET_FOTOS:'fotos',rutaFoto:(s,id)=>`${s}/${id}.jpg`,validarFoto:a=>!a||a.type.startsWith('image/')?null:'Sube una foto.'}};
 const js=ts.transpileModule(fs.readFileSync('app/(app)/caja-chica/administrar.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',js)(id=>mocks[id]??require(id),mod,mod.exports);
 const fd=new FormData();for(const [k,v] of Object.entries({id:'gasto',version:'2',solicitud:'sol',accion:'eliminar',motivo:'Captura equivocada',confirmado:'si'}))fd.set(k,v);
 return {accion:mod.exports.administrarGasto,agregarFoto:mod.exports.agregarFotoGasto,fd,llamadas};
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
const G='0a0a0a0a-1111-4111-8111-000000000001',U='1DAFB285-3B68-4AC2-AAED-DBB6423832E6';
const aviso=(texto,liga)=>e=>{const u=new URL(e.redirect,'http://x');assert.equal(u.searchParams.get('error'),texto);assert.equal(u.searchParams.get('liga'),liga);return true;};
test('gastos: editar con un UUID que ya tiene otro registro avisa con liga y no llama la RPC de edición',async()=>{
 const s=escenario({repetidos:[{origen:'factura',registro_id:G,fecha:'2026-10-09',sucursal:null,usuario:'Julio',creado_en:'2026-10-10T02:30:00Z',liga:`/compras/facturas/${G}`}]});
 s.fd.set('accion','editar');s.fd.set('uuid_cfdi',` ${U.toLowerCase()}`);
 await assert.rejects(s.accion(s.fd),aviso('Este UUID ya se subió el 09/10/2026 por Julio en Oficina (factura).',`/compras/facturas/${G}`));
 assert.deepEqual(s.llamadas.filter(c=>c[0]==='rpc').map(c=>c.slice(1)),[['buscar_uuid_cfdi',{p_uuid:U,p_excluir:'gasto'}]]);
});
test('gastos: si el trigger de UUID salta en la RPC (carrera), se muestra su mensaje y su liga',async()=>{
 const m='Este UUID ya se subió el 01/11/2026 por Ana en Zapopan-1 La Calma (gasto de caja chica).';
 const s=escenario({errorRpc:m,hintRpc:`/caja-chica#gasto-${G}`});s.fd.set('accion','editar');s.fd.set('uuid_cfdi',U);
 await assert.rejects(s.accion(s.fd),aviso(m,`/caja-chica#gasto-${G}`));
});

const conFoto=s=>{s.fd.set('foto',new File(['x'],'ticket.jpg',{type:'image/jpeg'}));return s;};
test('agregar foto: solo admin y sin tocar nada si no es admin',async()=>{
 for(const rol of ['gerente','encargado','operacion','corporativo']){const s=conFoto(escenario({rol}));await assert.rejects(s.agregarFoto(s.fd),destino('error'));assert.equal(s.llamadas.length,0);}
});
test('agregar foto: exige archivo y gasto de la sucursal activa sin foto previa',async()=>{
 let s=escenario();await assert.rejects(s.agregarFoto(s.fd),destino('error'));assert.equal(s.llamadas.length,0);
 s=conFoto(escenario({gasto:false}));await assert.rejects(s.agregarFoto(s.fd),destino('error'));assert.ok(s.llamadas.some(c=>c[1]==='sucursal_id'&&c[2]==='sucursal-activa'));assert.ok(!s.llamadas.some(c=>c[0]==='subir'));
 s=conFoto(escenario({fotoPrevia:'sucursal-activa/t.jpg'}));await assert.rejects(s.agregarFoto(s.fd),destino('error'));assert.ok(!s.llamadas.some(c=>c[0]==='subir'||c[0]==='rpc'));
});
test('agregar foto: sube a la sucursal y llama la RPC sin datos de importe',async()=>{
 const s=conFoto(escenario());await assert.rejects(s.agregarFoto(s.fd),destino('ok'));
 const ruta=s.llamadas.find(c=>c[0]==='subir')[2];assert.ok(ruta.startsWith('sucursal-activa/'));
 assert.deepEqual(s.llamadas.find(c=>c[0]==='rpc').slice(1),['agregar_foto_gasto_admin',{p_solicitud:'sol',p_id:'gasto',p_version:2,p_foto:ruta}]);
});
test('agregar foto: si la RPC falla, borra la foto subida y no informa éxito',async()=>{
 const s=conFoto(escenario({errorRpc:'El gasto cambió'}));await assert.rejects(s.agregarFoto(s.fd),destino('error'));
 const ruta=s.llamadas.find(c=>c[0]==='subir')[2];assert.deepEqual(s.llamadas.find(c=>c[0]==='borrar'),['borrar','fotos',[ruta]]);assert.ok(!s.llamadas.some(c=>c[0]==='revalidar'));
});
