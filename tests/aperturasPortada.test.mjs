import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia de la portada de Aperturas: tarjetas que son el enlace, con días para abrir y avance contra lo esperado (estilo Akton).
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('la portada muestra una tarjeta enlace por sucursal, sin el botón repetido', () => {
  const p = leer('app/aperturas/page.tsx');
  assert.match(p, /className="ap-portada"/);
  assert.match(p, /<Link key=\{p\.id\} href=\{`\/aperturas\/\$\{p\.id\}`\} className="ap-tarjeta ap-tarjeta-akton"/);
  assert.doesNotMatch(p, /Abrir proyecto/);
  assert.match(p, /resumenPortada\(/);
  assert.match(p, /textoDiasApertura\(/);
  assert.match(p, /ordenarProyectos\(/);
});
test('los estilos de la portada usan tokens y resaltan solo el borde', () => {
  const css = leer('app/marca.css');
  assert.match(css, /\.ap-tarjeta \{[^}]*border: 1px solid var\(--linea\)/);
  assert.match(css, /\.ap-tarjeta:hover[^{]*\{ border-color: var\(--accion\); \}/);
});

test('cada tarjeta muestra el avance contra lo esperado, con estilo Akton', () => {
  const p = leer('app/aperturas/page.tsx');
  // El % es el global ponderado por bloque (resumenPortada → avanceComparado → avanceApertura): la consulta trae la categoría.
  assert.match(p, /select\('id,proyecto_id,nombre,tipo,etapa,estado,categoria,inicio,fin,responsable,notas'\)/);
  assert.doesNotMatch(p, /porcentajeAvance|avanceGeneral/);
  assert.match(p, /<div className="akton">/);
  assert.match(p, /con fecha \$\{a\.realConFecha\} % vs \$\{a\.esperado\} % esperado/);
  assert.match(p, /esperado sin fechas/);
  assert.match(p, /className="akton-var" data-favorable=/);
  assert.match(leer('app/globals.css'), /\.ap-tarjeta\.ap-tarjeta-akton \{/);
});

// Revisión final del PR 3.
test('si falla la consulta de avance, la portada no inventa vencidas ni atrasadas', () => {
  const p = leer('app/aperturas/page.tsx');
  assert.match(p, /const sinAvance=items===null/);
  assert.match(p, /sinAvance\?'—':r\.atrasados/);
  assert.match(p, /Sin dato de avance/);
});
test('la inversión de la portada dice de cuántas fuentes sale y no muestra $0 sin fuentes', () => {
  const p = leer('app/aperturas/page.tsx');
  assert.match(p, /Total de \{inversion\.fuentes===1/);
  assert.match(p, /inversion===null\|\|inversion\.fuentes===0\?'—'/);
});
test('en celular los valores largos de la franja se acomodan sin salirse', () => {
  assert.match(leer('app/globals.css'), /@media \(max-width:640px\) \{ \.akton-kpi-valor \{ font-size:clamp\(\.9rem,4\.2vw,1\.15rem\); overflow-wrap:anywhere; \} \}/);
});
test('el importe del detalle es solo para compras y dice que es con IVA; el historial no llama alta a otros cambios', () => {
  const d = leer('app/aperturas/[id]/items/[item]/page.tsx');
  // Solo compras, y solo para quien ve compras (el responsable no ve importes, HD-27).
  assert.match(d, /\{completo&&compra&&<Kpi etiqueta="Importe con IVA"/);
  assert.match(leer('app/aperturas/Historial.tsx'), /Sin cambios en campos visibles/);
});

// Revisión final HD-12: el avance que compara la variación se rotula «con fecha» junto al avance global.
test('el cronograma muestra la columna «Con fecha» que usa la variación, en etapas y en el total', () => {
  const c = leer('app/aperturas/Cronograma.tsx');
  assert.match(c, /<th>Avance<\/th><th>Con fecha<\/th><th>Esperado<\/th>/);
  assert.match(c, /data-label="Con fecha">\{pct\(f\.avance\.realConFecha\)\}/);
  assert.match(c, /data-label="Con fecha">\{pct\(total\.realConFecha\)\}/);
});
// Limpieza de detalles menores.
test('el detalle de tarea no repite avisos y nombra bien la fecha', () => {
  const d = leer('app/aperturas/[id]/items/[item]/page.tsx');
  assert.doesNotMatch(d, /notasConcepto\(/);
  assert.match(d, /i\.fin\?'Fin previsto':'Inicio previsto'/);
});
test('Inversión no repite el número de clasificaciones en dos indicadores', () => {
  assert.doesNotMatch(leer('app/aperturas/inversion/page.tsx'), /pie=\{`En \$\{a\.grupos\.length\}/);
});
test('sin CSS de la tarjeta vieja de la portada', () => {
  assert.doesNotMatch(leer('app/marca.css'), /\.ap-tarjeta-(avance|barra|porcentaje|nombre)|\.ap-tarjeta progress/);
});
