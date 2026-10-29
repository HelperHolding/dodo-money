const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function cargar(archivo){
 const codigo=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 const req=id=>{if(id.startsWith('@/')||id.startsWith('.')){let destino=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(archivo),id);if(!path.extname(destino))destino+=fs.existsSync(destino+'.tsx')?'.tsx':'.ts';return cargar(destino)}return require(id)};
 new Function('require','module','exports',codigo)(req,mod,mod.exports);return mod.exports;
}
const {CalculadoraPromociones}=cargar('app/ventas/costos/CalculadoraPromociones.tsx');
// Dodo Supreme 30 cm: costo 58.73, POS 229, Rappi 279; terminal 1 %, Rappi 18 %.
const productos=[{id:88,nombre:'Dodo Supreme Mediano',costo:58.73,desde:'2026-10-01',fuente:'BOM',pos:229,rappi:279},{id:156,nombre:'Coca-Cola 0,6 L',costo:19.46,desde:'2026-10-01',fuente:'BOM',pos:33,rappi:41}];
const vista=props=>renderToStaticMarkup(React.createElement(CalculadoraPromociones,{productos,comisionRappi:18,comisionPOS:1,...props}));
test('promociones: un producto compara POS y Rappi al mismo precio, como The Coffee',()=>{
 const html=vista({inicial:88});
 for(const t of ['Precio Rappi','Un producto','Combo de varios productos','Margen bruto POS','Margen con comisión POS','Margen bruto Rappi','Margen con comisión Rappi','Contribución por promoción','Precio de lista para el objetivo'])assert.ok(html.includes(t),t);
 // 229 → venta 197.41; POS 1 % de 229 = 2.29 → 136.39; Rappi 18 % de 229 = 41.22 → 97.46
 assert.match(html,/\$136\.39/);assert.match(html,/\$97\.46/);assert.match(html,/aria-pressed="true"[^>]*>Un producto/);
});
test('promociones: precio Rappi aplica la comisión Rappi al precio registrado',()=>{
 const html=vista({inicial:88,modoInicial:'rappi'});
 // 279 → venta 240.52; 18 % de 279 = 50.22 → 131.57
 assert.match(html,/value="279"/);assert.match(html,/\$131\.57/);assert.ok(!html.includes('Margen bruto POS'));
});
test('promociones: combo sin productos pide elegirlos y no inventa cifras',()=>{
 const html=vista({modoInicial:'combo'});
 assert.match(html,/Productos del combo/);assert.match(html,/Elige los productos del combo/);assert.ok(!html.includes('Contribución por'));
 assert.ok(!vista({modoInicial:'combo',comisionRappi:null}).includes('Margen bruto'));
});
