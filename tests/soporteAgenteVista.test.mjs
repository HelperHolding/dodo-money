import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('alta: agenda al agente con after() y el token de la sesión; la página permite 60 s',()=>{
 const a=leer('app/soporte/acciones.ts');
 assert.match(a,/import \{ after \} from "next\/server"/);assert.match(a,/getSession\(\)/);assert.match(a,/after\(\(\) => atenderConAgente\(/);
 assert.ok(a.indexOf('after(')<a.indexOf('listo(`/soporte/${data}`'),'after se agenda antes de redirigir');
 assert.match(leer('app/soporte/nuevo/page.tsx'),/export const maxDuration = 60/);
});
test('corrida: sesión de quien reporta para leer, servicio solo para cerrar; nunca lanza; no registra contenido',()=>{
 const c=leer('lib/soporte/agenteCorrer.ts');
 assert.match(c,/import "server-only"/);assert.match(c,/Authorization: `Bearer \$\{o\.token\}`/);
 assert.match(c,/consultasIA\(usuario,/);assert.match(c,/agente_cerrar_ticket/);assert.match(c,/'fallido'|"fallido"/);
 assert.match(c,/AbortSignal\.timeout\(45000\)/);assert.match(c,/agente_estado !== "pendiente"/);
 assert.doesNotMatch(c,/console\.(log|error)\([^)]*(descripcion|titulo|texto|cierre)/,'no se registra contenido');
});
test('resumen: llave de n8n, ajustes, rango de 24 h y correos armados',()=>{
 const r=leer('app/api/soporte/resumen/route.ts');
 assert.match(r,/llaveValida\(req\.headers\.get\("x-api-key"\), process\.env\.SOPORTE_API_KEY\)/);
 assert.match(r,/soporte_resumen_agente/);assert.match(r,/resumen_diario/);assert.match(r,/armarResumen\(/);
 assert.match(leer('lib/rutasPublicas.ts'),/"\/api\/soporte\/resumen"/);
});
test('pantallas: hilo marca agente y nota interna; tarjeta con insignia; ajustes con interruptores',()=>{
 const d=leer('app/soporte/[numero]/page.tsx');
 assert.match(d,/data-interna=\{e\.interna \|\| undefined\}/);assert.match(d,/Nota interna \(solo soporte\)/);assert.match(d,/e\.es_agente/);
 assert.match(leer('app/soporte/TarjetaTicket.tsx'),/soporte && t\.agente_estado/);
 const a=leer('app/soporte/ajustes/page.tsx');
 assert.match(a,/name="agente_activo"/);assert.match(a,/name="resumen_diario"/);assert.match(a,/evento === "escalado" [?] "escalado del agente"/);
 const acc=leer('app/soporte/acciones.ts');
 assert.match(acc,/p_agente_activo: fd\.get\("agente_activo"\) === "1"/);assert.match(acc,/p_resumen_diario: fd\.get\("resumen_diario"\) === "1"/);
 assert.match(leer('app/soporte/datos.ts'),/agente_activo, resumen_diario/);
 const css=leer('app/globals.css');assert.match(css,/\.hilo-tarea li\[data-interna\]/);
 const t=leer('lib/soporte.ts');assert.match(t,/agente_estado: string \| null/);assert.match(t,/es_agente: boolean \| null; interna: boolean \| null/);
});
