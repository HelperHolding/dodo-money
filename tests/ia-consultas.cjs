const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache={};
// Carga las funciones de consulta reales; reemplaza únicamente agregadores no utilizados en estas pruebas.
function cargar(f){if(cache[f])return cache[f];const exports={};cache[f]=exports;const code=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',code)(s=>{if(s==='@/app/ventas/datos')return {};if(s==='@/app/finanzas/datos')return {};if(s.startsWith('@/')||s.startsWith('.')){let q=s.startsWith('@/')?path.join(root,s.slice(2)):path.resolve(path.dirname(f),s);if(!path.extname(q))q+='.ts';return cargar(q);}return require(s);},exports);return exports;}
const {consultasIA}=cargar(path.join(root,'lib/ia/consultas.ts'));
function cliente(tablas){return {from(t){let filas=[...(tablas[t]??[])],unico=false,limite=null,desde=0,hasta=Infinity;const q={select(){return q;},eq(k,v){filas=filas.filter(f=>f[k]===v);return q;},gte(k,v){filas=filas.filter(f=>f[k]>=v);return q;},lte(k,v){filas=filas.filter(f=>f[k]<=v);return q;},ilike(k,v){filas=filas.filter(f=>f[k].toLowerCase().includes(v.replaceAll('%','').toLowerCase()));return q;},order(k,o){filas.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));return q;},limit(n){limite=n;return q;},range(d,h){desde=d;hasta=h;return q;},returns(){return q;},maybeSingle(){unico=true;return q;},then(ok,fail){const seleccion=(limite===null?filas:filas.slice(0,limite)).slice(desde,hasta+1);return Promise.resolve({data:unico?seleccion[0]??null:seleccion,error:null}).then(ok,fail);}};return q;}};}
test('herramienta de costos: gerente no recibe productos de otra sucursal y respeta vigencia',async()=>{
 const db=cliente({productos_venta:[{dodo_id:1,nombre:'Pizza A'},{dodo_id:2,nombre:'Pizza B'}],ventas_producto:[{dodo_id:1,sucursal_id:'propia'},{dodo_id:2,sucursal_id:'ajena'}],costos_producto:[{dodo_id:1,costo:25,vigente_desde:'2026-10-01'},{dodo_id:1,costo:80,vigente_desde:'2026-10-10'},{dodo_id:2,costo:999,vigente_desde:'2026-10-01'}]});
 const fuentes=[],r=await consultasIA(db,'propia','gerente',fuentes).costos('Pizza','2026-10-05');
 assert.equal(r.productos.length,1);assert.equal(r.productos[0].nombre,'Pizza A');assert.equal(r.productos[0].costo,25);assert.equal(fuentes.length,1);assert.match(fuentes[0].href,/sucursal=propia/);
});
test('herramienta de costos: costo desconocido conserva null',async()=>{
 const db=cliente({productos_venta:[{dodo_id:1,nombre:'Pizza sin costo'}]});const r=await consultasIA(db,null,'admin',[]).costos('Pizza','2026-10-05');assert.equal(r.productos[0].costo,null);
});
test('herramienta de cortes: aplica sucursal y excluye arqueos anulados',async()=>{
 const db=cliente({turnos:[{id:'t1',sucursal_id:'propia',sucursales:{nombre:'Zapopan'},fecha:'2026-10-05',tipo:'matutino',cerrado_en:'2026-10-05',arqueos:[{momento:'cierre',esperado:100,total_contado:95,diferencia:-5,anulado_en:null},{momento:'cierre',esperado:100,total_contado:80,diferencia:-20,anulado_en:'2026-10-05'}]},{id:'t2',sucursal_id:'ajena',fecha:'2026-10-05',arqueos:[]}]});
 const r=await consultasIA(db,'propia','gerente',[]).cortes('2026-10-01','2026-10-06');assert.equal(r.totalTurnos,1);assert.equal(r.turnos[0].arqueos.length,1);assert.equal(r.turnos[0].arqueos[0].diferencia,-5);
});
test('herramienta de P&L: gerente no consulta aunque invoque la función directamente',async()=>{
 await assert.rejects(()=>consultasIA(cliente({}), 'propia','gerente',[]).pl('mes','2026-10'),/reservado/);
});
