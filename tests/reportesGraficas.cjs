const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function cargar(){
 const codigo=ts.transpileModule(fs.readFileSync('components/GraficasReporteVentas.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',codigo)(id=>id==='@/lib/formato'?{fechaTexto:x=>x,pesos:x=>'$'+x.toFixed(2)}:id.endsWith('.css')?{default:new Proxy({},{get:(_,k)=>k})}:require(id),mod,mod.exports);
 return props=>renderToStaticMarkup(React.createElement(mod.exports.GraficasReporteVentas,props));
}
test('reporte: gráficas con año, 24 horas, pedidos y cobertura sin inventar datos',()=>{
 const html=cargar()({mensuales:[{mes:'2026-10',total:100,dias:1}],horas:[{fecha:'2026-10-01',hora:19,total:100,pedidos:2}],desde:'2025-11-01',hasta:'2026-10-21',sinHora:1,totalPeriodo:150});
 assert.match(html,/2026/);assert.match(html,/2 ped\./);assert.match(html,/19:00/);assert.match(html,/\$100.00 de \$150.00/);assert.match(html,/1 pedidos sin hora/);assert.equal((html.match(/<rect /g)||[]).length,25);assert.ok(html.includes('open=""'));
});
test('reporte: sin detalle presenta estado vacío, sin gráfica de ceros ficticios',()=>{
 const html=cargar()({mensuales:[],horas:[],desde:'2025-11-01',hasta:'2026-10-21',sinHora:0,totalPeriodo:100});
 assert.match(html,/No hay pedidos con hora/);assert.match(html,/Sin datos mensuales/);assert.ok(!html.includes('<svg'));
});
