import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('ImportarDodo: fflate dinámico, leerMatriz, bucket aperturas-fotos y rutas {proyecto}/uuid.jpg',()=>{
 const s=leer('app/aperturas/fotos/ImportarDodo.tsx');
 assert.match(s,/^["']use client["']/);
 assert.match(s,/import\(['"]fflate['"]\)/);
 assert.match(s,/unzipSync\(/);
 assert.match(s,/leerMatriz\(/);
 assert.match(s,/aperturas-fotos/);
 assert.match(s,/\$\{proyecto\}\//);
 assert.match(s,/crypto\.randomUUID\(\)\}\.jpg/);
 assert.match(s,/createImageBitmap\(|aJpeg\(/);
 assert.match(s,/aJpeg\([^)]*800\)/,'800 px de lado mayor');
 assert.match(s,/importarDodo\(/);
 assert.match(s,/\.remove\(/,'borra lo recién subido si falla');
 assert.match(s,/TANDA\s*=\s*400/,'tandas de 400');
 assert.match(s,/PARALELO\s*=\s*4/,'4 subidas a la vez');
 assert.match(s,/Subiendo \$\{/);
 assert.match(s,/Sin foto en las matrices cargadas/);
 assert.match(s,/Liga de Google Sheets/);
 assert.match(s,/<dialog/);
});

test('FotoReal: 5 MB, 1600 px, guardarFotoReal, limpieza y refresh',()=>{
 const s=leer('app/aperturas/fotos/FotoReal.tsx');
 assert.match(s,/^["']use client["']/);
 assert.match(s,/5\s*\*\s*1024\s*\*\s*1024/);
 assert.match(s,/aJpeg\([^)]*1600\)/);
 assert.match(s,/\$\{proyecto\}\/\$\{crypto\.randomUUID\(\)\}\.jpg/);
 assert.match(s,/guardarFotoReal\(/);
 assert.match(s,/\.remove\(/);
 assert.match(s,/router\.refresh\(\)/);
 for(const t of ['Subir foto real','Cambiar','Quitar'])assert.match(s,new RegExp(t),t);
});

test('aJpeg: createImageBitmap, lado mayor y JPEG 0.85',()=>{
 const s=leer('app/aperturas/fotos/imagen.ts');
 assert.match(s,/createImageBitmap\(/);
 assert.match(s,/Math\.max\(bmp\.width,bmp\.height\)/);
 assert.match(s,/['"]image\/jpeg['"],\s*0\.85/);
});

test('acciones de fotos: servidor, puedeEditarCompras y RPC',()=>{
 const a=leer('app/aperturas/fotos/acciones.ts');
 assert.match(a,/^["']use server["']/);
 for(const f of ['importarDodo','guardarFotoReal'])assert.match(a,new RegExp(`export async function ${f}\\(`),f);
 assert.equal(a.match(/puedeEditarCompras\(/g)?.length,2,'las dos validan');
 for(const r of ['importar_apertura_dodo','guardar_foto_real'])assert.match(a,new RegExp(`rpc\\(['"]${r}['"]`),r);
 assert.match(a,/fotos_anteriores/);
 assert.match(a,/revalidatePath\(/);
 assert.doesNotMatch(a,/redirect\(/);
 assert.doesNotMatch(a,/urlsFotos/,'urlsFotos no es acción');
});

test('urlsFotos: URLs firmadas de 1 h en lote, {} si falla',()=>{
 const u=leer('app/aperturas/fotos/urls.ts');
 assert.doesNotMatch(u,/["']use server["']/);
 assert.match(u,/export async function urlsFotos\(/);
 assert.match(u,/createSignedUrls\([^)]*3600\)/);
 assert.match(u,/return \{\}/);
});

test('page.tsx pinta <ImportarDodo solo en compras y con puedeEditarCompras',()=>{
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/vista==='compras'&&puedeEditarCompras\(perfil\.rol\)&&<ImportarDodo /);
 assert.equal(p.match(/<ImportarDodo /g)?.length,1);
 assert.match(p,/codigoDeItem\(/);
});

test('CSS del importador y la prueba en el script test',()=>{
 assert.match(leer('app/globals.css'),/\.ap-dodo-/);
 assert.match(JSON.parse(leer('package.json')).scripts.test,/tests\/aperturasFotosVista\.test\.mjs/);
});

test('ListaConceptos: miniatura solo si llega fotos',()=>{
 const s=leer('app/aperturas/ListaConceptos.tsx');
 assert.match(s,/fotos\?:\s*Record<string,string>/);
 assert.match(s,/<img[^>]*fotos\[/);
 assert.match(s,/loading="lazy"/);
 assert.match(s,/ap-miniatura/);
});

test('ficha de la partida: foto del proyecto y real, FotoReal y matriz de Dodo',()=>{
 const s=leer('app/aperturas/[id]/items/[item]/page.tsx');
 assert.match(s,/<FotoReal /);
 assert.match(s,/urlsFotos\(/);
 assert.match(s,/apertura_item_dodo/);
 assert.match(s,/Abrir matriz de Dodo/);
 assert.match(s,/target="_blank" rel="noreferrer"/);
 assert.match(s,/Sustituto verificado por Dodo/);
 assert.match(s,/Sin foto/);
});

test('PlanoApertura recibe fotos y la ficha de la marca muestra la miniatura',()=>{
 const s=leer('app/aperturas/plano/PlanoApertura.tsx');
 assert.match(s,/fotos\?:\s*Record<string,string>/);
 assert.match(s,/fotos\[actual\.id\]\?<img/);
 assert.match(s,/:<span className="ap-miniatura-ficha"/,"cuadro gris si falta la foto");
 assert.match(s,/ap-miniatura-ficha/);
});

test('page.tsx pide URLs firmadas solo de lo visible y pasa fotos',()=>{
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/apertura_item_dodo/);
 assert.match(p,/urlsFotos\(/);
 assert.match(p,/<ListaConceptos [^>]*fotos=\{/);
 assert.match(p,/<PlanoApertura [^>]*fotos=\{/);
});

test('CSS de miniatura y sección de foto',()=>{
 const c=leer('app/globals.css');
 for(const k of ['.ap-miniatura','.ap-miniatura-ficha','.ap-foto-seccion'])assert.ok(c.includes(k),k);
});

test('CSS de la celda Concepto no es global y usa el corte de tarjetas',()=>{
 const c=leer('app/globals.css');
 assert.ok(!c.includes('.tabla-tarjetas td[data-label="Concepto"]'));
 assert.match(c,/@media\(max-width:640px\) \{\s*\.tabla-tarjetas td\.ap-celda-concepto/);
 assert.match(leer('app/aperturas/ListaConceptos.tsx'),/ap-celda-concepto/);
});
