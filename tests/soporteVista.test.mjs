import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('alta de ticket: un solo envío, captura sin forzar cámara y sección prellenada',()=>{
 const f=leer('app/soporte/nuevo/FormTicket.tsx');
 assert.match(f,/<BotonEnviar/);assert.match(f,/<CampoFoto[^>]*camara=\{false\}/);assert.match(f,/name="ruta_origen"/);
 assert.match(leer('app/soporte/nuevo/page.tsx'),/seccionDeRuta\(/);
 const a=leer('app/soporte/acciones.ts');
 assert.match(a,/storage\.from\(BUCKET_SOPORTE\)\.remove\(\[captura\]\)/,'si crear_ticket falla se borra la captura');
});
test('marco: contador de soporte y botón Reportar',()=>{
 const m=leer('components/Marco.tsx');
 assert.match(m,/contarSoporte/);assert.match(m,/"\/soporte"/);assert.match(m,/<BotonReportar/);
});
