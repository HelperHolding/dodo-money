const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function cargar(archivo){const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=id=>id.endsWith('.json')?JSON.parse(fs.readFileSync(path.resolve(path.dirname(archivo),id),'utf8')):cargar(path.resolve(path.dirname(archivo),id+'.ts'));new Function('require','module','exports',js)(req,mod,mod.exports);return mod.exports;}
const {agruparCuentas,detalleTotal}=cargar('lib/finanzas/reporteCuentas.ts');
const {partesFactura}=cargar('lib/finanzas/gastos.ts');
const {entradaVacia,calcularPL}=cargar('lib/finanzas/pl.ts');
const cents=n=>Math.round(n*100)/100;
test('cuentas: subtotal XML y cobertura, no se suma el concepto previo de prefactura',()=>{
 const p=partesFactura({tipo:'ingreso',estado:'por_pagar',subtotal:2972.03,descuento:0,cuenta_pl:'marketing',conceptos:[{descripcion:'Periquera IVA',importe:2940,cuenta_pl:'marketing'}]},25/31);
 const grupos=agruparCuentas(p.map(x=>({texto:'CP242',monto:cents(x.monto),clave:'concepto:1'})),2396.80,new Map([['concepto:1',{huella:'h'}]]),new Map([['concepto:1',{codigo:'602-61-102',huella:'h',rfc:'HCM260306B93'}]]));
 assert.equal(grupos[0].codigo,'602-61-102');assert.equal(grupos[0].monto,2396.80);
});
test('cuentas: sin asignación, retiro, fuente cambiada y fuente calculada conservan el total',()=>{
 const items=[{texto:'Factura A',clave:'concepto:1',monto:100},{texto:'NC',clave:'concepto:2',monto:-20},{texto:'Comisión',monto:12.34}];
 const grupos=agruparCuentas(items,92.34,new Map([['concepto:1',{huella:'nueva'}],['concepto:2',{huella:'nc'}]]),new Map([['concepto:1',{codigo:'602-54-000',huella:'anterior'}],['concepto:2',{codigo:null,huella:'nc'}]]));
 assert.ok(grupos.every(g=>g.codigo===null));assert.equal(cents(grupos.reduce((s,g)=>s+g.monto,0)),92.34);
 assert.ok(grupos.some(g=>g.estado.startsWith('Revisar')));assert.equal(items[1].monto,-20);
});
test('cuentas: centavos y fuente sin desglose visibles, sin inventar documentos',()=>{
 const grupos=agruparCuentas([{texto:'A',monto:10.01}],10,new Map(),new Map());
 assert.equal(grupos.find(g=>g.id==='conciliacion').monto,-.01);
 const faltante=agruparCuentas([],100,new Map(),new Map());
 assert.match(faltante[0].nombre,/pendiente/);assert.equal(faltante[0].monto,100);assert.equal(faltante[0].items[0].href,undefined);
});
test('cuentas: totales usan hojas, Rappi fuera de base no altera margen bruto y sí EBITDA',()=>{
 const e={...entradaVacia(),ventaNeta:1000,alimento:300,merma:20,mermaProductos:15,mermaInsumos:5,nomina:{cocina:100,gerencia:50},gastos:{marketing:25,otros:-10},rappiFueraBase:12,rappiExcedente:3,oficina:40};
 const filas=calcularPL(e,[],{ventaNeta:1000,ventaRappi:0,plantilla:{cocina:0,gerencia:0}});
 const valores={venta_neta_dodo:800,venta_neta_rappi:200,alimento:300,merma_productos:15,merma_insumos:5,nomina_cocina:100,nomina_gerencia:50,marketing:25,otros:-10,rappi_fuera_base:12,rappi_excedente:3,oficina:40};
 for(const clave of ['venta_neta','merma','margen_bruto','ebitda_tienda','ebitda']){
  const items=detalleTotal(clave,filas,k=>valores[k]===undefined?[]:[{texto:k,monto:valores[k]}]);
  assert.equal(cents(items.reduce((s,x)=>s+x.monto,0)),filas.find(f=>f.clave===clave).monto,clave);
 }
});
test('cuentas: nuevo SQL conserva controles y el plan incluye 78 conceptos y 9 gastos, solo octubre',()=>{
 const plan=JSON.parse(fs.readFileSync('supabase/correcciones/2026-10-26_equivalencias_octubre.json','utf8'));
 assert.equal(plan.length,87);assert.equal(plan.filter(x=>x.tipo==='factura').length,78);
 assert.equal(new Set(plan.map(x=>x.id)).size,41);
 assert.equal(plan.find(x=>x.id==='2ac46985-35d0-45bb-b183-c9ee3a04cabf').categoria,'insumos');
 for(const id of ['72ebece4-46fd-4bf0-9adb-98a629ad6083','bdd83577-2b40-41b5-b422-438cfea6e66e'])assert.ok(plan.filter(x=>x.id===id).every(x=>x.categoria==='otros'&&x.codigo==='602-54-000'));
 assert.ok(plan.filter(x=>x.tipo==='gasto').every(x=>x.fecha.startsWith('2026-10')));
});
