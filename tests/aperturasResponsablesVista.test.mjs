import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Cableado de la vista por responsable, el alta en un paso, la barra de avance y el calendario por catálogo (HD-27, HD-18).
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const columnas=(fuente,nombre)=>{const m=fuente.match(new RegExp(`export const ${nombre}\\s*=\\s*'([^']+)'`));assert.ok(m,nombre);return m[1].split(',').map(c=>c.trim());};

test('detalle: la vista no completa usa listas de columnas seguras, sin precio, orden ni factura',()=>{
 const p=leer('app/aperturas/[id]/page.tsx'),lib=leer('lib/aperturas.ts');
 assert.match(p,/completo=puedeVerAperturasCompleto\(perfil\.rol\)/);
 const items=columnas(lib,'COLUMNAS_ITEM_RESPONSABLE'),proyecto=columnas(lib,'COLUMNAS_PROYECTO_RESPONSABLE');
 for(const c of ['precio','orden_id','factura_id','original','*'])assert.ok(!items.includes(c),`items sin ${c}`);
 for(const c of ['id','proyecto_id','clave','tipo','etapa','nombre','estado','responsable','responsable_id','inicio','fin','revision','categoria'])assert.ok(items.includes(c),`items con ${c}`);
 assert.ok(!proyecto.includes('presupuesto')&&!proyecto.includes('*'),'proyecto sin presupuesto');
 assert.match(p,/select\(completo\?'\*':COLUMNAS_ITEM_RESPONSABLE\)/);
 assert.match(p,/select\(completo\?'\*,sucursales\(nombre\)':COLUMNAS_PROYECTO_RESPONSABLE\)/);
 // Sin precio, orden ni factura aunque el tipo los pida: se rellenan con null en el servidor.
 assert.match(p,/precio:null,orden_id:null,factura_id:null/);
});
test('detalle: sin presupuesto, CAPEX, cotización, compras, historial ni ImportarDodo para quien no es completo',()=>{
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/completo&&puedeVerFinanzas\(perfil\.rol\)\?await cargarPresupuestoVivo\(/);
 assert.match(p,/\{completo&&\(puedeVerFinanzas\(perfil\.rol\)&&capex\?<PresupuestoVivo/);
 assert.match(p,/\{completo&&puedeVerFinanzas\(perfil\.rol\)&&<ResumenCapexApertura/);
 assert.match(p,/\{completo&&<p>Presupuesto:/);
 assert.match(p,/completo\?supabase\.from\('apertura_proyecto_historial'\)/,'no consulta el historial del proyecto');
 assert.match(p,/\{completo&&<Historial /);
 assert.match(p,/VISTAS_RESPONSABLE/);
 assert.match(p,/Ves solo los registros a tu nombre/);
 assert.match(p,/<PestanasProyecto id=\{id\} vista=\{vista\} completo=\{completo\}\/>/);
 assert.match(p,/<IndicadoresProyectoAkton k=\{kpis\} objetivo=\{p\.objetivo_hasta\} completo=\{completo\}\/>/);
 // Sin fotos de Dodo ni cotización fuera de la vista completa.
 assert.match(p,/fotos:Record<string,string>\|undefined=!completo\|\|/);
 const a=leer('app/aperturas/AktonProyecto.tsx'),lib=leer('lib/aperturas.ts');
 assert.match(a,/Tu avance/);
 assert.match(a,/\{completo&&<Kpi etiqueta=\{k\.compras\.firme/);
 const vistas=lib.match(/export const VISTAS_RESPONSABLE\s*=\s*\[([^\]]+)\]/);assert.ok(vistas);
 for(const v of ['checklist','calendario','actividades','plano'])assert.match(vistas[1],new RegExp(`'${v}'`),v);
 for(const v of ['compras','roadmap','tecnico','activos','alertas'])assert.doesNotMatch(vistas[1],new RegExp(`'${v}'`),v);
});
test('hijos: el plano no pinta precio, OC ni factura si no es completo',()=>{
 const c=leer('app/aperturas/plano/PlanoApertura.tsx');
 assert.match(c,/\{completo&&<><dt>Precio<\/dt>/);
 assert.match(c,/\{completo&&actual\.orden_id&&/);
 assert.match(c,/\{completo&&actual\.factura_id&&/);
 assert.match(leer('app/aperturas/[id]/page.tsx'),/<PlanoApertura [^>]*completo=\{completo\}/);
 // Lista y checklist no tienen columnas de dinero.
 for(const f of ['app/aperturas/ListaConceptos.tsx','app/aperturas/Checklist.tsx','app/aperturas/ChecklistEditable.tsx','app/aperturas/Calendario.tsx'])
  assert.doesNotMatch(leer(f),/precio|orden_id|factura_id|pesos\(/,f);
});
test('lista: barra de avance, días que faltan y «Tu avance» para el responsable',()=>{
 const p=leer('app/aperturas/page.tsx');
 assert.match(p,/className="ap-avance-pista" role="progressbar"/);
 assert.match(p,/Tu avance/);
 assert.match(p,/completo=puedeVerAperturasCompleto\(perfil\.rol\)/);
 assert.match(p,/completo\?'\*,sucursales\(nombre\)':COLUMNAS_PROYECTO_RESPONSABLE/);
 assert.match(p,/!completo\?Promise\.resolve\(null\)/,'sin inversión para el responsable');
});
test('alta en un paso: nombre, descripción, tipo, etapa, categoría, responsable del catálogo, inicio y fin',()=>{
 const p=leer('app/aperturas/[id]/page.tsx'),a=leer('app/aperturas/acciones.ts');
 for(const n of ['nombre','descripcion','tipo','etapa','categoria','responsable_id','inicio','fin'])assert.match(p,new RegExp(`name="${n}"`),n);
 assert.match(p,/from\('apertura_responsables'\)/);
 assert.match(a,/rpc\('crear_apertura_item_completo',\{p_proyecto:id,p_tipo:[^}]*p_descripcion:[^}]*p_responsable:[^}]*p_inicio:[^}]*p_fin:/);
 assert.match(a,/puedeEditarCompras\(perfil\.rol\)/);
});
test('calendario: agrupa por responsable_id con el nombre del catálogo',()=>{
 const lib=leer('lib/aperturasCalendario.ts');
 assert.match(lib,/export const claveResponsable/);
 assert.match(lib,/responsable_id\?`r:\$\{i\.responsable_id\}`/);
 for(const f of ['personasDe','filtrarOcultos','conteoPorPersona','diaPorPersona'])assert.match(lib,new RegExp(`${f}[^\\n]*claveResponsable\\(|function ${f}[\\s\\S]{0,400}claveResponsable\\(`),f);
 for(const f of ['app/aperturas/Calendario.tsx','app/aperturas/VistaSemana.tsx'])assert.doesNotMatch(leer(f),/clavePersona\(i\.responsable\)/,f);
 const p=leer('app/aperturas/[id]/page.tsx');
 assert.match(p,/conCatalogo\(/);
 assert.match(p,/responsable_id/);
});
test('la prueba corre con npm test',()=>{
 assert.match(JSON.parse(leer('package.json')).scripts.test,/tests\/aperturasResponsablesVista\.test\.mjs/);
});
// Ficha del registro y catálogo de responsables (HD-17, HD-18, HD-27).
const FICHA='app/aperturas/[id]/items/[item]/page.tsx';
test('ficha: Nombre, Descripción, responsable del catálogo, Bitácora y Dividir para admin',()=>{
 const p=leer(FICHA),a=leer('app/aperturas/acciones.ts');
 assert.match(p,/name="nombre"/);
 assert.match(p,/name="descripcion"/);
 assert.match(p,/<SelectorResponsable /);
 assert.match(leer('app/aperturas/[id]/items/[item]/SelectorResponsable.tsx'),/Nuevo externo/);
 assert.match(p,/Bitácora/);
 // La bitácora se lee con la función que trae el nombre del autor (el RLS de perfiles lo oculta a un responsable).
 assert.match(p,/rpc\('bitacora_apertura',\{p_item:item\}\)/);
 assert.doesNotMatch(p,/from\('apertura_bitacora'\)/);
 assert.match(p,/b\.usuario_nombre\?\?'—'/);
 assert.match(p,/<VentanaDividir /);
 const d=leer('app/aperturas/[id]/items/[item]/VentanaDividir.tsx');
 assert.match(d,/Dividir/);
 assert.match(d,/MAX_PARTES=10/);
 assert.match(d,/MIN_PARTES=2/);
 assert.match(p,/Viene de /);
 assert.match(p,/Dividida en /);
 assert.match(a,/rpc\('agregar_bitacora_apertura',\{p_item:/);
 assert.match(a,/rpc\('dividir_apertura_item',\{p_item:/);
 assert.match(a,/rpc\('guardar_responsable_apertura',\{p_id:null,/);
 assert.match(a,/Dividida en \$\{/);
 // Sin la migración la ficha sigue: texto libre del responsable y aviso.
 assert.match(p,/hayMigracion=catalogo!==null/);
 assert.match(p,/hayMigracion\?<SelectorResponsable[\s\S]*list="responsables-sugeridos"/);
 // El historial muestra los cambios de nombre.
 assert.match(leer('app/aperturas/Historial.tsx'),/nombre:'Nombre'/);
});
test('ficha del responsable: columnas seguras, sin precio, OC, factura, origen con precios ni activo',()=>{
 const p=leer(FICHA),lib=leer('lib/aperturas.ts');
 assert.match(p,/completo=puedeVerAperturasCompleto\(perfil\.rol\)/);
 assert.match(p,/select\(completo\?'\*':COLUMNAS_FICHA_RESPONSABLE\)/);
 assert.match(lib,/export const COLUMNAS_FICHA_RESPONSABLE\s*=\s*`\$\{COLUMNAS_ITEM_RESPONSABLE\},origen_id`/);
 assert.match(p,/precio:null,orden_id:null,factura_id:null,original:\{\}/);
 // No consulta órdenes ni facturas de la sucursal.
 assert.match(p,/completo\?supabase\.from\('ordenes_compra'\)/);
 assert.match(p,/completo\?supabase\.from\('facturas'\)/);
 assert.match(p,/\{completo&&compra&&<Kpi etiqueta="Importe con IVA"/);
 assert.match(p,/\{completo&&compra&&<tr><th scope="row">Precio unitario estimado/);
 assert.match(p,/\{completo&&i\.orden_id&&/);
 assert.match(p,/\{completo&&i\.factura_id&&/);
 assert.match(p,/\{completo&&<section [^>]*aria-labelledby="ap-origen"/);
 assert.match(p,/\{edita&&compra&&\[[^\]]+\]\.includes\(i\.estado\)&&<p><Link className="boton" href=\{`\/activos\/nuevo/);
 // Historial sin dinero para quien no es completo.
 assert.match(p,/sinDinero\(/);
 // El formulario del responsable va a su propia acción, que solo manda las claves permitidas.
 assert.match(p,/action=\{guardarSeguimiento\}/);
 const a=leer('app/aperturas/acciones.ts');
 // Solo estas 6 claves: la recepción (recibido) sí; cantidad necesaria y precio, no.
 assert.match(a,/CAMPOS_RESPONSABLE=\['estado','inicio','fin','notas','evidencia','recibido'\]/);
 const f=a.slice(a.indexOf('export async function guardarSeguimiento'));
 assert.doesNotMatch(f.slice(0,f.indexOf('\n}')),/precio|orden_id|factura_id|cantidad/);
 // Formulario del responsable en compras: cantidad necesaria como texto, cantidad recibida editable.
 const r=p.slice(p.indexOf('action={guardarSeguimiento}'));const form=r.slice(0,r.indexOf('</form>'));
 assert.match(form,/name="recibido"/);
 assert.match(form,/Cantidad necesaria/);
 assert.doesNotMatch(form,/name="(cantidad|precio|orden_id|factura_id)"/);
});
test('ficha: en el catálogo, «Sin asignar» limpia el texto anterior; el texto anterior se conserva si no se toca',()=>{
 const s=leer('app/aperturas/[id]/items/[item]/SelectorResponsable.tsx'),a=leer('app/aperturas/acciones.ts');
 assert.match(s,/value=\{RESPONSABLE_LEGADO\}/);
 assert.match(a,/RESPONSABLE_LEGADO/);
 // Sin asignar (responsable_id vacío) manda también el texto vacío; la función solo lo respeta en registros de legado.
 assert.match(a,/datos\.responsable_id===''\)datos\.responsable=''/);
});
test('catálogo de responsables: solo admin, con enlace desde la lista de Aperturas',()=>{
 const p=leer('app/aperturas/responsables/page.tsx'),a=leer('app/aperturas/responsables/acciones.ts');
 assert.match(p,/if\(!puedeEditarCompras\(perfil\.rol\)\)redirect\('\/aperturas'\)/);
 assert.match(a,/if\(!puedeEditarCompras\(perfil\.rol\)\)redirect\('\/aperturas'\)/);
 assert.match(a,/rpc\('guardar_responsable_apertura',\{p_id:/);
 assert.match(p,/Externo/);
 assert.match(p,/name="perfil_id"/);
 assert.match(p,/name="activo"/);
 assert.match(leer('app/aperturas/page.tsx'),/puedeEditarCompras\(perfil\.rol\)&&<Link [^>]*href="\/aperturas\/responsables"/);
});
// Revisión final (HD-27): nombres de sucursal, división solo de actividades, marketing fuera del selector, aviso sin catálogo y checklist.
test('nombre de sucursal del responsable: por nombres_aperturas_visibles en lista, detalle y ficha, no por el embebido',()=>{
 const lib=leer('lib/aperturas.ts');
 assert.ok(!columnas(lib,'COLUMNAS_PROYECTO_RESPONSABLE').some(c=>c.includes('sucursales')),'sin sucursales(nombre) embebido');
 assert.match(lib,/export const conNombreSucursal/);
 for(const f of ['app/aperturas/page.tsx','app/aperturas/[id]/page.tsx',FICHA]){
  const p=leer(f);
  assert.match(p,/completo\?Promise\.resolve\(null\):Promise\.resolve\(supabase\.rpc\('nombres_aperturas_visibles'\)/,f);
  assert.match(p,/conNombreSucursal\(/,f);
 }
});
test('dividir: el botón no aparece en equipo ni referencia; las partes solo con responsables activos',()=>{
 const p=leer(FICHA);
 assert.match(p,/hayMigracion&&!compra&&i\.estado!=='no_aplica'&&<div className="acciones ap-dividir"><VentanaDividir /);
 assert.match(p,/activosDividir=\(catalogo\?\?\[\]\)\.filter\(r=>r\.activo\)/);
 assert.match(p,/responsable=\{activosDividir\.some\(o=>o\.id===i\.responsable_id\)\?i\.responsable_id\?\?null:null\}/);
 assert.match(p,/opciones=\{activosDividir\}/);
});
test('catálogo: el selector para ligar no ofrece usuarios de marketing',()=>{
 const p=leer('app/aperturas/responsables/page.tsx');
 assert.match(p,/select\('id,nombre,activo,rol'\)/);
 assert.match(p,/libres=\(usuarios\?\?\[\]\)\.filter\(u=>u\.activo&&u\.rol!=='marketing'&&/);
});
test('lista: el puesto aperturas sin fila en el catálogo recibe el aviso para pedir que lo liguen',()=>{
 const p=leer('app/aperturas/page.tsx');
 assert.match(p,/esAperturas\(perfil\.rol\)&&await Promise\.resolve\(supabase\.rpc\('mi_responsable_id'\)\)/);
 assert.match(p,/Aún no tienes actividades asignadas\. Pide a administración que te ligue en el catálogo de responsables\./);
});
test('checklist: «Abrir la lista con filtros» solo con la vista completa',()=>{
 const c=leer('app/aperturas/ChecklistEditable.tsx');
 assert.match(c,/\{completo&&<Link className="ap-check-mas" href=\{enlace\}>Abrir la lista con filtros<\/Link>\}/);
 assert.match(leer('app/aperturas/Checklist.tsx'),/completo=\{completo\}/);
 assert.match(leer('app/aperturas/[id]/page.tsx'),/<Checklist [^>]*completo=\{completo\}\/>/);
});
