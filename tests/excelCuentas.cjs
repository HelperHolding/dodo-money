const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function cargar(archivo){const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=id=>id.startsWith('node:')?require(id):cargar(path.resolve(path.dirname(archivo),id.replace(/\.ts$/,'')+'.ts'));new Function('require','module','exports',js)(req,mod,mod.exports);return mod.exports;}
const {hojasCuentas}=cargar('lib/finanzas/excelCuentas.ts');
const {escribirXlsx}=cargar('lib/xlsx-escribir.ts');
const {leerHojas}=cargar('lib/ventas/xlsx.ts');
const columnas=[{etiqueta:'Oct',desde:'2026-10-01',hasta:'2026-10-31'},{etiqueta:'Nov',desde:'2026-11-01',hasta:'2026-11-15'}];
const grupo=(id,montos)=>({id,codigo:id==='calculada'?null:id,nombre:id,estado:id==='calculada'?'Fuente calculada':'Cuenta confirmada',monto:montos.reduce((s,n)=>s+n,0),items:montos.map((monto,i)=>({monto,texto:i?'NC "A"':'Factura CP242',fecha:'2026-10-21',proveedor:'Proveedor & nombre',rfc:'HCM260306B93',uuid:'AA0EA0AA-E7A8-49B5-9ED6-180B7E0A47E8',nota:'Cobertura octubre. 25/31 días.',href:'/compras/facturas/id?x="a"&b=1'}))});
const filas=[
 {clave:'marketing',nombre:'Marketing',tipo:'gasto',celdas:[{monto:90,grupos:[grupo('602-61-102',[100,-10])]},{monto:30,grupos:[grupo('602-61-102',[30])]}]},
 {clave:'ebitda',nombre:'EBITDA (provisional)',tipo:'total',celdas:[{monto:-90,grupos:[grupo('602-61-102',[-100,10])]},{monto:-30,grupos:[grupo('602-61-102',[-30])]}]},
 {clave:'memo_insumos',nombre:'Compras de insumos · fuera del resultado',tipo:'memo',celdas:[{monto:106,grupos:[grupo('502-01-000',[106])]},{monto:0,grupos:[]}]},
 {clave:'merma',nombre:'Merma pendiente',tipo:'gasto',celdas:[{monto:null,grupos:[]},{monto:0,grupos:[]}]},
];
const reporte=()=>({titulo:'La Calma',generado:'Sebastián',columnas,filas,avisos:['Costos pendientes.']});
test('Excel cuentas: cada importe concilia con su detalle y acumulado; no suma subtotales duplicados',()=>{
 const hojas=hojasCuentas(reporte()),[resumen,detalle]=leerHojas(escribirXlsx(hojas));
 assert.deepEqual(hojas.map(h=>h.nombre),['Por cuentas','Detalle']);
 assert.equal(resumen.celdas.get('C6'),90);assert.equal(resumen.celdas.get('D6'),30);assert.equal(resumen.celdas.get('E6'),120);
 assert.equal(resumen.celdas.get('E8'),-120);assert.equal(resumen.celdas.get('E9'),106);
 assert.equal(resumen.celdas.get('C11'),'Sin dato');assert.equal(resumen.celdas.get('D11'),0);assert.equal(resumen.celdas.get('E11'),'Sin dato');
 assert.equal([...detalle.celdas.values()].filter(x=>x==='Factura CP242').length,10); // total y acumulado tienen su propio respaldo
 const destino=Number(hojas[0].filas[5][4].enlaceInterno.split('!A')[1]);assert.equal(detalle.celdas.get('D'+destino),'Acumulado');
 assert.equal(detalle.celdas.get('L'+destino)+detalle.celdas.get('L'+(destino+1))+detalle.celdas.get('L'+(destino+2)),120);
 for(const [ref,f] of resumen.formulas){
   const m=/^ROUND\(SUM\('Detalle'!L(\d+):L(\d+)\),2\)$/.exec(f);
   if(m){let sum=0;for(let n=+m[1];n<=+m[2];n++)sum+=Number(detalle.celdas.get('L'+n));assert.equal(Math.round(sum*100)/100,resumen.celdas.get(ref),ref);}
   else {const a=/^ROUND\(SUM\(C(\d+):D\d+\),2\)$/.exec(f);assert.ok(a,f);assert.equal(Math.round((resumen.celdas.get('C'+a[1])+resumen.celdas.get('D'+a[1]))*100)/100,resumen.celdas.get(ref));}
 }
 assert.ok([...detalle.formulas.values()].some(f=>f.includes('https://dodo-money-j31t.vercel.app/compras/facturas/id')));
 assert.equal(detalle.celdas.get('K6'),'AA0EA0AA-E7A8-49B5-9ED6-180B7E0A47E8');
 assert.equal(typeof detalle.celdas.get('G6'),'number');assert.equal(typeof detalle.celdas.get('L6'),'number');
 assert.ok(hojas[0].filas[5][2].enlaceInterno.startsWith("'Detalle'!A"));
});
test('Excel cuentas: fuentes calculadas, cero, falta de datos y sin días cerrados permanecen explícitos',()=>{
 const r=reporte();r.filas=[{clave:'venta',nombre:'Venta neta',tipo:'venta',celdas:[{monto:0,grupos:[grupo('calculada',[0])]},{monto:0,grupos:[]}]}];
 const [res,det]=hojasCuentas(r);assert.equal(det.filas[5][2],'Fuente calculada');assert.equal(res.filas[5][2].resultado,0);
 const vacio=hojasCuentas({...r,columnas:[],filas:[]});assert.ok(vacio[0].filas.some(f=>String(f[0]).includes('Todavía no hay días cerrados')));
 assert.ok(!JSON.stringify(vacio).includes('SUM(C6:B6)'));
});
test('Excel cuentas: nombres externos se guardan como texto y solo se enlazan documentos del sitio',()=>{
 const g=grupo('602-61-102',[10]);g.items[0].texto='=HYPERLINK("malicioso")';g.items[0].href='//externo.example';
 const h=hojasCuentas({...reporte(),columnas:[columnas[0]],filas:[{clave:'x',nombre:'X',tipo:'gasto',celdas:[{monto:10,grupos:[g]}]}]});
 const det=leerHojas(escribirXlsx(h))[1];assert.equal(det.celdas.get('H6'),'=HYPERLINK("malicioso")');assert.equal(det.formulas.has('H6'),false);assert.equal(det.formulas.has('N6'),false);
});
test('ruta Excel: conserva filtros y descarga las cuatro hojas con datos de la tabla contable',async()=>{
 const archivo='app/reporte/pl/excel/route.ts';const mod={exports:{}};let recibidos;
 const entrada={memos:{insumos:0,inversiones:0},descuentos:0};
 const meta={filas:[],entrada,anterior:null,acumulado:new Map(),columnas:{anterior:'Anterior',acumulado:'Año'}};
 const req=id=>id==='@/app/finanzas/reporte-datos'?{reportePL:async(q,que)=>{recibidos={q,que};return {titulo:'La Calma',generadoPor:'S',periodo:{titulo:'Octubre',clave:'2026-10',hasta:'2026-10-25',finNominal:'2026-10-31'},cuentas:reporte(),meta,comp:{periodoTitulo:'Meses',columnas:[],total:{etiqueta:'Total',filas:[],entrada}}};}}:
   id==='@/lib/formato'?{fechaMX:()=>'',hora:()=>''}:cargar(id.replace('@/', '')+'.ts');
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(req,mod,mod.exports);
 const respuesta=await mod.exports.GET(new Request('https://dodo-money-j31t.vercel.app/reporte/pl/excel?periodo=semana&semana=2026-W42&sucursal=calma&vista=cuentas'));
 assert.deepEqual(recibidos.q,{periodo:'semana',semana:'2026-W42',sucursal:'calma',vista:'cuentas'});
 assert.equal(recibidos.que.cuentas,true);assert.equal(respuesta.headers.get('Cache-Control'),'no-store');
 assert.match(respuesta.headers.get('Content-Disposition'),/attachment/);
 assert.deepEqual(leerHojas(new Uint8Array(await respuesta.arrayBuffer())).map(h=>h.nombre),['Por cuentas','Detalle','Contra meta','Comparativo']);
});
