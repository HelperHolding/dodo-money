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
test('soporte: solo admin ve tablero, gestión y ajustes; el detalle marca leído',()=>{
 const p=leer('app/soporte/page.tsx');
 assert.match(p,/esSoporte\(perfil\.rol\)/);assert.match(p,/<TableroSoporte/);assert.match(p,/enTablero\(/);assert.match(p,/filtrar\(/);
 const d=leer('app/soporte/[numero]/page.tsx');
 assert.match(d,/marcar_ticket_leido/);assert.match(d,/\{soporte && <section className="seccion"><h2>Atender/);assert.match(d,/urlCaptura\(/);assert.match(d,/name="revision"/);
 const a=leer('app/soporte/ajustes/page.tsx');
 assert.match(a,/if \(!esSoporte\(perfil\.rol\)\) notFound\(\)/);
 const t=leer('app/soporte/TableroSoporte.tsx');
 assert.match(t,/pideComentario/);assert.match(t,/solo-celular/);
});
