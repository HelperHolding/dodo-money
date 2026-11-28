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
test('lista: barra de avance con avanceApertura, días que faltan y «Tu avance» para el responsable',()=>{
 const p=leer('app/aperturas/page.tsx');
 assert.match(p,/import \{[^}]*avanceApertura[^}]*\} from '@\/lib\/aperturas'/);
 assert.match(p,/avanceApertura\(/);
 assert.match(p,/<progress /);
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
