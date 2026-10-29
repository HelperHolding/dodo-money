const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const base=fs.readFileSync('tests/pagosVista.cjs','utf8');
const cargar=new Function('require',base.slice(0,base.indexOf('const {CalendarioPagos}'))+'return cargar;')(require);
const {CalendarioCumplimiento}=cargar('app/cumplimiento/CalendarioCumplimiento.tsx');
const {FranjaAlertas}=cargar('app/cumplimiento/FranjaAlertas.tsx');
const fila={origen:'obligacion',referencia_id:'o1',fecha_id:null,revision:0,titulo:'Licencia de funcionamiento',detalle:'Municipio',tipo:'licencia',sucursal_id:'s1',razon_social_rfc:null,ambito:'Zapopan-1',vence:'2026-10-10',fecha:'2026-10-10',frecuencia:'anual',estado:'vencida',falta_evidencia:false,falta_factura:false,factura_id:null,ruta:'/cumplimiento/o1#fecha-2026-10-10'};
const inicial={origen:'',estado:'vigentes',ambito:''};
test('calendario de cumplimiento: mes, vencidas, omitidas ocultas y enlace al detalle',()=>{
 const filas=[fila,{...fila,referencia_id:'o2',titulo:'Trámite omitido',estado:'omitida'},{...fila,referencia_id:'o3',titulo:'Trámite de noviembre',vence:'2026-11-01',fecha:'2026-11-01',estado:'pendiente'},
  {...fila,origen:'mantenimiento',referencia_id:'m1',titulo:'Horno de cocina',detalle:'Limpieza de horno',tipo:'preventivo',estado:'cumplida',vence:'2026-10-01',fecha:'2026-10-03',ruta:'/activos/a1#servicio-m1'}];
 const html=renderToStaticMarkup(React.createElement(CalendarioCumplimiento,{hoy:'2026-10-16',filas,inicial,ambitos:[{valor:'s:s1',nombre:'Sucursal · Zapopan-1'}]}));
 assert.match(html,/octubre de 2026/);assert.match(html,/Licencia de funcionamiento/);assert.match(html,/Vencida/);assert.match(html,/href="\/cumplimiento\/o1#fecha-2026-10-10"/);
 assert.match(html,/href="\/activos\/a1#servicio-m1"/);assert.match(html,/Mantenimiento de activos/);assert.match(html,/3 oct 2026/);
 assert.ok(!html.includes('Trámite omitido'));assert.ok(!html.includes('Trámite de noviembre'));
});
test('calendario de cumplimiento: el filtro inicial por origen se respeta',()=>{
 const html=renderToStaticMarkup(React.createElement(CalendarioCumplimiento,{hoy:'2026-10-16',filas:[fila,{...fila,origen:'mantenimiento',referencia_id:'m1',titulo:'Horno de cocina'}],inicial:{...inicial,origen:'mantenimiento'},ambitos:[]}));
 assert.match(html,/Horno de cocina/);assert.ok(!html.includes('Licencia de funcionamiento'));
});
test('franja de alertas: contadores con liga al filtro y nada si todo está en cero',()=>{
 const html=renderToStaticMarkup(React.createElement(FranjaAlertas,{alertas:{vencidas:2,porVencer:1,sinFactura:0,sinEvidencia:3}}));
 assert.match(html,/href="\/cumplimiento\?estado=vencida"/);assert.match(html,/2 vencidas/);assert.match(html,/1 por vencer/);assert.match(html,/3 sin evidencia/);assert.ok(!html.includes('sin factura'));
 assert.equal(renderToStaticMarkup(React.createElement(FranjaAlertas,{alertas:{vencidas:0,porVencer:0,sinFactura:0,sinEvidencia:0}})),'');
});
test('calendario de cumplimiento: el filtro por tipo deja solo obligaciones de ese tipo',()=>{
 const filas=[fila,{...fila,referencia_id:'o2',titulo:'Póliza de daños',tipo:'seguro'},{...fila,origen:'mantenimiento',referencia_id:'m1',titulo:'Horno de cocina',tipo:'preventivo'}];
 const html=renderToStaticMarkup(React.createElement(CalendarioCumplimiento,{hoy:'2026-10-16',filas,inicial:{...inicial,tipo:'seguro'},ambitos:[]}));
 assert.match(html,/Póliza de daños/);assert.ok(!html.includes('Licencia de funcionamiento'));assert.ok(!html.includes('Horno de cocina'));
 assert.match(html,/<option value="seguro" selected="">Seguro<\/option>/);
});

// TarjetaFecha es de servidor e importa las acciones ("use server"): se cargan con las acciones simuladas.
const path=require('node:path'),ts=require('typescript');
function cargarTarjeta(){
 const archivo='app/cumplimiento/[id]/TarjetaFecha.tsx';
 const codigo=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 const req=id=>id==='../acciones'?{cerrarFecha(){},ligarFactura(){},omitirFecha(){},subirEvidencia(){}}:id==='next/link'?{default:p=>React.createElement('a',{href:p.href},p.children)}
  :id.startsWith('@/')?cargar(path.resolve(id.slice(2))+(fs.existsSync(path.resolve(id.slice(2))+'.tsx')?'.tsx':'.ts')):require(id);
 new Function('require','module','exports',codigo)(req,mod,mod.exports);return mod.exports;
}
test('tarjeta de fecha: cambiar factura no quita la ligada por omisión',()=>{
 const {TarjetaFecha}=cargarTarjeta();
 const props={obligacion:'o1',hoy:'2026-10-16',edita:true,conPago:true,facturas:[{id:'f9',nombre:'Factura 009',saldo:10}],evidencias:[]};
 const ligada=renderToStaticMarkup(React.createElement(TarjetaFecha,{...props,f:{...fila,estado:'cumplida',factura_id:'f1'}}));
 assert.match(ligada,/Cambiar o quitar factura/);
 assert.match(ligada,/<select name="factura_id" required="">/);
 assert.match(ligada,/<option value="" disabled="" selected="">Elige…<\/option><option value="quitar">Quitar la factura<\/option>/);
 assert.ok(!/<option value="">/.test(ligada),'ninguna opción vacía elegible');
 const sinFactura=renderToStaticMarkup(React.createElement(TarjetaFecha,{...props,f:{...fila,estado:'cumplida_sin_factura',factura_id:null}}));
 assert.ok(!sinFactura.includes('value="quitar"'));assert.match(sinFactura,/Elige…/);
 const pendiente=renderToStaticMarkup(React.createElement(TarjetaFecha,{...props,f:{...fila,estado:'pendiente'}}));
 assert.match(pendiente,/<option value="" selected="">Después<\/option>/);
});
