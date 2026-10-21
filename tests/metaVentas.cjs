const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function vista(props){
 const codigo=ts.transpileModule(fs.readFileSync('components/ResumenEjecutivoVentas.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',codigo)(id=>id==='@/lib/formato'?{pesos:x=>'$'+x.toFixed(2),porcentaje:x=>(x*100).toFixed(1)+'%'}:require(id),mod,mod.exports);
 return renderToStaticMarkup(React.createElement(mod.exports.ResumenEjecutivoVentas,{desde:'2026-10-12',hasta:'2026-10-18',total:72500,piezas:100,pedidos:50,global:true,...props}));
}
test('meta semanal con IVA y semanas consecutivas sin desfase',()=>{assert.match(vista(),/50.0%/);assert.match(vista(),/meta \$145000.00/);assert.match(vista({hasta:'2026-10-25'}),/meta \$290000.00/);});
test('meta diaria proporcional y sin cumplimiento global en una sucursal',()=>{assert.match(vista({hasta:'2026-10-12'}),/meta \$20714.29/);assert.ok(!vista({global:false}).includes('<progress'));assert.match(vista({pedidos:0}),/—/);});
