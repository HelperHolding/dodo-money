import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia de la portada de Aperturas: tarjetas compactas que son el enlace, con cuenta regresiva y avance.
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('la portada muestra una tarjeta enlace por sucursal, sin el botón repetido', () => {
  const p = leer('app/aperturas/page.tsx');
  assert.match(p, /className="ap-portada"/);
  assert.match(p, /<Link key=\{p\.id\} href=\{`\/aperturas\/\$\{p\.id\}`\} className="ap-tarjeta"/);
  assert.doesNotMatch(p, /Abrir proyecto/);
  assert.match(p, /cuentaRegresiva\(/);
  assert.match(p, /avancePorProyecto\(/);
  assert.match(p, /ordenarProyectos\(/);
  assert.match(p, /<progress /);
});
test('los estilos de la portada usan tokens y resaltan solo el borde', () => {
  const css = leer('app/marca.css');
  assert.match(css, /\.ap-tarjeta \{[^}]*border: 1px solid var\(--linea\)/);
  assert.match(css, /\.ap-tarjeta:hover[^{]*\{ border-color: var\(--accion\); \}/);
});

test('cada tarjeta muestra el porcentaje de avance junto a la barra', () => {
  const p = leer('app/aperturas/page.tsx');
  // El % sale de avancePorProyecto (global ponderado por bloque), con lo que necesita para repartir por bloque.
  assert.match(p, /a\.porcentaje/);
  assert.match(p, /select\('proyecto_id,tipo,etapa,estado,categoria'\)/);
  assert.match(p, /partidas listas/);
  assert.doesNotMatch(p, /porcentajeAvance/);
  assert.match(p, /className="ap-tarjeta-porcentaje"/);
  assert.match(leer('app/marca.css'), /\.ap-tarjeta-porcentaje \{/);
});
