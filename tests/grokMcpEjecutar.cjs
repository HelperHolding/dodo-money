const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache={};
// Carga el código real (alias @/ incluidos); solo se reemplazan los agregadores de ventas y P&L, que no se usan aquí.
function cargar(f){if(cache[f])return cache[f];const exports={};cache[f]=exports;const code=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',code)(s=>{if(s==='@/app/ventas/datos'||s==='@/app/finanzas/datos')return {};if(s.startsWith('@/')||s.startsWith('.')){let q=s.startsWith('@/')?path.join(root,s.slice(2)):path.resolve(path.dirname(f),s);if(!path.extname(q))q+='.ts';return cargar(q);}return require(s);},exports);return exports;}
const {ejecutarHerramienta}=cargar(path.join(root,'lib/mcp/ejecutar.ts'));
function cliente(tablas){return {from(t){let filas=[...(tablas[t]??[])],unico=false,limite=null;const q={select(){return q;},eq(k,v){filas=filas.filter(f=>f[k]===v);return q;},lte(k,v){filas=filas.filter(f=>f[k]<=v);return q;},ilike(k,v){filas=filas.filter(f=>f[k].toLowerCase().includes(v.replaceAll('%','').toLowerCase()));return q;},textSearch(){return q;},order(k,o){filas.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));return q;},limit(n){limite=n;return q;},returns(){return q;},maybeSingle(){unico=true;return q;},then(ok,fail){const sel=limite===null?filas:filas.slice(0,limite);return Promise.resolve({data:unico?sel[0]??null:sel,error:null}).then(ok,fail);}};return q;}};}
const SUC='0c9a8b7e-1234-4abc-8def-0123456789ab',ORIGEN='https://dodo.test';

test('ejecutar: sucursales ordenadas por nombre',async()=>{
 const db=cliente({sucursales:[{id:'b',nombre:'Zapopan-1 La Calma'},{id:'a',nombre:'Guadalajara-1 López Mateos'}]});
 assert.deepEqual(await ejecutarHerramienta(db,'corporativo',{herramienta:'sucursales'},ORIGEN),{sucursales:[{id:'a',nombre:'Guadalajara-1 López Mateos'},{id:'b',nombre:'Zapopan-1 La Calma'}]});
});
test('ejecutar: sucursal inexistente es error, no consolidado',async()=>{
 const db=cliente({sucursales:[]});
 await assert.rejects(ejecutarHerramienta(db,'corporativo',{herramienta:'ventas',desde:'2026-11-01',hasta:'2026-11-02',sucursal:SUC},ORIGEN),/Sucursal no disponible/);
});
test('ejecutar: manuales con enlaces y fuentes absolutos',async()=>{
 const db=cliente({kb_articulos:[{id:7,titulo:'Apertura',contenido:'Pasos',revision:1,publicado:true}]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'manuales',busqueda:'apertura'},ORIGEN);
 assert.equal(r.manuales[0].href,'https://dodo.test/conocimiento/manuales/7');
 assert.deepEqual(r.fuentes,[{titulo:'Apertura',href:'https://dodo.test/conocimiento/manuales/7'}]);
});
test('ejecutar: costos de corporativo enlazan al producto',async()=>{
 const db=cliente({productos_venta:[{dodo_id:1,nombre:'Pizza Pepperoni'}],costos_producto:[{dodo_id:1,costo:42,vigente_desde:'2026-10-01',fuente:null,nota:null}]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'costos',busqueda:'pepperoni',fecha:'2026-11-01'},ORIGEN);
 assert.equal(r.productos[0].costo,42);assert.equal(r.productos[0].href,'https://dodo.test/ventas/costos/productos/1');
});
