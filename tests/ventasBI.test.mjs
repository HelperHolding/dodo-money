import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const load = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/^﻿/, '');
const migracion = load('supabase/migrations/20261118200000_ventas_bi.sql');
const prueba = load('supabase/pruebas/20261118200000_ventas_bi.sql');
const CORP = 'aaaaaaaa-0000-0000-0000-000000000001', GERENTE = 'aaaaaaaa-0000-0000-0000-000000000002', ADMIN = 'aaaaaaaa-0000-0000-0000-000000000003';
const S1 = '11111111-0000-0000-0000-000000000001';

async function nueva() { const db = new PGlite(); await db.exec(prueba); await db.exec(migracion); return db; }
async function como(db, uid) { await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}"}', false);`); }
const bi = async (db, p) => (await db.query('select public.ventas_bi($1::jsonb) as r', [JSON.stringify({ desde: '2026-11-16', hasta: '2026-11-22', ...p })])).rows[0].r;
const num = (x) => Number(x);

test('ventas BI: KPIs sin filtros, canales y exclusiones (personal, cancelado, Rappi cancelado)', async () => {
  const db = await nueva(); await como(db, CORP);
  const r = await bi(db, {});
  assert.equal(num(r.kpis.ventas), 400); assert.equal(num(r.kpis.tickets), 3); assert.equal(num(r.kpis.productos), 4);
  const c = Object.fromEntries(r.canales.map((x) => [x.canal, num(x.ventas)]));
  assert.deepEqual(c, { pos: 300, rappi: 100 });
  assert.equal(r.origenes.find((x) => x.origen === 'agregador').tickets, 1);
});

test('ventas BI: filtros de categoría (solo líneas, sin Rappi), producto, pago, día, hora', async () => {
  const db = await nueva(); await como(db, CORP);
  const cat = await bi(db, { categorias: ['bebida'] });
  assert.equal(num(cat.kpis.ventas), 20); assert.equal(num(cat.kpis.tickets), 1); assert.equal(num(cat.kpis.productos), 1);
  const prod = await bi(db, { producto: 'pepper' });
  assert.equal(num(prod.kpis.ventas), 280); assert.equal(num(prod.kpis.tickets), 2);
  assert.equal(num((await bi(db, { pagos: ['rappi'] })).kpis.ventas), 100);
  assert.equal(num((await bi(db, { dias: [1] })).kpis.ventas), 200);
  assert.equal(num((await bi(db, { hora_desde: 19, hora_hasta: 22 })).kpis.ventas), 300);
});

test('ventas BI: razón social y antigüedad filtran sucursales', async () => {
  const db = await nueva(); await como(db, CORP);
  assert.equal(num((await bi(db, { rfc: 'HEL0101011A1' })).kpis.ventas), 300);
  assert.equal(num((await bi(db, { edad_min: 12 })).kpis.ventas), 300);
  assert.equal(num((await bi(db, { edad_min: 0, edad_max: 6 })).kpis.ventas), 100);
});

test('ventas BI: listas en null (como las manda la app) no truenan', async () => {
  const db = await nueva(); await como(db, CORP);
  const r = await bi(db, { sucursales: null, rfc: null, edad_min: null, edad_max: null, canal: null, origenes: null, tipos: null, dias: null, hora_desde: null, hora_hasta: null, categorias: null, producto: null, pagos: null });
  assert.equal(num(r.kpis.ventas), 400);
});

test('ventas BI: sin pedidos devuelve ceros y listas vacías', async () => {
  const db = await nueva(); await como(db, CORP);
  const r = await bi(db, { desde: '2020-01-01', hasta: '2020-01-02' });
  assert.equal(num(r.kpis.ventas), 0); assert.equal(num(r.kpis.tickets), 0);
  assert.deepEqual(r.canales, []); assert.deepEqual(r.productos, []);
});

test('ventas BI: gerente no entra; rango inválido falla', async () => {
  const db = await nueva(); await como(db, GERENTE);
  await assert.rejects(bi(db, {}), /Solo admin y corporativo/);
  await como(db, CORP);
  await assert.rejects(bi(db, { desde: '2026-11-22', hasta: '2026-11-16' }), /Rango de fechas/);
});

test('histórico: semanas ISO y meses por año, Dodo + Rappi', async () => {
  const db = await nueva(); await como(db, CORP);
  const h = (await db.query(`select public.ventas_bi_historico('{}'::jsonb) as r`)).rows[0].r;
  const m = Object.fromEntries(h.meses.map((x) => [`${x.anio}-${x.mes}`, num(x.ventas)]));
  assert.equal(m['2025-11'], 1000); assert.equal(m['2026-11'], 400);
  const s = Object.fromEntries(h.semanas.map((x) => [`${x.anio}-${x.semana}`, num(x.ventas)]));
  assert.equal(s['2025-47'], 1000); assert.equal(s['2026-47'], 400);
});

test('metas de venta: admin escribe, corporativo solo lee', async () => {
  const db = await nueva(); await como(db, ADMIN);
  await db.query(`insert into public.ventas_metas(sucursal_id, mes, monto) values ($1, '2026-11-01', 300000)`, [S1]);
  await assert.rejects(db.query(`insert into public.ventas_metas(sucursal_id, mes, monto) values ($1, '2026-11-15', 1)`, [S1]));
  await como(db, CORP);
  assert.equal((await db.query('select count(*)::int n from public.ventas_metas')).rows[0].n, 1);
  await assert.rejects(db.query(`update public.ventas_metas set monto = 1`).then((r) => { if (!r.affectedRows) throw new Error('sin permiso'); }));
});
