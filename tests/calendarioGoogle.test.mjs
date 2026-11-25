import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia del Calendario de aperturas estilo Google Calendar.
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('el calendario usa panel, Mes y Semana estilo Google, sin Cuadros', () => {
  const c = leer('app/aperturas/Calendario.tsx');
  for (const p of ['PanelCalendario', 'VistaMes', 'VistaSemana', 'TarjetaDia', 'nombreEstado(']) assert.ok(c.includes(p), p);
  assert.doesNotMatch(c, /function Cuadros|modo==='cuadros'|modo==='barras'/);
  assert.match(c, /Ocultaste a todos los responsables/);
  assert.match(c, /calOcultos:\$\{proyecto\}/);
  assert.match(c, /localStorage\.setItem\('calPanel'/);
  assert.match(leer('app/aperturas/[id]/page.tsx'), /modoCalendario\(f\.modo\)/);
  assert.match(leer('docs/diseno/estilo-akton.md'), /Calendario de aperturas[^\n]*color por responsable/);
});
