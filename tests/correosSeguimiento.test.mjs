import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('seguimiento: píxel sin caché, clic con destino validado y baja con botón',()=>{
 const a=leer('app/api/correos/a/[token]/route.ts'),c=leer('app/api/correos/c/[token]/route.ts'),p=leer('app/baja/[token]/page.tsx'),x=leer('app/baja/[token]/acciones.ts');
 assert.match(a,/image\/gif/);assert.match(a,/no-store/);assert.match(a,/correo_registrar_evento/);
 assert.match(c,/destinoClic\(/);assert.match(c,/status:\s*302/);assert.doesNotMatch(c,/redirect\(u\)/);
 assert.doesNotMatch(p,/correo_baja_por_token/,'abrir la página no debe dar de baja');
 assert.match(p,/<form action=\{darDeBaja\}/);assert.match(x,/correo_baja_por_token/);
});
test('seguimiento: píxel y clic nunca fallan a la vista del lector',()=>{
 const a=leer('app/api/correos/a/[token]/route.ts'),c=leer('app/api/correos/c/[token]/route.ts');
 for(const s of [a,c]){assert.match(s,/try\s*\{/);assert.match(s,/catch/);assert.match(s,/Promise\.race/);}
 assert.match(c,/no-store/);
});
