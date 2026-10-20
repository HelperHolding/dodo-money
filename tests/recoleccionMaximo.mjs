// Ejecutar con un URL de módulo PGlite instalado como argumento, sin conectarse a producción.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.argv[2] ?? '@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec(fs.readFileSync('tests/recoleccion-maximo-fixture.sql','utf8'));
 const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_recoleccion_efectivo_acumulado.sql'));
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 for(const [data,want] of [
  [{saldo:26868.26,fondo:4500,reservado:0,salidas:0,disponible:22368.26},22368.26],
  [{saldo:26868.26,fondo:4500,reservado:3000,salidas:10000,disponible:22368.26},9368.26],
  [{saldo:4000,fondo:4500,reservado:0,salidas:0,disponible:0},0],
 ]) {
  await db.query("select set_config('test.disponibilidad', $1, false)",[JSON.stringify(data)]);
  const {rows}=await db.query('select public.vista_recoleccion(public.mi_sucursal(),current_date,current_date) as exp');
  assert.equal(rows[0].exp.maximo,want);
  assert.equal(rows[0].exp.incremento_periodo,0);
  assert.equal(rows[0].exp.base_maximo,'disponibilidad_actual');
 }
 console.log('SQL real: 3 escenarios aprobados (acumulado, reservas y pendientes, sin disponible)');
} finally { await db.close(); }
