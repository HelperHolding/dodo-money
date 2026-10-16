import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentosCompra,filtrarDocumentosCompra,agruparDocumentosCompra,type OrdenCompraVista,type FacturaCompraVista} from './documentosCompra.ts';
const base={id:'o',nombre:'OC-0001',proveedor_id:'p',proveedor:'Proveedor Álamo',sucursal_id:'s',destino:'Zapopan-1',fecha:'2026-10-08',importe:116};
const orden:OrdenCompraVista={...base,estado:'confirmada'};
const factura:FacturaCompraVista={...base,id:'f',nombre:'F-1',estado:'por_pagar',saldo:116,vence_el:'2026-10-07',tipo:'ingreso',origen:'cfdi',sustituido_por:null};

test('artículo: última factura por emisión, incluye pagadas y excluye canceladas, sustituidas y notas',()=>{
 const fs=[{...factura,id:'anterior',fecha:'2026-10-01',articulos:['Alitas de pollo']},{...factura,id:'ultima',fecha:'2026-10-10',estado:'pagada' as const,saldo:0,articulos:['Alitas de pollo']},...['cancelada','nota','sustituida'].map(id=>({...factura,id,fecha:'2026-10-15',articulos:['Alitas de pollo'],estado:id==='nota'?'pagada' as const:'cancelada' as const,tipo:id==='nota'?'egreso' as const:'ingreso' as const,sustituido_por:id==='sustituida'?'ultima':null}))];
 const filas=documentosCompra([],fs,[],'2026-10-16');assert.equal(filtrarDocumentosCompra(filas,{q:'alitas',ultima:'si',canceladas:true})[0].id,'ultima');
 assert.equal(filtrarDocumentosCompra(filas,{q:'alitas',ultima:'si',hasta:'2026-10-05'})[0].id,'anterior');
 assert.equal(filtrarDocumentosCompra(filas,{q:'alitas',ultima:'si',proveedor:'otro'}).length,0);
 assert.equal(filtrarDocumentosCompra(filas,{ultima:'si'}).length,0);
});
test('artículo: busca conceptos y pequeños errores, sin inferir por nombre del proveedor',()=>{
 const filas=documentosCompra([], [{...factura,id:'alitas',articulos:['Alitas de pollo'],registrado_en:'2026-10-08T12:00:00Z'},{...factura,id:'falso',proveedor:'Alitas del Norte',articulos:['Tortilla']},{...factura,id:'reciente',articulos:['Alitas de pollo'],registrado_en:'2026-10-08T15:00:00Z'}],[],'2026-10-16');
 assert.equal(filtrarDocumentosCompra(filas,{q:'alti as',articulo:'si'}).length,0);
 assert.equal(filtrarDocumentosCompra(filas,{q:'alitas',ultima:'si'})[0].id,'reciente');
 assert.equal(filtrarDocumentosCompra(filas,{q:'alitsa',ultima:'si'})[0].id,'reciente');
 assert.equal(filtrarDocumentosCompra(filas,{q:'alitas',articulo:'si'}).length,2);
});
test('documentos: cotización cambia a orden al confirmar sin crear otro registro',()=>{
 assert.equal(documentosCompra([{...orden,estado:'borrador'}],[],[],'2026-10-08')[0].etapa,'cotizacion');
 assert.equal(documentosCompra([{...orden,estado:'enviada'}],[],[],'2026-10-08')[0].etapa,'cotizacion');
 assert.equal(documentosCompra([orden],[],[],'2026-10-08')[0].etapa,'orden');
});
test('documentos: factura vigente sustituye fila de orden y conserva el enlace de origen',()=>{
 const filas=documentosCompra([orden],[factura],[{orden_id:'o',factura_id:'f'}],'2026-10-08');
 assert.equal(filas.length,1);assert.equal(filas[0].etapa,'factura');assert.deepEqual(filas[0].ordenes,[{id:'o',nombre:'OC-0001'}]);assert.equal(filas[0].vencida,true);
});
test('documentos: dos facturas mantienen dos documentos sin duplicar la orden',()=>{
 const filas=documentosCompra([orden],[factura,{...factura,id:'f2'}],[{orden_id:'o',factura_id:'f'},{orden_id:'o',factura_id:'f2'}],'2026-10-08');assert.equal(filas.length,2);
});
test('documentos: cancelar factura devuelve visibilidad a la orden; nota de crédito no la oculta',()=>{
 for(const f of [{...factura,estado:'cancelada' as const},{...factura,tipo:'egreso' as const}]){
 const filas=documentosCompra([orden],[f],[{orden_id:'o',factura_id:'f'}],'2026-10-08');assert.equal(filas.length,2);assert.ok(filas.some(d=>d.etapa==='orden'));
 }
});
test('documentos: factura directa, pago parcial y pagada conservan estado sin exigir cotización',()=>{
 const filas=documentosCompra([], [{...factura,estado:'parcial'},{...factura,id:'f2',estado:'pagada',saldo:0}],[],'2026-10-08');
 assert.deepEqual(filas.find(f=>f.id==='f')?.ordenes,[]);assert.equal(filas.find(f=>f.id==='f2')?.tono,'verde');assert.equal(filas.find(f=>f.id==='f2')?.vencida,false);
});
test('documentos: sustitución oculta cancelada por defecto; filtros no pierden las facturas directas',()=>{
 const filas=documentosCompra([], [{...factura,origen:'manual',estado:'cancelada',sustituido_por:'f2'},{...factura,id:'f2',sucursal_id:null}],[],'2026-10-08');
 assert.equal(filtrarDocumentosCompra(filas,{}).length,1);assert.equal(filtrarDocumentosCompra(filas,{canceladas:true}).length,2);
 assert.equal(filtrarDocumentosCompra(filas,{q:'alamo',sucursal:'oficina',etapa:'factura'}).length,1);
 assert.equal(filtrarDocumentosCompra(filas,{proveedor:'otro'}).length,0);
});
test('documentos: buscar por folio de origen y contar una factura vinculada a varias órdenes una sola vez',()=>{
 const filas=documentosCompra([orden,{...orden,id:'o2',nombre:'OC-2'}],[factura],[{orden_id:'o',factura_id:'f'},{orden_id:'o2',factura_id:'f'},{orden_id:'o',factura_id:'f'}],'2026-10-08');
 assert.equal(filas.length,1);assert.equal(filas[0].ordenes.length,2);assert.equal(filtrarDocumentosCompra(filas,{q:'OC-2'}).length,1);
});

