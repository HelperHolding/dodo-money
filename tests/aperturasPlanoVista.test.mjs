import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('pestaña Plano: VISTAS la incluye y la página pinta <PlanoApertura con vista plano',()=>{
 assert.match(leer('app/aperturas/AktonProyecto.tsx'),/\['plano','Plano'\]/);
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/'plano'/);
 assert.match(p,/vista==='plano'\?[\s\S]*<PlanoApertura/);
 assert.match(p,/from\('apertura_planos'\)[^;]*\.order\('hoja'\)/,'hojas ordenadas por clave');
 assert.match(p,/from\('apertura_plano_marcas'\)/);
 assert.match(p,/from\('aperturas-planos'\)\.createSignedUrl\([^)]*3600\)/,'URL firmada de 1 h');
});

test('PlanoApertura: colores, conteo, atención, coordenadas, ubicar e imprimir',()=>{
 const c=leer('app/aperturas/plano/PlanoApertura.tsx');
 assert.match(c,/^["']use client["']/);
 for(const f of [/colorMarca\(/,/conteoColores\(/,/necesitaAtencion\(/,/aCoordenada\(/,/colocarMarca/,/quitarMarca/,/window\.print\(\)/,/nombreEstado\(/,/onPointerDown/])assert.match(c,f,String(f));
 assert.match(c,/\/compras\/ordenes\//);assert.match(c,/\/compras\/facturas\//);assert.match(c,/\/items\//);
 assert.match(c,/<SubirPlano/);
 assert.match(c,/Imprimir \/ PDF/);
});

test('SubirPlano: pdf.js dinámico, rutas {proyecto}/uuid y limpieza si falla',()=>{
 const s=leer('app/aperturas/plano/SubirPlano.tsx');
 assert.match(s,/import\(['"]pdfjs-dist['"]\)/);
 assert.match(s,/GlobalWorkerOptions\.workerSrc/);
 assert.match(s,/\$\{proyecto\}\//);
 assert.match(s,/crypto\.randomUUID\(\)/);
 assert.match(s,/BUCKET='aperturas-planos'/);assert.match(s,/storage\.from\(BUCKET\)\.upload\(/);
 assert.match(s,/\.remove\(/,'borra lo recién subido si falla');
 assert.match(s,/guardarPlano\(/);
 assert.match(s,/['"]\.jpg['"]|jpg/);
 assert.doesNotMatch(s,/\.jpeg['"`]/,'la extensión es .jpg');
 assert.match(s,/25\s*\*\s*1024\s*\*\s*1024/);
});

test('ChecklistEditable y PlanoApertura usan la misma ventana de estado',()=>{
 const v=leer('app/aperturas/VentanaEstado.tsx');
 assert.match(v,/export function VentanaEstado/);assert.match(v,/cambiarEstadoApertura\(/);
 for(const a of ['app/aperturas/ChecklistEditable.tsx','app/aperturas/plano/PlanoApertura.tsx']){
  const f=leer(a);
  assert.match(f,/import \{VentanaEstado\} from ['"](\.\.?\/)+VentanaEstado['"]/,a);
  assert.match(f,/<VentanaEstado /,a);
 }
 assert.doesNotMatch(leer('app/aperturas/ChecklistEditable.tsx'),/function VentanaEstado/,'ya no está duplicada');
});

test('acciones del plano: servidor, puedeEditarCompras y RPC',()=>{
 const a=leer('app/aperturas/plano/acciones.ts');
 assert.match(a,/^["']use server["']/);
 for(const f of ['guardarPlano','colocarMarca','quitarMarca','borrarPlano'])assert.match(a,new RegExp(`export async function ${f}\\(`),f);
 assert.equal(a.match(/puedeEditarCompras\(/g)?.length,4,'las cuatro validan');
 for(const r of ['guardar_apertura_plano','colocar_apertura_marca','quitar_apertura_marca','borrar_apertura_plano'])assert.match(a,new RegExp(`rpc\\(['"]${r}['"]`),r);
 assert.doesNotMatch(a,/redirect\(/,'responden {error}|{ok} sin redirigir');
});

test('pdfjs-dist en dependencias y la prueba en el script test',()=>{
 const pk=JSON.parse(leer('package.json'));
 assert.ok(pk.dependencies['pdfjs-dist']);
 assert.match(pk.scripts.test,/tests\/aperturasPlanoVista\.test\.mjs/);
});

test('CSS: marcas de 18 px y @media print del plano',()=>{
 const css=leer('app/globals.css');
 assert.match(css,/\.ap-plano-marca\s*\{[^}]*width:18px/);
 assert.match(css,/@media print\s*\{[^@]*ap-plano/);
});
