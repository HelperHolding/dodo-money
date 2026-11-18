const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
// Transpila un .ts a CommonJS y resuelve sus imports con el mapa dado (o con otro .ts transpilado).
function cargar(archivo, mapa = {}) {
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', codigo)((id) => (id in mapa ? mapa[id] : require(id)), mod, mod.exports);
  return mod.exports;
}
const bi = cargar('lib/ventas/bi.ts', { './rappiProductos.ts': cargar('lib/ventas/rappiProductos.ts') });
const vacio = { kpis: { ventas: 0, tickets: 0, productos: 0 } };
function cliente({ sucursales = { data: ['s1', 's2'], error: null } } = {}) {
  const consulta = { select: () => consulta, gte: () => consulta, lte: () => Promise.resolve({ data: [], error: null }) };
  return {
    rpc: (nombre) => Promise.resolve(nombre === 'ventas_bi_sucursales' ? sucursales : { data: vacio, error: null }),
    from: () => consulta,
  };
}
const datos = (datosPL) => cargar('app/ventas/bi/datos.ts', {
  '@/app/finanzas/datos': { datosPL }, '@/lib/finanzas/pl': { calcularPL: () => [] }, '@/lib/ventas/bi': bi,
});
const f = bi.leerFiltrosBI({ desde: '2026-11-01', hasta: '2026-11-10' }, '2026-11-18');

test('si el P&L no carga, P.E. marca error y no culpa a cada sucursal', async () => {
  const { datosBI } = datos(() => Promise.reject(new Error('caída')));
  const r = await datosBI(cliente(), f, '2026-11-18');
  assert.equal(r.pe.error, true);
  assert.deepEqual(r.pe.sinPE, []);
  assert.equal(r.pe.monto, 0);
  assert.equal(r.pe.mesCerrado, '2026-10');
});
test('con el P&L cargado, sin P.E. lista las sucursales sin dato y no hay error', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [] }));
  const r = await datosBI(cliente(), f, '2026-11-18');
  assert.equal(r.pe.error, false);
  assert.deepEqual(r.pe.sinPE, ['s1', 's2']);
});
test('si ventas_bi_sucursales falla, datosBI lanza en lugar de perder razón social y antigüedad', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [] }));
  await assert.rejects(datosBI(cliente({ sucursales: { data: null, error: { message: 'x' } } }), { ...f, rfc: 'AAA010101AAA' }, '2026-11-18'));
});
test('la página dice que el P&L no se pudo calcular en lugar de listar sucursales', () => {
  const p = fs.readFileSync('app/ventas/bi/page.tsx', 'utf8');
  assert.match(p, /pe\.error/);
  assert.match(p, /No se pudo calcular el P&L de/);
});
