import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarAdjunto,validarImagen,MAX_ADJUNTO} from './adjuntos.ts';
test('adjuntos: acepta PDF e identifica MIME por contenido, no por MIME del navegador',()=>{
 assert.deepEqual(validarAdjunto('cotización.pdf',new TextEncoder().encode('%PDF-1.7 soporte')),{nombre:'cotización.pdf',extension:'pdf',mime:'application/pdf'});
 assert.equal(validarAdjunto('ticket.JPEG',Uint8Array.from([255,216,255,0])).extension,'jpg');
});
test('adjuntos: rechaza archivo vacío, excesivo, nombres con rutas y formatos activos',()=>{
 for(const [n,b] of [['x.pdf',new Uint8Array()],['x.pdf',new Uint8Array(MAX_ADJUNTO+1)],['../x.pdf',new TextEncoder().encode('%PDF-')],['x.html',new TextEncoder().encode('<html>')],['x.pdf',new TextEncoder().encode('<html>')]] as const)assert.throws(()=>validarAdjunto(n,b));
});
test('adjuntos: reconoce firmas PNG/WebP y rechaza extensiones cambiadas',()=>{
 assert.equal(validarAdjunto('foto.png',Uint8Array.from([137,80,78,71,13,10,26,10])).mime,'image/png');
 assert.equal(validarAdjunto('foto.webp',new TextEncoder().encode('RIFFxxxxWEBP')).mime,'image/webp');
 assert.throws(()=>validarAdjunto('foto.jpg',new TextEncoder().encode('RIFFxxxxWEBP')));
});
test('adjuntos: ZIP genérico no pasa como Excel/Word; se exige estructura Office',()=>{
 assert.throws(()=>validarAdjunto('cotizacion.xlsx',Uint8Array.from([80,75,3,4,0])));
 const base=new TextEncoder().encode('PK\x03\x04[Content_Types].xml xl/workbook.xml');
 assert.equal(validarAdjunto('cotizacion.xlsx',base).extension,'xlsx');
 assert.throws(()=>validarAdjunto('contrato.docx',base));
});
test('adjuntos: fotos de manuales solo JPG, PNG o WebP con contenido real',()=>{
 assert.deepEqual(validarImagen('Medidor.JPEG',Uint8Array.from([255,216,255,224])),{nombre:'Medidor.JPEG',extension:'jpg',mime:'image/jpeg'});
 assert.throws(()=>validarImagen('manual.pdf',new TextEncoder().encode('%PDF-1.7')),/JPG, PNG o WebP/);
 assert.throws(()=>validarImagen('falsa.png',Uint8Array.from([255,216,255])),/no coincide/);
});
