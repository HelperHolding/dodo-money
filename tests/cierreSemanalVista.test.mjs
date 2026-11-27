import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('cierre semanal: la página arma el cierre y exige permiso de finanzas',()=>{
 const p=leer('app/ventas/cierre-semanal/page.tsx');
 assert.match(p,/cargarCierreSemanal\(|armarCierreSemanal\(/);
 assert.match(p,/puedeVerFinanzas\(/);
 assert.match(p,/puedeEditarFinanzas\(/);
 assert.match(p,/semanaDe\(/);
 const d=leer('app/ventas/cierre-semanal/datos.ts');
 assert.match(d,/armarCierreSemanal\(/);assert.match(d,/esNetPay/);assert.match(d,/esComisionNetPay/);assert.match(d,/cobro_tarjeta/);
 // Rappi: solo órdenes del portal (mismo filtro que Ventas → Rappi); NetPay prorrateado con la función pura.
 assert.match(d,/\.like\("archivo", `\$\{PREFIJO_EN_VIVO\}%`\)/);assert.doesNotMatch(d,/neq\("archivo"/);
 assert.match(d,/atribuirNetPay\(/);
 // El nombre del aprobador no se inventa si la consulta falla.
 assert.match(p,/if \(r\.error\) throw new Error/);
});
test('cierre semanal: la acción recalcula en el servidor y aprueba con la RPC',()=>{
 const a=leer('app/ventas/cierre-semanal/acciones.ts');
 assert.match(a,/^"use server";/);
 assert.match(a,/puedeEditarFinanzas\(|clienteFinanzas\(/);
 assert.match(a,/cargarCierreSemanal\(/);
 assert.match(a,/rpc\("aprobar_cierre_semanal"/);
 assert.doesNotMatch(a,/get\(["']totales["']\)/);
 assert.match(a,/revalidatePath\(/);
});
test('cierre semanal: enlace en el menú de Ventas solo con finanzas',()=>{
 const r=leer('lib/roles.ts');
 assert.match(r,/finanzas \? \[\{ href: "\/ventas\/cierre-semanal", texto: "Cierre semanal" \}\]/);
});
test('cierre semanal: @page con nombre, sin @page global',()=>{
 const c=leer('app/globals.css');
 assert.match(c,/@page cierre-semanal \{[^}]*letter landscape/);
 assert.match(c,/page: ?cierre-semanal/);
 assert.doesNotMatch(c,/@page\s*\{/);
});
