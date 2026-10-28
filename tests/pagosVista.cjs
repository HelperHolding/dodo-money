const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function cargar(archivo){
 const codigo=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 const req=id=>{if(id==='next/link')return {default:p=>React.createElement('a',{href:p.href},p.children)};if(id.startsWith('@/')||id.startsWith('.')){let destino=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(archivo),id);if(!path.extname(destino))destino+=fs.existsSync(destino+'.tsx')?'.tsx':'.ts';return cargar(destino)}return require(id)};
 new Function('require','module','exports',codigo)(req,mod,mod.exports);return mod.exports;
}
const {CalendarioPagos}=cargar('app/compras/pagos/CalendarioPagos.tsx');
const {TablaFacturasPago}=cargar('app/compras/pagos/TablaFacturasPago.tsx');
const fila={id:'f1',proveedorId:'p1',nombre:'Factura 001',proveedor:'Proveedor México',saldo:60,uuid:'12345678-1234-1234-1234-123456789ABC',uuidManual:true,fechaPago:'2026-09-30',formaPrevista:'Transferencia',empresa:'COMERCIALIZADORA MASTER SITRU',rfcReceptor:'CMS230321FI8',comprobantes:[{href:'/compras/adjuntos/foto?ver=si',nombre:'ticket.jpg',formato:'Foto'},{href:'/compras/adjuntos/pdf?ver=si',nombre:'factura.pdf',formato:'PDF'}],xml:false,vencida:true};
test('pagos: la liga del Excel abre mes y rango correctos, con todos los días del rango',()=>{
 const html=renderToStaticMarkup(React.createElement(CalendarioPagos,{hoy:'2026-10-16',rangoInicial:{desde:'2026-09-30',hasta:'2026-10-02'},porDia:{'2026-09-30':[fila],'2026-10-01':[{...fila,id:'f2',nombre:'Factura 002'}],'2026-10-03':[{...fila,id:'f3',nombre:'Fuera del rango'}]}}));
 assert.match(html,/Septiembre 2026/);assert.match(html,/value="2026-09-30"/);assert.match(html,/value="2026-10-02"/);assert.match(html,/Factura 001/);assert.match(html,/Factura 002/);assert.ok(!html.includes('Fuera del rango'));
});
test('pagos: documentos diferenciados, saldo real y UUID manual',()=>{
 const html=renderToStaticMarkup(React.createElement(TablaFacturasPago,{filas:[fila]}));
 assert.match(html,/Datos del proveedor/);assert.match(html,/<dialog/);assert.match(html,/COMERCIALIZADORA MASTER SITRU/);assert.match(html,/CMS230321FI8/);assert.match(html,/Comprobante · Foto 1/);assert.match(html,/Comprobante · PDF 2/);assert.match(html,/PDF Dodo MX/);assert.match(html,/XML pendiente/);assert.match(html,/Capturado manualmente/);assert.match(html,/60\.00/);assert.ok(!html.includes('tipo=xml'));
});
test('pagos: los compromisos fijos sin factura salen como previstos y suman al día',()=>{
 const previstos={'2026-10-02':[{compromisoId:'c1',vence:'2026-10-03',fechaPago:'2026-10-02',monto:45000,titulo:'Renta · Zapopan',vencido:false}]};
 const html=renderToStaticMarkup(React.createElement(CalendarioPagos,{hoy:'2026-10-01',rangoInicial:{desde:'2026-10-02',hasta:'2026-10-02'},porDia:{'2026-10-02':[{...fila,vencida:false}]},previstos}));
 assert.match(html,/Renta · Zapopan/);assert.match(html,/href="\/compras\/pagos\/compromisos\/c1#fecha-2026-10-03"/);assert.match(html,/Previsto/);
 assert.match(html,/aria-label="[^"]*45,060\.00[^"]*1 previstos"/);assert.match(html,/data-previsto="si"/);
});
