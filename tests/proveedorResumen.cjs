const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function cargar({rol='admin',existe=true,falloFirma=false}={}){
 const llamadas=[],firmadas=[];
 const docs=[{id:'viejo',tipo:'opinion_cumplimiento',fecha:'2026-09-01',subido_en:'2026-09-01',ruta:'privado/viejo.pdf'},{id:'nuevo',tipo:'opinion_cumplimiento',fecha:'2026-10-01',subido_en:'2026-10-01',ruta:'privado/nuevo.pdf'},{id:'csf',tipo:'constancia_fiscal',fecha:'2026-10-02',subido_en:'2026-10-02',ruta:'privado/csf.png'}];
 const p={id:'p1',razon_social:'Proveedor México',rfc:'PRB010101AB1',banco:'Banco de prueba',clabe:'012345678901234567'};
 const db={from(tabla){llamadas.push(tabla);const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:existe?p:null})};return q},storage:{from(bucket){return {createSignedUrl:async(ruta,segundos)=>{firmadas.push({bucket,ruta,segundos});return falloFirma?{error:{message:'No disponible'}}:{data:{signedUrl:'https://storage.invalid/'+ruta}}}}}}};
 function load(file){const codigo=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};const req=id=>id==='@/lib/contexto'?{obtenerPerfil:async()=>({supabase:db,perfil:{rol}})}:id==='@/lib/roles'?{puedeVerCompras:r=>['admin','corporativo'].includes(r)}:id==='@/lib/ventas/paginar'?{leerTodo:async()=>docs}:id.startsWith('@/')?load(path.resolve(id.slice(2)+'.ts')):require(id);new Function('require','module','exports',codigo)(req,mod,mod.exports);return mod.exports;}
 return {...load('app/compras/proveedores/[id]/resumen/route.ts'),llamadas,firmadas};
}
const ctx={params:Promise.resolve({id:'p1'})};
test('proveedor popup: solo admin y corporativo consultan, sin caché pública',async()=>{
 for(const rol of ['gerente','operacion','encargado']){const m=cargar({rol}),r=await m.GET(new Request('https://dodo.invalid'),ctx);assert.equal(r.status,403);assert.equal(m.llamadas.length,0);assert.equal(m.firmadas.length,0)}
 for(const rol of ['admin','corporativo']){const m=cargar({rol}),r=await m.GET(new Request('https://dodo.invalid'),ctx);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-store');}
});
test('proveedor popup: muestra tres documentos, elige vigente y marca faltantes',async()=>{
 const m=cargar(),r=await m.GET(new Request('https://dodo.invalid'),ctx),d=await r.json();assert.equal(d.documentos.length,3);
 assert.equal(d.documentos.find(x=>x.tipo==='opinion_cumplimiento').fecha,'2026-10-01');assert.equal(d.documentos.find(x=>x.tipo==='constancia_fiscal').imagen,true);assert.equal(d.documentos.find(x=>x.tipo==='caratula_banco').disponible,false);
 assert.deepEqual(m.firmadas.map(x=>x.ruta).sort(),['privado/csf.png','privado/nuevo.pdf']);assert.ok(m.firmadas.every(x=>x.bucket==='documentos-proveedores'&&x.segundos===300));assert.ok(!JSON.stringify(d).includes('viejo.pdf'));
});
test('proveedor popup: proveedor no existente y firma no disponible',async()=>{
 const m=cargar({existe:false});assert.equal((await m.GET(new Request('https://dodo.invalid'),ctx)).status,404);assert.equal(m.firmadas.length,0);
 const r=await cargar({falloFirma:true}).GET(new Request('https://dodo.invalid'),ctx),d=await r.json();assert.ok(d.documentos.every(x=>x.url===null));assert.equal(d.documentos.find(x=>x.tipo==='opinion_cumplimiento').disponible,true);
});
