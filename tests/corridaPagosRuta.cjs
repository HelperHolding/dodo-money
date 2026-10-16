const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function cargar(rol){
 const cache=new Map(),llamadas=[];
 function load(file){if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);const codigo=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req=id=>{
   if(id==='@/lib/contexto')return {obtenerPerfil:async()=>({supabase:{},perfil:{rol}})};
   if(id==='@/lib/roles')return {puedeVerCompras:r=>['admin','corporativo'].includes(r)};
   if(id==='@/lib/formato')return {hoyCalendarioMX:()=> '2026-10-15',fechaMX:()=> '2026-10-15',hora:()=> '12:00'};
   if(id==='@/app/compras/pagos/cargarCorrida')return {cargarCorrida:async(_db,f,hoy)=>{llamadas.push({f,hoy});return []}};
   if(id.startsWith('@/')||id.startsWith('.')){let destino=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);if(!path.extname(destino))destino+='.ts';return load(destino)}return require(id);
  };new Function('require','module','exports',codigo)(req,mod,mod.exports);cache.set(file,mod.exports);return mod.exports;
 }
 return {GET:load(path.resolve('app/reporte/pagos/excel/route.ts')).GET,llamadas};
}
test('corrida HTTP: operación, encargado y gerente no pueden descargar datos de Compras',async()=>{for(const rol of ['operacion','encargado','gerente']){const {GET,llamadas}=cargar(rol);assert.equal((await GET(new Request('https://dodo.invalid/reporte/pagos/excel?desde=2026-10-15&hasta=2026-10-16'))).status,403);assert.equal(llamadas.length,0)}});
test('corrida HTTP: fechas inválidas se rechazan antes de consultar documentos',async()=>{const {GET,llamadas}=cargar('admin');assert.equal((await GET(new Request('https://dodo.invalid/reporte/pagos/excel?desde=2026-02-30&hasta=2026-10-16'))).status,400);assert.equal(llamadas.length,0)});
test('corrida HTTP: admin y corporativo reciben XLSX privado, con los filtros solicitados',async()=>{for(const rol of ['admin','corporativo']){const {GET,llamadas}=cargar(rol);const response=await GET(new Request('https://dodo.invalid/reporte/pagos/excel?desde=2026-10-15&hasta=2026-10-16&fecha=2026-10-16&proveedor=p1&sucursal=z1&complemento=si'));assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/spreadsheetml/);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.match(response.headers.get('Content-Disposition'),/2026-10-15_a_2026-10-16/);assert.deepEqual(llamadas[0],{f:{desde:'2026-10-15',hasta:'2026-10-16',fecha:'2026-10-16',proveedor:'p1',sucursal:'z1',complemento:'si'},hoy:'2026-10-15'});assert.equal(Buffer.from(await response.arrayBuffer()).readUInt32LE(),0x04034b50)}});
