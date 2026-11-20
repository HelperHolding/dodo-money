const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache={};
// Carga el código real (alias @/ incluidos); solo se reemplazan agregadores de ventas y P&L, que no se usan aquí.
function cargar(f){if(cache[f])return cache[f];const exports={};cache[f]=exports;const code=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',code)(s=>{if(s==='@/app/ventas/datos'||s==='@/app/finanzas/datos')return {};if(s.startsWith('@/')||s.startsWith('.')){let q=s.startsWith('@/')?path.join(root,s.slice(2)):path.resolve(path.dirname(f),s);if(!path.extname(q))q+='.ts';return cargar(q);}return require(s);},exports);return exports;}
const {ejecutarHerramienta}=cargar(path.join(root,'lib/mcp/ejecutar.ts'));
// Supabase falso: filtros sobre columnas anidadas ("pagos.fecha"); el select solo se registra (las filas ya traen sus relaciones).
const valor=(f,k)=>k.split('.').reduce((o,p)=>o?.[p],f);
function cliente(tablas,rpcs={}){const consultas=[];return {consultas,async rpc(n,a){const r=rpcs[n];return typeof r==='function'?r(a):r??{data:[],error:null};},from(t){let filas=[...(tablas[t]??[])],unico=false;const q={
 select(c){consultas.push(t+':'+c);return q;},eq(k,v){filas=filas.filter(f=>valor(f,k)===v);return q;},neq(k,v){filas=filas.filter(f=>valor(f,k)!==v);return q;},
 in(k,vs){filas=filas.filter(f=>vs.includes(valor(f,k)));return q;},gte(k,v){filas=filas.filter(f=>valor(f,k)>=v);return q;},lte(k,v){filas=filas.filter(f=>valor(f,k)<=v);return q;},
 is(){return q;},not(){return q;},order(){return q;},range(){return q;},limit(){return q;},returns(){return q;},maybeSingle(){unico=true;return q;},
 then(ok,fail){return Promise.resolve({data:unico?filas[0]??null:filas,error:null}).then(ok,fail);}};return q;}};}

const S1='11111111-0000-4000-8000-000000000001',P1='aaaaaaaa-0000-4000-8000-00000000000a',P2='bbbbbbbb-0000-4000-8000-00000000000b',ORIGEN='https://dodo.test';
const BASE={
 sucursales:[{id:S1,nombre:'Zapopan-1 La Calma'}],
 proveedores:[{id:P1,razon_social:'Lácteos del Bajío SA de CV',nombre_comercial:'Lácteos Bajío',rfc:'LBA010101AB1',clabe:'012345678901234567'},{id:P2,razon_social:'Harinas Finas SA',nombre_comercial:null,rfc:'HFI010101AB2'}],
 razones_sociales:[{rfc:'HCM260306B93',razon_social:'Helper Comercializadora Master',principal:true,activa:true}],
 empresa:[{dias_pago:[5]}],factura_ordenes:[],compromisos:[],
};
const nombres={razon_social:'Lácteos del Bajío SA de CV',nombre_comercial:'Lácteos Bajío'};
const sinSecretos=r=>{const t=JSON.stringify(r);for(const s of ['LBA010101AB1','HFI010101AB2','012345678901234567','HCM260306B93'])assert.ok(!t.includes(s),s);};

test('por_pagar: lee facturas_saldo por pagar, resuelve el proveedor por nombre y no manda RFC ni CLABE',async()=>{
 const db=cliente({...BASE,facturas_saldo:[
  {id:'f1',serie:'A',folio:'10',saldo:'1500.00',vence_el:'2099-01-15',pago_programado_el:null,estado:'por_pagar',tipo:'ingreso',proveedor_id:P1,sucursal_id:S1,rfc_receptor:'HCM260306B93',proveedores:nombres},
  {id:'f2',serie:null,folio:'7',saldo:'200',vence_el:'2099-01-15',pago_programado_el:null,estado:'parcial',tipo:'ingreso',proveedor_id:P2,sucursal_id:S1,rfc_receptor:'HCM260306B93',proveedores:{razon_social:'Harinas Finas SA',nombre_comercial:null}},
  {id:'f3',serie:'A',folio:'11',saldo:'0',vence_el:'2099-01-15',pago_programado_el:null,estado:'pagada',tipo:'ingreso',proveedor_id:P1,sucursal_id:S1,rfc_receptor:'HCM260306B93',proveedores:nombres}]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'por_pagar',sucursal:null,proveedor:'lacteos'},ORIGEN);
 assert.deepEqual(r.filtro.proveedores,['Lácteos Bajío']);
 assert.deepEqual([r.resumen.saldoTotal,r.facturas.length,r.facturas[0].folio],[1500,1,'A-10']);
 assert.equal(r.porRazonSocial[0].razonSocial,'Helper Comercializadora Master');
 assert.ok(r.fuente.startsWith('https://dodo.test/compras/pagos?proveedor='),r.fuente);
 assert.ok(db.consultas.some(c=>c.startsWith('facturas_saldo:')&&!/uuid|xml|pdf/.test(c)),'columnas explícitas sin uuid ni archivos');
 assert.ok(!db.consultas.some(c=>c.startsWith('proveedores:')&&/clabe|banco|cuenta|correo|telefono/.test(c)),'sin datos bancarios en el select');
 sinSecretos(r);
});

test('por_pagar: proveedor sin coincidencias es error claro, no deuda cero',async()=>{
 await assert.rejects(ejecutarHerramienta(cliente(BASE),'corporativo',{herramienta:'por_pagar',sucursal:null,proveedor:'zzzz inexistente'},ORIGEN),/Ningún proveedor coincide/);
});

test('pagos: filtra por fecha del pago y atribuye lo aplicado',async()=>{
 const pago=(fecha,o={})=>({fecha,anulado_en:null,proveedor_id:P1,forma:'transferencia',origen_fondos:'transferencia',...o});
 const db=cliente({...BASE,pago_aplicaciones:[
  {pago_id:'p1',factura_id:'f1',monto:'1000',facturas:{sucursal_id:S1,rfc_receptor:'HCM260306B93'},pagos:pago('2026-10-10')},
  {pago_id:'p2',factura_id:'f2',monto:'300',facturas:{sucursal_id:S1,rfc_receptor:'HCM260306B93'},pagos:pago('2026-09-30')},
  {pago_id:'p3',factura_id:'f3',monto:'50',facturas:{sucursal_id:S1,rfc_receptor:'HCM260306B93'},pagos:pago('2026-10-20',{proveedor_id:P2})}]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'pagos',desde:'2026-10-01',hasta:'2026-10-31',sucursal:null,proveedor:null},ORIGEN);
 assert.deepEqual([r.total,r.pagos],[1050,2]);
 assert.deepEqual(r.porProveedor.map(x=>x.proveedor),['Lácteos Bajío','Harinas Finas SA']);
 assert.deepEqual(r.periodo,{desde:'2026-10-01',hasta:'2026-10-31'});
 sinSecretos(r);
});

test('compras: facturas emitidas en el periodo, neto, sin canceladas',async()=>{
 const f=(id,fecha,o={})=>({id,proveedor_id:P1,sucursal_id:S1,rfc_receptor:'HCM260306B93',cuenta_pl:'insumos',neto:'1160',estado:'pagada',tipo:'ingreso',fecha_emision:fecha,proveedores:nombres,...o});
 const db=cliente({...BASE,facturas_saldo:[f('1','2026-10-05'),f('2','2026-10-06',{estado:'cancelada'}),f('3','2026-11-01'),f('4','2026-10-07',{tipo:'egreso'})]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'compras',desde:'2026-10-01',hasta:'2026-10-31',sucursal:null,proveedor:null},ORIGEN);
 assert.deepEqual([r.total,r.facturas],[1160,1]);
 assert.match(r.nota,/neto/);
 sinSecretos(r);
});

test('ordenes: confirmadas con lo pendiente, sin notas',async()=>{
 const db=cliente({...BASE,
  ordenes_compra:[{id:'o1',folio:'OC-0007',proveedor_id:P1,sucursal_id:S1,estado:'confirmada',entrega_esperada:'2000-01-01',notas:'NOTA PRIVADA',proveedores:nombres,sucursales:{nombre:'Zapopan-1 La Calma'}},
   {id:'o2',folio:'OC-0008',proveedor_id:P1,sucursal_id:S1,estado:'borrador',entrega_esperada:null,proveedores:nombres,sucursales:{nombre:'Zapopan-1 La Calma'}}],
  renglones_recibido:[{orden_id:'o1',descripcion:'Queso mozzarella kg',cantidad:'10',precio:'100',tasa_iva:'16',recibido:'4',ordenes_compra:{estado:'confirmada'}},
   {orden_id:'o2',descripcion:'Harina',cantidad:'1',precio:'1',tasa_iva:'16',recibido:'0',ordenes_compra:{estado:'borrador'}}]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'ordenes',sucursal:null,proveedor:null},ORIGEN);
 assert.deepEqual(r.resumen,{ordenes:1,atrasadas:1,hoy:0,aTiempo:0,sinFecha:0});
 assert.deepEqual(r.ordenes[0].pendientes,[{descripcion:'Queso mozzarella kg',pedido:10,recibido:4,falta:6}]);
 assert.ok(!JSON.stringify(r).includes('NOTA PRIVADA'));
 assert.equal(r.fuente,'https://dodo.test/compras/recepciones');
});
