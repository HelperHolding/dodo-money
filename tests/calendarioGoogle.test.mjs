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

// Revisión final.
test('el mini mes sigue a la vista y ?resp= se aplica una sola vez', () => {
  const c = leer('app/aperturas/Calendario.tsx');
  assert.match(c, /<PanelCalendario key=\{modo==='semana'\?semana:mes\}/);
  assert.match(c, /respAplicado/);
});
test('sin tareas en el periodo, la vista lo dice también en computadora', () => {
  const c = leer('app/aperturas/Calendario.tsx');
  assert.match(c, /delPeriodo\.length===0&&<p className="ap-nota ap-gcal-vacio">Sin tareas programadas/);
});
test('el cajón del panel se cierra con Esc y al elegir qué mostrar; contraste de noche', () => {
  const c = leer('app/aperturas/Calendario.tsx');
  assert.match(c, /e\.key==='Escape'\)setCajon\(false\)/);
  assert.match(leer('app/aperturas/PanelCalendario.tsx'), /onClick=\{alElegir\}/);
  assert.match(leer('app/globals.css'), /html\[data-luz="noche"\] :is\(\.ap-gcal-evento[^}]*filter:brightness\(\.9\)/);
});
test('al cambiar de mes, la semana queda en la de hoy si es el mes actual', () => {
  assert.match(leer('app/aperturas/Calendario.tsx'), /semanaDe\(m===hoy\.slice\(0,7\)\?hoy:`\$\{m\}-01`\)/);
});
