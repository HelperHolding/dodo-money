const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function cargar(archivo, nombre) {
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', codigo)((id) => id === '@/lib/formato' ? { pesos: (x) => '$' + Number(x).toFixed(2), porcentaje: (x) => (x * 100).toFixed(1) + ' %' } : require(id), mod, mod.exports);
  return (props) => renderToStaticMarkup(React.createElement(mod.exports[nombre], props));
}
test('medidor: aguja topada al máximo y «Sin dato» sin valor', () => {
  const m = cargar('components/MedidorSemicircular.tsx', 'MedidorSemicircular');
  assert.match(m({ titulo: 'Cumplimiento', valor: 2, maximo: 1, etiqueta: '200 %' }), /200 %/);
  assert.match(m({ titulo: 'Cumplimiento', valor: null, maximo: 1, etiqueta: '' }), /Sin dato/);
});
test('barras horizontales: una fila por clave, apiladas con cat-*', () => {
  const b = cargar('components/BarrasHorizontales.tsx', 'BarrasHorizontales');
  const html = b({ titulo: 'Pago por sucursal', filas: [{ clave: 'a', etiqueta: 'Zapopan-1', valor: 10, detalle: '$10', partes: [{ clave: 'tarjeta', valor: 6 }, { clave: 'efectivo', valor: 4 }] }] });
  assert.match(html, /Zapopan-1/); assert.match(html, /cat-tarjeta/); assert.match(html, /cat-efectivo/);
  assert.match(b({ titulo: 'x', filas: [] }), /Sin datos/);
});
test('barras + línea y líneas por año sin datos no truenan', () => {
  assert.match(cargar('components/BarrasLinea.tsx', 'BarrasLinea')({ titulo: 'Semana', puntos: [] }), /Sin datos/);
  assert.match(cargar('components/LineasAnios.tsx', 'LineasAnios')({ titulo: 'Años', series: [], eje: { desde: 1, hasta: 53, rotulo: String } }), /Sin datos/);
  const html = cargar('components/LineasAnios.tsx', 'LineasAnios')({ titulo: 'Años', series: [{ anio: 2025, valores: { 1: 10, 2: 20 } }, { anio: 2026, valores: { 1: 15 } }], eje: { desde: 1, hasta: 53, rotulo: (n) => `S${n}` } });
  assert.match(html, /2025/); assert.match(html, /2026/);
});
test('barras apiladas: marca.css define colores de forma de pago y fallback del segmento', () => {
  const css = fs.readFileSync('app/marca.css', 'utf8');
  assert.match(css, /\.cat-efectivo\s*\{\s*--cat:\s*var\(--dato-/);
  assert.match(css, /\.cat-tarjeta\s*\{\s*--cat:\s*var\(--dato-/);
  assert.match(css, /\.bi-barras-h-parte\s*\{[^}]*var\(--cat, /);
});
