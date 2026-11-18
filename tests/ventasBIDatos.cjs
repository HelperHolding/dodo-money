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
function cliente({ sucursales = { data: ['s1', 's2'], error: null }, actual = vacio, metas = { data: [], error: null } } = {}) {
  const consulta = { select: () => consulta, gte: () => consulta, lte: () => Promise.resolve(metas) };
  return {
    rpc: (nombre) => Promise.resolve(nombre === 'ventas_bi_sucursales' ? sucursales : { data: actual, error: null }),
    from: () => consulta,
  };
}
// calcularPL de prueba: la entrada de cada sucursal ya trae sus renglones.
const datos = (datosPL) => cargar('app/ventas/bi/datos.ts', {
  '@/app/finanzas/datos': { datosPL }, '@/lib/finanzas/pl': { calcularPL: (entrada) => entrada?.renglones ?? [] }, '@/lib/ventas/bi': bi,
});
// P&L de octubre de una sucursal: venta 1000, sin variables, fijos (renta) dados → P.E. mensual = fijos.
const plDe = (id, renta) => ({ id, entrada: { renglones: [{ clave: 'venta_neta', monto: 1000 }, { clave: 'renta', monto: renta }] }, metas: null, ctx: null });
const conVentas = (filas) => ({ ...vacio, pagos_sucursal: filas.map(([sucursal_id, pago, ventas]) => ({ sucursal_id, pago, ventas })) });
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
  const r = await datosBI(cliente({ actual: conVentas([['s1', 'efectivo', 10], ['s2', 'tarjeta', 5]]) }), f, '2026-11-18');
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

// I1: la venta que se compara es la de las sucursales cuyo objetivo cuenta; las que no vendieron no salen en los avisos.
test('medidores: venta solo de las sucursales con P.E. o meta, y avisos sin sucursales sin venta', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [plDe('s1', 300)] }));
  const r = await datosBI(cliente({
    sucursales: { data: ['s1', 's2', 's3'], error: null },
    actual: conVentas([['s1', 'efectivo', 60], ['s1', 'tarjeta', 40], ['s2', 'efectivo', 50]]),
    metas: { data: [{ sucursal_id: 's2', mes: '2026-11-01', monto: 3000 }], error: null },
  }), f, '2026-11-18');
  assert.equal(r.pe.venta, 100); assert.equal(r.pe.objetivo, 100); // 300 al mes × 10/30 días
  assert.deepEqual(r.pe.sinPE, ['s2']);
  assert.equal(r.meta.venta, 50); assert.equal(r.meta.objetivo, 1000);
  assert.deepEqual(r.meta.faltan, [{ sucursal_id: 's1', mes: '2026-11-01' }]);
});
test('medidores: una sucursal sin todas las metas del rango no entra a la meta ni a su venta', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [] }));
  const g = bi.leerFiltrosBI({ desde: '2026-10-22', hasta: '2026-11-10' }, '2026-11-18');
  const r = await datosBI(cliente({ sucursales: { data: ['s1'], error: null }, actual: conVentas([['s1', 'efectivo', 80]]),
    metas: { data: [{ sucursal_id: 's1', mes: '2026-10-01', monto: 3100 }], error: null } }), g, '2026-11-18');
  assert.equal(r.meta.objetivo, null); assert.equal(r.meta.venta, 0);
  assert.deepEqual(r.meta.faltan, [{ sucursal_id: 's1', mes: '2026-11-01' }]);
});
// M3: un P&L cerrado sin costos fijos no es un P.E. de 0.
test('P.E.: sucursal con fijos en 0 va a «sin P.E.»', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [plDe('s1', 0)] }));
  const r = await datosBI(cliente({ sucursales: { data: ['s1'], error: null }, actual: conVentas([['s1', 'efectivo', 10]]) }), f, '2026-11-18');
  assert.deepEqual(r.pe.sinPE, ['s1']); assert.equal(r.pe.objetivo, null);
});
// M1: si ventas_metas no carga, se dice así y no se culpa a cada sucursal.
test('meta: error al leer ventas_metas → error, sin faltantes', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [] }));
  const r = await datosBI(cliente({ actual: conVentas([['s1', 'efectivo', 10]]), metas: { data: null, error: { message: 'x' } } }), f, '2026-11-18');
  assert.equal(r.meta.error, true); assert.deepEqual(r.meta.faltan, []); assert.equal(r.meta.objetivo, null);
  const p = fs.readFileSync('app/ventas/bi/page.tsx', 'utf8');
  assert.match(p, /No se pudieron leer las metas/);
});
// I2: con filtros que parten la venta (canal, día, hora, pago, producto…), P.E. y meta mensuales no son comparables.
test('medidores: con filtros que no son de sucursal, P.E. y meta quedan «Sin dato»', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [plDe('s1', 300)] }));
  const metas = { data: [{ sucursal_id: 's1', mes: '2026-11-01', monto: 3000 }], error: null };
  const base = { sucursales: { data: ['s1'], error: null }, actual: conVentas([['s1', 'efectivo', 100]]), metas };
  for (const cambio of [{ canal: 'pos' }, { origen: ['app'] }, { tipo: ['entrega'] }, { dia: [5] }, { hora: [19, 22] }, { pago: ['efectivo'] }, { cat: ['pizza'] }, { prod: 'pepper' }]) {
    const r = await datosBI(cliente(base), { ...f, ...cambio }, '2026-11-18');
    assert.equal(r.parcial, true, JSON.stringify(cambio));
    assert.equal(r.pe.objetivo, null); assert.equal(r.meta.objetivo, null);
  }
  for (const cambio of [{}, { suc: ['s1'] }, { rfc: 'AAA010101AAA' }, { edad: '24+' }]) {
    const r = await datosBI(cliente(base), { ...f, ...cambio }, '2026-11-18');
    assert.equal(r.parcial, false, JSON.stringify(cambio));
    assert.equal(r.pe.objetivo, 100); assert.equal(r.meta.objetivo, 1000);
  }
  const p = fs.readFileSync('app/ventas/bi/page.tsx', 'utf8');
  assert.match(p, /Con filtros de canal, día, hora, pago, producto… la venta es solo una parte; el P\.E\. y la meta son mensuales completos\./);
});

