const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function cargar(archivo,mocks,cache=new Map()){
 if(cache.has(archivo))return cache.get(archivo);const mod={exports:{}};cache.set(archivo,mod.exports);
 const js=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=id=>{if(id in mocks)return mocks[id];if(id.startsWith('@/')||id.startsWith('.')){let p=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(archivo),id);if(!path.extname(p))p+='.ts';return cargar(p,mocks,cache);}return require(id);};new Function('require','module','exports',js)(req,mod,mod.exports);cache.set(archivo,mod.exports);return mod.exports;
}
async function escenario({conflicto=false,importeCfdi=12.62,sinReporte=false}={}){
 const movimiento={fila:3,fecha:'2026-10-02',orden:'99999001',tienda:'99999000',lote:'99999100',tipo:'ORDEN',estado:'pending_review',bruta:116,aliado:0,dar:-11.6,compensacion:0,cancelacion:0,comision:-20.88,creditoDar:10,ivaComision:-3.3408,creditoDarIva:1.6,retencionIva:-7.2,retencionIsr:-2.25,neto:82.9292};
 const uuid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',reporte={desde:'2026-10-02',hasta:'2026-10-02',tienda:'99999000',movimientos:[movimiento],uuidsComision:[uuid],facturasComision:[{uuid,lote:'99999100',subtotal:10.88,iva:1.74,total:12.62}]};
 const orden={rappi_id:'99999001',sucursal_id:'s',fecha:'2026-10-02',hora:'13:00',estado:'Finalizado',sumar:true,bruto:116,subtotal_restaurante:116,descuento_restaurante:0,descuento_rappi:11.6,facturar:104.4,rappi_lineas:[{linea:1,producto_id:10,nombre:'Producto de prueba',opciones:'',importe:116,cantidad:1}]};
 const tablas={sucursales:[{id:'s',nombre:'Sucursal ensayo'}],pl_parametros:[{clave:'regalias_pct',valor:.1,vigente_desde:'2026-01-01'},{clave:'rappi_pct',valor:.18,vigente_desde:'2026-01-01'}],productos_venta:[{dodo_id:100,categoria:null}],costos_producto:[{dodo_id:100,costo:20,vigente_desde:'2026-01-01'}],facturas:[{id:'f',sucursal_id:'s',uuid,rfc_receptor:'AAA010101AAA',total:importeCfdi,tipo:'ingreso',estado:'pagada',subtotal:10.88,descuento:0,cuenta_pl:null,fecha_emision:'2026-10-02',cubre_desde:'2026-10-02',cubre_hasta:'2026-10-02',creado_en:'2026-10-02T12:00:00Z',origen:'cfdi',factura_conceptos:[]}],ventas_dia:conflicto?[{id:'d',sucursal_id:'s',fecha:'2026-10-02',importacion_id:'i',total:116,iva:16,tarjeta:0,efectivo:0,en_linea:116,pedidos:1,venta_m2:null}]:[],ventas_dia_desglose:conflicto?[{ventas_dia_id:'d',total:116,tarjeta:0,en_linea:116}]:[]};
 const db={from:n=>{let q;q=new Proxy({}, {get:(_,k)=>k==='then'?(resolve,reject)=>Promise.resolve({data:tablas[n]??[],error:null}).then(resolve,reject):()=>q});return q;}};
 const mocks={'./mermas/datos':{datosMermas:async()=>({filas:[],costos:[],dias:[]})},'@/app/ventas/conciliacion/datos':{leerConciliaciones:async()=>({filas:[]})},'@/app/ventas/rappi/datos':{cargarRappi:async()=>({ordenes:[orden],catalogo:[{id:10,dodo_id:100}]})},'@/app/banca/rappi/datos':{leerFinancierosRappi:async()=>sinReporte?[]:[{id:'rf',sucursal_id:'s',rfc:'AAA010101AAA',desde:reporte.desde,hasta:reporte.hasta,archivo:'prueba.xlsx',reporte}]}};
 const {datosPL}=cargar('app/finanzas/datos.ts',mocks);return datosPL(db,{desde:'2026-10-02',hasta:'2026-10-02'});
}
test('integración P&L: reemplaza el ingreso histórico una vez, conserva costo y evita duplicar CFDI',async()=>{
 const d=await escenario(),e=d.porSucursal[0].entrada;assert.equal(e.ventaNeta,90);assert.equal(e.canales.rappi.neta,90);assert.equal(e.alimento,20);assert.equal(e.agregadores,10.88);assert.equal(e.sinCuenta,0);assert.equal(e.regalias,9);assert.equal(e.descuentos,11.6);
 assert.equal(d.detalle.get('s|venta_neta_rappi').reduce((s,x)=>s+x.monto,0),90);
});
test('integración P&L: no aplica el financiero con fuente Dodo IS duplicada ni CFDI discordante',async()=>{
 for(const opciones of [{conflicto:true},{importeCfdi:99}]){const d=await escenario(opciones);assert.match(d.porSucursal[0].avisos.join(' '),/pendiente:/);assert.notEqual(d.porSucursal[0].entrada.ventaNeta,90);}
});
test('integración P&L: sin reporte conserva venta, tasa y facturas anteriores',async()=>{
 const d=await escenario({sinReporte:true}),e=d.porSucursal[0].entrada;assert.equal(e.ventaNeta,100);assert.equal(e.agregadores,20.88);assert.equal(e.sinCuenta,10.88);assert.equal(e.regalias,10);assert.equal(e.descuentos,0);
});