test('búsqueda por palabras sin acentos y rango inclusivo de fechas',()=>{
 const filas=documentosCompra([orden],[],[],'2026-10-09');
 assert.equal(filtrarDocumentosCompra(filas,{q:'zapopan alamo',desde:'2026-10-08',hasta:'2026-10-08'}).length,1);
 assert.equal(filtrarDocumentosCompra(filas,{desde:'2026-10-09'}).length,0);
 assert.equal(filtrarDocumentosCompra(filas,{q:'alamo inexistente'}).length,0);
});
test('agrupación conserva documentos y separa proveedores homónimos y Oficina',()=>{
 const filas=documentosCompra([orden,{...orden,id:'o2',proveedor_id:'p2',sucursal_id:null,fecha:'2026-10-09'}],[],[],'2026-10-09');
 assert.equal(agruparDocumentosCompra(filas,'proveedor').length,2);
 assert.equal(agruparDocumentosCompra(filas,'sucursal').length,2);
 assert.equal(agruparDocumentosCompra(filas,'fecha')[0].clave,'2026-10-09');
 assert.equal(agruparDocumentosCompra(filas).flatMap(g=>g.filas).length,2);
});

test('recepción: factura hereda avance de todas sus órdenes sin inferir por pago',()=>{
 const completas=[{...orden,recepcion:'completa' as const},{...orden,id:'o2',recepcion:'completa' as const}];
 const ligas=[{orden_id:'o',factura_id:'f'},{orden_id:'o2',factura_id:'f'}];
 assert.equal(documentosCompra(completas,[factura],ligas,'2026-10-09')[0].recepcion,'completa');
 assert.equal(documentosCompra([completas[0],{...completas[1],recepcion:'nada'}],[factura],ligas,'2026-10-09')[0].recepcion,'parcial');
 assert.equal(documentosCompra([], [{...factura,estado:'pagada'}],[],'2026-10-09')[0].recepcion,null);
 assert.equal(documentosCompra([{...orden,recepcion:'parcial'}],[],[],'2026-10-09')[0].recepcion,'parcial');
});


test('razones sociales: filtra por RFC y busca razón social sin mezclar empresas',()=>{
 const filas=documentosCompra([], [{...factura,rfc_receptor:'HCM260306B93',empresa:'HELPER COMERCIALIZADORA MASTER'},{...factura,id:'cms',rfc_receptor:'CMS230321FI8',empresa:'COMERCIALIZADORA MASTER SITRU'}],[],'2026-10-15');
 assert.equal(filtrarDocumentosCompra(filas,{empresa:'CMS230321FI8'}).length,1);
 assert.equal(filtrarDocumentosCompra(filas,{q:'sitru'})[0].id,'cms');
 assert.equal(filtrarDocumentosCompra(filas,{empresa:'HCM260306B93',q:'sitru'}).length,0);
 assert.equal(filtrarDocumentosCompra(filas,{}).length,2);
});
