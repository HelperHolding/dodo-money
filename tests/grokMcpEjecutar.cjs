const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache={};
// datosVentas falso: registra con qué se llamó y devuelve los renglones del ensayo.
const llamadasVentas=[];let RENGLONES=[];
const ventasFalsas={datosVentas:async(...a)=>{llamadasVentas.push(a.slice(1,3));return {dias:[{fecha:'2026-11-10'},{fecha:'2026-11-10'},{fecha:'2026-11-11'}],renglones:RENGLONES};}};
// Carga el código real (alias @/ incluidos); solo se reemplazan los agregadores de ventas y P&L, que no se usan aquí.
function cargar(f){if(cache[f])return cache[f];const exports={};cache[f]=exports;const code=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',code)(s=>{if(s==='@/app/ventas/datos')return ventasFalsas;if(s==='@/app/finanzas/datos')return {};if(s.startsWith('@/')||s.startsWith('.')){let q=s.startsWith('@/')?path.join(root,s.slice(2)):path.resolve(path.dirname(f),s);if(!path.extname(q))q+='.ts';return cargar(q);}return require(s);},exports);return exports;}
const {ejecutarHerramienta}=cargar(path.join(root,'lib/mcp/ejecutar.ts'));
function cliente(tablas,rpcs={}){const llamadas=[];return {llamadas,async rpc(n,args){llamadas.push([n,args]);const r=rpcs[n];return typeof r==='function'?r(args):r??{data:null,error:{message:'sin rpc'}};},from(t){let filas=[...(tablas[t]??[])],unico=false,limite=null;const q={select(){return q;},eq(k,v){filas=filas.filter(f=>f[k]===v);return q;},lte(k,v){filas=filas.filter(f=>f[k]<=v);return q;},gte(k,v){filas=filas.filter(f=>f[k]>=v);return q;},range(){return q;},ilike(k,v){filas=filas.filter(f=>f[k].toLowerCase().includes(v.replaceAll('%','').toLowerCase()));return q;},textSearch(){return q;},order(k,o){filas.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));return q;},limit(n){limite=n;return q;},returns(){return q;},maybeSingle(){unico=true;return q;},then(ok,fail){const sel=limite===null?filas:filas.slice(0,limite);return Promise.resolve({data:unico?sel[0]??null:sel,error:null}).then(ok,fail);}};return q;}};}
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
test('ejecutar: productos usa las ventas del tablero, filtra y enlaza al periodo',async()=>{
 RENGLONES=[{fecha:'2026-11-10',dodo_id:1,nombre:'Pizza Pepperoni Grande',categoria:'pizza',cantidad:3,importe:600,importe_sin_descuento:600,importe_neto:517.24,costo_unitario:80},{fecha:'2026-11-11',dodo_id:2,nombre:'Pizza Hawaiana',categoria:'pizza',cantidad:1,importe:200,importe_sin_descuento:200,importe_neto:172.41,costo_unitario:70}];
 const db=cliente({sucursales:[{id:SUC,nombre:'Zapopan-1 La Calma'}]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'productos',desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC,busqueda:'pepperoni',categoria:null},ORIGEN);
 assert.deepEqual(llamadasVentas.at(-1),[SUC,{desde:'2026-11-09',hasta:'2026-11-15'}]);
 assert.deepEqual(r.productos.map(p=>[p.nombre,p.piezas]),[['Pizza Pepperoni Grande',3]]);
 assert.deepEqual(r.totales,{piezas:3,importe:600,ventaNeta:517.24});
 assert.deepEqual(r.diasConDatos,['2026-11-10','2026-11-11']);
 assert.equal(r.fuente,'https://dodo.test/ventas?desde=2026-11-09&hasta=2026-11-15&sucursal='+SUC);
 assert.match(r.nota,/porSabor/);assert.match(r.nota,/Mitad y mitad/);assert.match(r.nota,/rappiSinVincular/);assert.match(r.nota,/sinCoincidencias/);
 assert.deepEqual(r.porSabor.map(x=>x.sabor),['Pizza Pepperoni'.replace(/^Pizza /,'')]);
});