// M-36 y M5: metas de venta en Parámetros. Vacío no toca; «Copiar mes anterior» llena solo los vacíos; los errores regresan al mes.
function accionMetas() {
  const llamadas = { upsert: [], consultas: [] };
  const anteriores = [{ sucursal_id: 's1', monto: 3000 }];
  const supabase = {
    from: (tabla) => {
      const q = { filtros: {} };
      q.select = () => q; q.eq = (c, v) => { q.filtros[c] = v; return q; }; q.in = (c, v) => { q.filtros[c] = v; return q; };
      q.then = (ok, mal) => { llamadas.consultas.push({ tabla, ...q.filtros });
        return Promise.resolve({ data: anteriores.filter((x) => q.filtros.mes === '2026-10-01' && (q.filtros.sucursal_id ?? []).includes(x.sucursal_id)), error: null }).then(ok, mal); };
      q.upsert = (filas) => { llamadas.upsert.push(...filas); return Promise.resolve({ error: llamadas.fallaUpsert ? { message: 'x' } : null }); };
      return q;
    },
  };
  const { guardarMetasVenta } = cargar('app/finanzas/parametros/acciones.ts', {
    'next/cache': { revalidatePath: () => {} }, '@/lib/formato': { numero: Number },
    '@/lib/contexto': { obtenerPerfil: async () => ({ supabase, perfil: { rol: 'admin', id: 'u1' } }) },
    '@/lib/roles': { puedeEditarFinanzas: () => true, SOLO_CONSULTA: 'Solo consulta' },
    '../servidor': { clienteFinanzas: async () => supabase, volver: (r, c, t) => { throw { url: `${r}${r.includes('?') ? '&' : '?'}${c}=${t}` }; } },
  });
  const correr = async (campos) => { const fd = new FormData(); for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    try { await guardarMetasVenta(fd); } catch (e) { if (e && e.url) return e.url; throw e; } return null; };
  return { correr, llamadas };
}
test('metas de venta: vacío no se toca; «Copiar mes anterior» llena solo los vacíos', async () => {
  const a = accionMetas();
  assert.match(await a.correr({ mes: '2026-11', monto_s1: '', monto_s2: '5000' }), /mes_meta=2026-11&ok=/);
  assert.deepEqual(a.llamadas.upsert.map((x) => [x.sucursal_id, x.monto]), [['s2', 5000]]);
  const b = accionMetas();
  assert.match(await b.correr({ mes: '2026-11', monto_s1: '', monto_s2: '5000', monto_s3: '', copiar: '1' }), /mes_meta=2026-11&ok=/);
  assert.deepEqual(b.llamadas.upsert.map((x) => [x.sucursal_id, x.mes, x.monto]).sort(), [['s1', '2026-11-01', 3000], ['s2', '2026-11-01', 5000]]);
});
test('metas de venta: los errores regresan al mes elegido', async () => {
  const a = accionMetas();
  assert.match(await a.correr({ mes: '2026-11', monto_s1: '-5' }), /^\/finanzas\/parametros\?mes_meta=2026-11&error=/);
  const b = accionMetas(); b.llamadas.fallaUpsert = true;
  assert.match(await b.correr({ mes: '2026-11', monto_s1: '10' }), /^\/finanzas\/parametros\?mes_meta=2026-11&error=/);
});
test('Parámetros: la meta del mes anterior es sugerencia (placeholder), no valor; 0 quita la meta', () => {
  const p = fs.readFileSync('app/finanzas/parametros/page.tsx', 'utf8');
  assert.doesNotMatch(p, /defaultValue=\{actual \? String\(actual\.monto\) : previa/);
  assert.match(p, /placeholder=\{previa \? String\(previa\.monto\) : undefined\}/);
  assert.match(p, /name="copiar" value="1"/); assert.match(p, /Copiar mes anterior/);
  assert.match(p, /Para quitar una meta escribe 0/);
});
test('meta en 0 = sin meta: la sucursal no entra a la meta ni a su venta', async () => {
  const { datosBI } = datos(() => Promise.resolve({ porSucursal: [] }));
  const r = await datosBI(cliente({ actual: conVentas([['s1', 'efectivo', 70], ['s2', 'efectivo', 30]]),
    metas: { data: [{ sucursal_id: 's1', mes: '2026-11-01', monto: 0 }, { sucursal_id: 's2', mes: '2026-11-01', monto: 3000 }], error: null } }), f, '2026-11-18');
  assert.equal(r.meta.venta, 30); assert.equal(r.meta.objetivo, 1000);
  assert.deepEqual(r.meta.faltan, [{ sucursal_id: 's1', mes: '2026-11-01' }]);
});
