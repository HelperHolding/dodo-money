const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
// Carga el componente con TypeScript al vuelo; la acción del servidor se sustituye por una función vacía.
function cargar(archivo){
 const codigo=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 const req=id=>{if(id==='../acciones')return {registrarPago:()=>{}};if(id.startsWith('@/')||id.startsWith('.')){let destino=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(archivo),id);if(!path.extname(destino))destino+=fs.existsSync(destino+'.tsx')?'.tsx':'.ts';return cargar(destino)}return require(id)};
 new Function('require','module','exports',codigo)(req,mod,mod.exports);return mod.exports;
}
const {FormPago}=cargar('app/compras/pagos/nuevo/FormPago.tsx');
const factura={id:'f1',nombre:'A-001',saldo:6000,neto:10000,pagado:4000,metodo_pago:'PPD',vence_el:'2026-11-20',pago_programado_el:null,estado:'parcial',bloqueada:null};
const props={proveedorId:'p1',facturas:[factura],forma:'transferencia',hoy:'2026-11-06',dias:[5],reservas:[],reservaInicial:null,solicitud:'s1',bovedas:[],ventas:[]};
test('pago parcial: liquidar una factura ya abonada muestra lo abonado y no pide fecha del resto',()=>{
 const html=renderToStaticMarkup(React.createElement(FormPago,{...props,preseleccion:'f1'}));
 assert.match(html,/Abonado \$4,000\.00 de \$10,000\.00/);assert.match(html,/Liquida la factura\./);
 assert.match(html,/Factura PPD: pide al proveedor el complemento/);assert.match(html,/Puedes pagar menos que el saldo/);
 assert.ok(!html.includes('liquidar_resto'));
});
test('pago parcial: un abono dice cuánto queda y ofrece la fecha para liquidar el resto',()=>{
 // Una reserva de bóveda menor al saldo prellena un abono.
 const reserva={id:'r1',factura_id:'f1',pendiente:2500,sucursal_id:'s1',sucursales:{nombre:'Zapopan'}};
 const html=renderToStaticMarkup(React.createElement(FormPago,{...props,preseleccion:'f1',reservas:[reserva],reservaInicial:'r1'}));
 assert.match(html,/Abono · quedan \$3,500\.00 por pagar\./);
 assert.match(html,/name="liquidar_resto"[^>]*min="2026-11-06"|min="2026-11-06"[^>]*name="liquidar_resto"/);
});
test('pago parcial: una factura PUE no muestra el aviso de complemento',()=>{
 const html=renderToStaticMarkup(React.createElement(FormPago,{...props,preseleccion:'f1',facturas:[{...factura,metodo_pago:'PUE',pagado:0,estado:'por_pagar'}]}));
 assert.match(html,/Liquida la factura\./);assert.ok(!html.includes('complemento'));assert.ok(!html.includes('Abonado'));
});