const VACIO_BI={kpis:{ventas:0,tickets:0,productos:0},canales:[],origenes:[],tipos:[],pagos:[],pagos_sucursal:[],dias:[],horas:[],semanas:[],categorias:[],productos:[],rappi_nombres:[]};
test('ejecutar: bi llama ventas_bi para el periodo y el de comparación y resume',async()=>{
 const db=cliente({sucursales:[{id:SUC,nombre:'Zapopan-1 La Calma'}]},{ventas_bi:({p})=>({data:p.desde==='2026-11-09'?{...VACIO_BI,kpis:{ventas:'1200',tickets:'10',productos:'25'},horas:[{hora:20,ventas:900,tickets:7}]}:{...VACIO_BI,kpis:{ventas:1000,tickets:10,productos:20}},error:null})});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'bi',desde:'2026-11-09',hasta:'2026-11-15',sucursal:SUC,canal:null,comparar:'anterior',dias:null},ORIGEN);
 assert.deepEqual(db.llamadas.map(([n,a])=>[n,a.p.desde,a.p.hasta,a.p.sucursales]),[['ventas_bi','2026-11-09','2026-11-15',[SUC]],['ventas_bi','2026-11-02','2026-11-08',[SUC]]]);
 assert.deepEqual(r.kpis,{ventaNeta:1200,tickets:10,ticketPromedio:120,piezasPorTicket:2.5});
 assert.equal(r.cambioPct.ventaNeta,20);assert.equal(r.horaPico.hora,20);
 assert.deepEqual(r.comparacion,{tipo:'anterior',desde:'2026-11-02',hasta:'2026-11-08'});
 assert.ok(r.fuente.startsWith('https://dodo.test/ventas/bi?desde=2026-11-09&hasta=2026-11-15&comp=anterior'),r.fuente);
 assert.match(r.nota,/sin IVA/);
 assert.deepEqual(r.periodo,{desde:'2026-11-09',hasta:'2026-11-15',hastaPedido:null,incluyeHoy:false});
 assert.ok(r.dias.every(d=>'ocurrencias' in d));
});
test('ejecutar: bi con error de la función es error claro, no cero',async()=>{
 const db=cliente({},{ventas_bi:{data:null,error:{code:'42501',message:'Solo admin y corporativo ven Ventas BI'}}});
 await assert.rejects(ejecutarHerramienta(db,'corporativo',{herramienta:'bi',desde:'2026-11-09',hasta:'2026-11-15',sucursal:null,canal:null,comparar:'anterior',dias:null},ORIGEN),/reservado a admin y corporativo/);
});
test('ejecutar: tiempos lee los pedidos del periodo y usa los nombres de sucursal',async()=>{
 const B='bbbbbbbb-0000-4000-8000-000000000002';
 const ped=(id,suc,fecha,cocina)=>({dodo_id:id,sucursal_id:suc,fecha,hora:'13:00:00',pago:'tarjeta',tipo:'en_tienda',origen:'mostrador',para_llevar:false,estado:'entregado',total:'200.00',total_sin_descuento:'200.00',agregador:null,
  inicio_coccion:cocina===null?null:fecha+'T13:00:00-06:00',listo:cocina===null?null:new Date(Date.parse(fecha+'T13:00:00-06:00')+cocina*60000).toISOString(),entregado:null});
 const db=cliente({sucursales:[{id:SUC,nombre:'Zapopan-1 La Calma'},{id:B,nombre:'Guadalajara-1 López Mateos'}],pedidos:[ped('1',SUC,'2026-11-10',10),ped('2',B,'2026-11-11',20),ped('3',B,'2026-11-20',99),ped('4',B,'2026-11-11',null)]});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'tiempos',desde:'2026-11-09',hasta:'2026-11-15',sucursal:null},ORIGEN);
 assert.deepEqual(r.cobertura,{pedidos:3,conTiempoCocina:2,conTiempoEntrega:0,pctConTiempo:66.7,diasConTiempo:2});
 assert.equal(r.general.medianaCocinaMin,15);
 assert.deepEqual(r.porSucursal.map(x=>[x.sucursal,x.medianaCocinaMin]),[['Guadalajara-1 López Mateos',20],['Zapopan-1 La Calma',10]]);
 assert.match(r.nota,/sincronización automática/);assert.match(r.nota,/muestraChica/);
 assert.equal(r.fuente,'https://dodo.test/ventas?desde=2026-11-09&hasta=2026-11-15');
});
test('ejecutar: bi con un periodo futuro es error claro y no consulta',async()=>{
 const db=cliente({},{ventas_bi:{data:VACIO_BI,error:null}});
 await assert.rejects(ejecutarHerramienta(db,'corporativo',{herramienta:'bi',desde:'2099-01-01',hasta:'2099-01-07',sucursal:null,canal:null,comparar:'anterior',dias:null},ORIGEN),/futuro/);
 assert.equal(db.llamadas.length,0);
});
test('ejecutar: bi con comparar semana y dias pasa ambos a ventas_bi',async()=>{
 const db=cliente({},{ventas_bi:{data:VACIO_BI,error:null}});
 const r=await ejecutarHerramienta(db,'corporativo',{herramienta:'bi',desde:'2026-11-16',hasta:'2026-11-19',sucursal:null,canal:null,comparar:'semana',dias:[5]},ORIGEN);
 assert.deepEqual(db.llamadas.map(([,a])=>[a.p.desde,a.p.hasta,a.p.dias]),[['2026-11-16','2026-11-19',[5]],['2026-11-09','2026-11-12',[5]]]);
 assert.equal(r.comparacion.tipo,'semana');assert.equal(r.sinVenta,true);
 assert.deepEqual(r.filtroDias,[5]);assert.ok(Array.isArray(r.dias));
});
