const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {PDFDocument}=require('pdf-lib');
function cargar(archivo,{rol='admin',existe=true,adjunto=false}={}){
 const llamadas=[];
 const factura={id:'11111111-1111-1111-1111-111111111111',uuid:null,uuid_manual:'12345678-1234-1234-1234-123456789ABC',origen:'manual',folio:'Prueba 001',serie:null,rfc_receptor:'HCM260306B93',rfc_emisor:'PRB010101AB1',nombre_emisor:'Proveedor de prueba',fecha_emision:'2026-10-15',vence_el:'2026-10-16',subtotal:100,descuento:0,iva:16,retenciones:0,total:116,saldo:60,pagado:56,pago_programado_forma:'transferencia',estado:'parcial',proveedores:{razon_social:'Proveedor México',nombre_comercial:'Proveedor'},sucursales:{nombre:'Zapopan-1'},pdf_ruta:adjunto?null:'factura.pdf',xml_ruta:'factura.xml'};
 const db={from(tabla){llamadas.push(tabla);const q={select(){return q},eq(){return q},not(){return q},order(){return q},limit(){return q},range(){return q},returns(){return Promise.resolve({data:tabla==='compra_adjuntos'?[{ruta:'adjunto.pdf'}]:[]})},maybeSingle(){return Promise.resolve({data:existe?(tabla==='razones_sociales'?{razon_social:'Empresa México'}:factura):null,error:null})}};return q},storage:{from(bucket){return {createSignedUrl:async(ruta)=>{llamadas.push({bucket,ruta});return {data:{signedUrl:'https://storage.invalid/archivo-firmado'}}}}}}};
 const code=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};
 const req=id=>id==='@/lib/contexto'?{obtenerPerfil:async()=>({supabase:db,perfil:{rol}})}:id==='@/lib/roles'?{puedeVerCompras:r=>['admin','corporativo'].includes(r)}:id==='@/lib/formato'?{pesos:n=>`$${Number(n).toFixed(2)}`}:id==='@/lib/compras/facturas'?{nombreFactura:f=>f.folio}:id==='@/lib/compras/proveedores'?{NOMBRE_FORMA_PAGO:{transferencia:'Transferencia'}}:id==='@/lib/ventas/paginar'?{leerTodo:async()=>Array.from({length:45},(_,i)=>({descripcion:`Concepto ${i+1}: champiñones y artículos de limpieza`,cantidad:1,unidad:'pieza',valor_unitario:2,importe:2}))}:require(id);
 new Function('require','module','exports',code)(req,mod,mod.exports);return {...mod.exports,llamadas};
}
const pdf='app/compras/facturas/[id]/pdf/route.ts',archivo='app/compras/facturas/[id]/archivo/route.ts',contexto={params:Promise.resolve({id:'11111111-1111-1111-1111-111111111111'})};
test('documentos pagos: permisos y documento inexistente',async()=>{
 for(const ruta of [pdf,archivo]){for(const rol of ['gerente','operacion','encargado']){const m=cargar(ruta,{rol});assert.equal((await m.GET(new Request('https://dodo.invalid?tipo=pdf'),contexto)).status,403);assert.equal(m.llamadas.length,0)}assert.equal((await cargar(ruta,{existe:false}).GET(new Request('https://dodo.invalid?tipo=pdf'),contexto)).status,404)}
});
test('documentos pagos: PDF/XML y adjunto usan almacenamiento privado consultado por factura',async()=>{
 for(const [tipo,adjunto,bucket,ruta] of [['pdf',false,'facturas','factura.pdf'],['xml',false,'facturas','factura.xml'],['pdf',true,'adjuntos-compras','adjunto.pdf']]){
 const m=cargar(archivo,{adjunto}),r=await m.GET(new Request('https://dodo.invalid?tipo='+tipo),contexto);assert.equal(r.status,302);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(m.llamadas.at(-1),{bucket,ruta});}
});
test('documentos pagos: PDF interno válido, con varias páginas y sin caché pública',async()=>{
 const r=await cargar(pdf).GET(new Request('https://dodo.invalid'),contexto);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.equal(r.headers.get('Cache-Control'),'private, no-store');const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok((await PDFDocument.load(bytes)).getPageCount()>1);
 if(process.env.PAGOS_QA_PDF){fs.mkdirSync(path.dirname(process.env.PAGOS_QA_PDF),{recursive:true});fs.writeFileSync(process.env.PAGOS_QA_PDF,bytes)}
});
