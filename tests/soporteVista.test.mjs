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
test('tablero: tarjeta limpia y arrastre a todas las columnas, Resuelto pide la respuesta',()=>{
 const c=leer('app/soporte/TarjetaTicket.tsx');
 assert.match(c,/className="ticket-arriba"/);assert.match(c,/className="ticket-pie"/);assert.match(c,/ticket-avatar/);
 assert.match(c,/draggable=\{false\}/,'los enlaces no secuestran el arrastre');
 const t=leer('app/soporte/TableroSoporte.tsx');
 assert.match(t,/<TarjetaTicket/);
 assert.match(t,/dataTransfer\.setData/,'Firefox no arrastra sin setData');
 assert.match(t,/data-destino/);assert.match(t,/data-sobre/);
 assert.match(t,/<dialog/);assert.match(t,/name="comentario"[^>]*required/);
 assert.match(t,/className="tarea-mover solo-celular"/,'el selector solo en celular');
 assert.doesNotMatch(t,/filter\(\(a\) => !pideComentario\(a\)\)/,'Resuelto ya no queda fuera del arrastre');
 assert.match(leer('lib/soporte.ts'),/resuelto: "exito"/);
 const css=leer('app/globals.css');
 assert.match(css,/\.tablero-columna\[data-sobre\]/);assert.match(css,/\.ticket-avatar/);
});
