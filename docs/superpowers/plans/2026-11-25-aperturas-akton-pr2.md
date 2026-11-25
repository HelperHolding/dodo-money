# Aperturas Akton · PR 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las listas (Actividades, Equipo y compras, Validaciones, Atención), el avance por categoría, el Checklist y el Calendario de cada apertura sigan el estilo Akton. Se cierran también los detalles menores que quedaron del PR 1.

**Architecture:** Las reglas nuevas van en `lib/aperturasAkton.ts`, en funciones puras con pruebas:
- `tonoConcepto`: listo, alerta o normal.
- `notasConcepto`: avisos al margen.
- `porEtapa`: agrupación.

Los componentes solo dibujan:
- `ListaConceptos.tsx`: tabla Akton agrupada por etapa.
- `AvanceCategorias.tsx`: tabla Akton.
- `ChecklistEditable.tsx` y `Calendario.tsx`: pasan a grises. Se quitan colores, leyendas de color, el selector «Colorear por» y la ventana «Colores».

**Tech Stack:** Next.js 15 (App Router), TypeScript, CSS global, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-aperturas-akton-design.md` (Parte 2: Listas, Checklist, Calendario) y la lista de minors diferidos del PR 1 (#186).

## Global Constraints

- Color Akton estricto. Verde (`--cuadra`) solo para lo listo y rojo (`--alerta`) solo para lo vencido o bloqueado. Naranja solo para lo destacado. Todo lo demás en negro y grises.
- «Listo» = `marcaItem(i)==='listo'` (incluye equipo instalado). «Vencida» = fin (o inicio si no hay fin) antes de hoy y no lista. Es el mismo criterio de `filasCronograma`.
- Sin migración. `apertura_colores` y `guardar_color_apertura` quedan en la base sin uso. Se borra la acción `guardarColorApertura` de la app.
- En celular (≤ 640 px) las tablas pasan a tarjetas (`.tabla-tarjetas`), sin desplazamiento lateral.
- En `lib/*.ts`, los imports entre módulos llevan `.ts` precedido de `// @ts-expect-error Node strip-types requiere extensión explícita.`.
- Rama `feat/aperturas-akton-2` en el worktree `wt-aperturas-akton-2`. Nada directo a `main`.

## Review Focus

1. **Concepto con solo fecha de inicio pasada y sin fin:** sale vencido en la lista, igual que en el Cronograma (Task 1).
2. **Equipo instalado con fecha pasada:** verde (listo), nunca rojo, en la lista, el Calendario y el Checklist (Task 1).
3. **Lista filtrada sin resultados:** se muestra «Sin conceptos con estos filtros», no una tabla vacía con encabezados sueltos (Task 2).
4. **Responsable sin nombre en el Calendario:** la ficha dice «Sin asignar» con iniciales «—», sin color, y el filtro sigue funcionando (Task 4).
5. **Enlaces viejos con `?color=etapa` o `?color=categoria`:** la página abre sin error e ignora el parámetro (Task 4).

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/aperturasAkton.ts` | Modificar | `tonoConcepto`, `notasConcepto`, `porEtapa` |
| `lib/aperturasAkton.test.ts` | Modificar | Pruebas de lo anterior |
| `app/aperturas/ListaConceptos.tsx` | Crear | Tabla Akton de conceptos agrupada por etapa |
| `app/aperturas/AvanceCategorias.tsx` | Crear | Tabla Akton del avance por categoría |
| `app/aperturas/[id]/page.tsx` | Modificar | Usar las dos tablas; quitar colores del calendario |
| `app/aperturas/ChecklistEditable.tsx` | Modificar | Sin dona; avance en texto |
| `app/aperturas/Calendario.tsx` | Modificar | Tonos por estado, fichas grises y sin ventana Colores |
| `app/aperturas/accionesCalendario.ts` | Modificar | Borrar `guardarColorApertura` |
| `app/aperturas/Gantt.tsx`, `Cronograma.tsx` | Modificar | Minors del PR 1 |
| `app/globals.css` | Modificar | Estilos de tono y fichas grises; borrar lo que quede sin uso |
| `docs/tecnica/panel-aperturas.md` | Modificar | Quitar la mención de colores pastel y DM Sans |

---

### Task 1: Tono, notas y agrupación de conceptos

**Files:**
- Modify: `lib/aperturasAkton.ts`, `lib/aperturasAkton.test.ts`

**Interfaces:**
- Consumes: `marcaItem`, `ETAPAS` (`lib/aperturas.ts`), `rangoItem`, `diasEntre`, `Concepto`.
- Produces:
  - `type TonoConcepto = 'listo'|'alerta'|'normal'`
  - `diasVencido(i: Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'>, hoy: string): number|null`
  - `tonoConcepto(i: Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'>, hoy: string): TonoConcepto`
  - `notasConcepto(i: Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'|'notas'>, hoy: string): string[]`
  - `porEtapa<T extends Pick<Concepto,'etapa'>>(items: T[]): {clave: keyof typeof ETAPAS; nombre: string; items: T[]}[]` (solo etapas con conceptos, en orden P1–P7)

- [ ] **Step 1: Write the failing tests** (agregar al import `diasVencido, notasConcepto, porEtapa, tonoConcepto`)

```ts
test('aperturas akton: tono y días de atraso de un concepto',()=>{
 const hoy='2026-11-24';
 assert.equal(tonoConcepto(c({estado:'completado',fin:'2026-11-01'}),hoy),'listo');
 assert.equal(tonoConcepto(c({tipo:'equipo',estado:'instalado',fin:'2026-11-01'}),hoy),'listo');
 assert.equal(tonoConcepto(c({fin:'2026-11-20'}),hoy),'alerta');
 assert.equal(tonoConcepto(c({inicio:'2026-11-20'}),hoy),'alerta');
 assert.equal(tonoConcepto(c({estado:'bloqueado',fin:'2026-12-20'}),hoy),'alerta');
 assert.equal(tonoConcepto(c({fin:'2026-12-20'}),hoy),'normal');
 assert.equal(tonoConcepto(c({}),hoy),'normal');
 assert.equal(diasVencido(c({fin:'2026-11-20'}),hoy),4);
 assert.equal(diasVencido(c({estado:'verificado',fin:'2026-11-20'}),hoy),null);
 assert.equal(diasVencido(c({estado:'no_aplica',fin:'2026-11-20'}),hoy),null);
});
test('aperturas akton: notas al margen de un concepto',()=>{
 const hoy='2026-11-24';
 assert.deepEqual(notasConcepto(c({fin:'2026-11-23'}),hoy),['Vencida hace 1 día']);
 assert.deepEqual(notasConcepto(c({estado:'bloqueado',notas:'Falta permiso de uso de suelo',fin:'2026-11-20'}),hoy),['Bloqueada: Falta permiso de uso de suelo','Vencida hace 4 días']);
 assert.deepEqual(notasConcepto(c({estado:'bloqueado'}),hoy),['Bloqueada']);
 assert.deepEqual(notasConcepto(c({tipo:'referencia',estado:'por_validar'}),hoy),['Referencia / lista de apoyo']);
 assert.deepEqual(notasConcepto(c({}),hoy),[]);
});
test('aperturas akton: agrupar por etapa en orden y sin etapas vacías',()=>{
 const g=porEtapa([c({id:'a',etapa:'P5'}),c({id:'b',etapa:'P1'}),c({id:'d',etapa:'P5'})]);
 assert.deepEqual(g.map(x=>[x.clave,x.items.map(i=>i.id)]),[['P1',['b']],['P5',['a','d']]]);
 assert.equal(g[0].nombre,'Local y alcance');
});
```

- [ ] **Step 2: Run** `node --experimental-strip-types --test lib/aperturasAkton.test.ts`. Expected: FAIL (`does not provide an export named 'diasVencido'`).

- [ ] **Step 3: Implement** (agregar a `lib/aperturasAkton.ts`). Hazlo después de la definición de `terminada`, y en `filasCronograma` reemplaza el cálculo de `diasVencida` por `diasVencido(item,hoy)` para tener una sola regla:

```ts
export type TonoConcepto = 'listo'|'alerta'|'normal';
// Días que lleva vencido un concepto aplicable y no listo; null si no está vencido.
export function diasVencido(i:Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'>,hoy:string):number|null {
 if(i.estado==='no_aplica'||marcaItem(i)==='listo')return null;
 const r=rangoItem(i);return r&&r.hasta<hoy?diasEntre(r.hasta,hoy):null;
}
export function tonoConcepto(i:Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'>,hoy:string):TonoConcepto {
 if(marcaItem(i)==='listo')return 'listo';
 return i.estado==='bloqueado'||diasVencido(i,hoy)!==null?'alerta':'normal';
}
export function notasConcepto(i:Pick<Concepto,'tipo'|'estado'|'inicio'|'fin'|'notas'>,hoy:string):string[] {
 const n:string[]=[],d=diasVencido(i,hoy);
 if(i.estado==='bloqueado')n.push(i.notas?.trim()?`Bloqueada: ${i.notas.trim()}`:'Bloqueada');
 if(d!==null)n.push(`Vencida hace ${plural(d,'día','días')}`);
 if(i.tipo==='referencia')n.push('Referencia / lista de apoyo');
 return n;
}
export function porEtapa<T extends Pick<Concepto,'etapa'>>(items:T[]) {
 return (Object.keys(ETAPAS) as (keyof typeof ETAPAS)[]).map(clave=>({clave,nombre:ETAPAS[clave],items:items.filter(i=>i.etapa===clave)})).filter(g=>g.items.length>0);
}
```

En `filasCronograma`, el campo `diasVencida` pasa a ser `diasVencida:diasVencido(item,hoy)`, y se borra el helper `terminada` si queda sin uso. `plural` ya existe en el archivo; si está declarado más abajo, súbelo arriba de `diasVencido`.

- [ ] **Step 4: Run** `node --experimental-strip-types --test lib/aperturasAkton.test.ts`. Expected: todas pasan (17).

- [ ] **Step 5: Commit** `feat(aperturas): tono, notas y agrupación de conceptos para las listas Akton`

---

### Task 2: Listas y avance por categoría en tabla Akton

**Files:**
- Create: `app/aperturas/ListaConceptos.tsx`, `app/aperturas/AvanceCategorias.tsx`
- Modify: `app/aperturas/[id]/page.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `porEtapa`, `notasConcepto`, `tonoConcepto` (Task 1); `avanceCategorias`, `CATEGORIAS`, `ESTADOS`, `ItemApertura` (`lib/aperturas.ts`).
- Produces:
  - `ListaConceptos({items, base, hoy, titulo, descripcion?}: {items: ItemApertura[]; base: string; hoy: string; titulo: string; descripcion?: string})`
  - `AvanceCategorias({items, base, activa}: {items: ItemApertura[]; base: string; activa?: string})`

- [ ] **Step 1: Create `ListaConceptos.tsx`**

```tsx
import Link from 'next/link';
import {Fragment} from 'react';
import {CATEGORIAS,ESTADOS,type ItemApertura} from '@/lib/aperturas';
import {notasConcepto,porEtapa,tonoConcepto} from '@/lib/aperturasAkton';
import {fechaTexto} from '@/lib/formato';

// Conceptos en tabla Akton agrupada por etapa. Rojo solo para vencido o bloqueado; verde solo para listo.
export function ListaConceptos({items,base,hoy,titulo,descripcion}:{items:ItemApertura[];base:string;hoy:string;titulo:string;descripcion?:string}) {
 return <section className="akton-tabla-marco" aria-labelledby="ap-lista">
  <h2 id="ap-lista" className="akton-titulo">{titulo} · {items.length}</h2>
  {descripcion&&<p className="akton-subtitulo">{descripcion}</p>}
  {items.length===0?<p className="akton-subtitulo">Sin conceptos con estos filtros.</p>:
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas">
   <thead><tr><th>Concepto</th><th>Estado</th><th>Responsable</th><th>Cantidad / recibido</th><th>Fecha fin</th><th>Notas</th></tr></thead>
   <tbody>{porEtapa(items).map(g=><Fragment key={g.clave}>
    <tr className="akton-seccion"><th colSpan={6}>{g.clave} · {g.nombre} · {g.items.length}</th></tr>
    {g.items.map(i=>{const tono=tonoConcepto(i,hoy);return <tr key={i.id}>
     <td data-label="Concepto"><div style={{minWidth:0}}><Link href={`${base}/items/${i.id}`}>{i.nombre}</Link>
      <small className="ap-lista-sub">{i.clave}{i.categoria?` · ${CATEGORIAS[i.categoria]?.nombre??i.categoria}`:''}</small></div></td>
     <td data-label="Estado"><span className={tono==='listo'?'akton-si':tono==='alerta'&&i.estado==='bloqueado'?'akton-no':undefined}>{ESTADOS[i.estado]}</span></td>
     <td data-label="Responsable">{i.responsable??'Sin asignar'}</td>
     <td data-label="Cantidad / recibido">{i.cantidad??'Por confirmar'} / {i.recibido}{typeof i.original.unidad==='string'?` ${i.original.unidad}`:''}</td>
     <td data-label="Fecha fin" className={`ap-crono-fecha${tono==='alerta'&&i.estado!=='bloqueado'?' akton-no':''}`}>{i.fin?fechaTexto(i.fin):'Sin fecha'}</td>
     <td data-label="Notas" className="akton-nota-celda">{notasConcepto(i,hoy).map(n=><p key={n} className="akton-nota">{n}</p>)}</td>
    </tr>;})}
   </Fragment>)}</tbody>
  </table></div>}
 </section>;
}
```

- [ ] **Step 2: Create `AvanceCategorias.tsx`**

```tsx
import Link from 'next/link';
import {avanceCategorias,type ItemApertura} from '@/lib/aperturas';

// Avance por categoría del plano en tabla Akton; cada nombre filtra la lista de abajo.
export function AvanceCategorias({items,base,activa}:{items:ItemApertura[];base:string;activa?:string}) {
 const filas=avanceCategorias(items);
 return <section className="akton-tabla-marco" aria-labelledby="ap-categorias">
  <h2 id="ap-categorias" className="akton-titulo">Avance por categoría</h2>
  <p className="akton-subtitulo">Equipo instalado o verificado y actividades completadas. No cuenta lo que no aplica ni el equipo por validar. Obra se instala en sitio.</p>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas">
   <thead><tr><th>Categoría</th><th>Conceptos</th><th>Listos</th><th>Avance</th><th>En curso</th><th>Recibidos</th><th>Notas</th></tr></thead>
   <tbody>{filas.map(c=>{const valor=c.clave??'sin',activo=activa===valor;return <tr key={valor} aria-current={activo||undefined}>
    <td data-label="Categoría"><Link href={activo?`${base}?vista=compras`:`${base}?vista=compras&cat=${valor}`}>{c.hoja?`${c.hoja} · `:''}{c.nombre}</Link>{c.obra&&<small className="ap-lista-sub">Obra</small>}</td>
    <td data-label="Conceptos">{c.conceptos}</td><td data-label="Listos">{c.listos}</td>
    <td data-label="Avance">{c.porcentaje===null?'—':`${c.porcentaje} %`}</td>
    <td data-label="En curso">{c.pedidos}</td><td data-label="Recibidos">{c.recibidos}</td>
    <td data-label="Notas" className="akton-nota-celda">{c.bloqueados>0&&<p className="akton-nota">{c.bloqueados} {c.bloqueados===1?'bloqueado':'bloqueados'}</p>}</td>
   </tr>;})}</tbody>
  </table></div>
 </section>;
}
```

- [ ] **Step 3: Wire the page.** En `app/aperturas/[id]/page.tsx`:
  - Importa `ListaConceptos` y `AvanceCategorias`.
  - Reemplaza toda la `<section className="seccion"><h2>Avance por categoría</h2>…</section>` (que solo se ve con `vista==='compras'`) por:
    ```tsx
    <AvanceCategorias items={items} base={`/aperturas/${id}`} activa={f.cat}/>
    ```
  - Reemplaza la `<section className="seccion"><h2>{vista==='alertas'?…` que contiene la `<table className="tabla tabla-tarjetas">` de conceptos por:
    ```tsx
    <ListaConceptos items={visibles} base={`/aperturas/${id}`} hoy={hoy}
      titulo={vista==='alertas'?'Bloqueados y vencidos':vista==='compras'?'Equipo y lista de compra':vista==='tecnico'?'Validaciones técnicas':'Actividades'}
      descripcion={vista==='compras'?'El plano define el equipo. La lista de apertura anterior es referencia: conciliar duplicados y cantidades antes de comprar.':undefined}/>
    ```
  - Envuelve el formulario de filtros, `AvanceCategorias` y `ListaConceptos` en `<div className="akton">…</div>`, para que `--akton-si` y `--akton-no` existan.
  - Si `CATEGORIAS`, `ETAPAS`, `grupoApertura` o `esObra` quedan sin uso, quita su import. `ETAPAS` sigue en uso en el formulario de alta y `CATEGORIAS` en el filtro.
- [ ] **Step 4: CSS.** Agrega `.ap-lista-sub { display:block; color:var(--tinta-2); font-size:.8rem; }` y `.akton-tabla tr[aria-current] td { background:var(--papel-2); }`. Borra `.ap-categorias*` si `grep -rn "ap-categorias" app` ya no encuentra nada. Haz lo mismo con `.ap-estado*`.
- [ ] **Step 5: Run** `npx tsc --noEmit`. Expected: sin errores. **Commit** `feat(aperturas): listas y avance por categoría en tabla Akton`.

---

### Task 3: Checklist en grises

**Files:** Modify `app/aperturas/ChecklistEditable.tsx`, `app/globals.css`

- [ ] **Step 1:** En `ChecklistEditable.tsx`, reemplaza el `<div className="ap-dona" …>…</div>` del encabezado por:
  ```tsx
  <p className="ap-check-general"><strong>{general===null?'—':`${general} %`}</strong><span>avance del checklist</span></p>
  ```
  Conserva `{encabezado}` y la línea de conexión.
- [ ] **Step 2: CSS.**
  - En `.ap-check-marca[data-marca="curso"]`, cambia `var(--ambar)` por `var(--tinta-3)` (borde y color).
  - En `.ap-check-modulo progress`, cambia `accent-color` y el `::-webkit-progress-value` de `var(--cuadra)` a `var(--tinta-2)`.
  - Agrega:
    ```css
    .ap-check-general { display:flex; flex-direction:column; margin:0; }
    .ap-check-general strong { font-size:1.6rem; font-variant-numeric:tabular-nums; }
    .ap-check-general span { color:var(--tinta-2); font-size:.8rem; text-transform:uppercase; letter-spacing:.04em; }
    ```
  - Cambia el punto de «sin conexión» de `var(--ambar)` a `var(--alerta)`.
  - Si `grep -rn "ap-dona" app` queda vacío, borra `.ap-dona*`.
- [ ] **Step 3:** `npx tsc --noEmit`. **Commit** `feat(aperturas): Checklist en grises con estilo Akton`.

---

### Task 4: Calendario sin colores

**Files:** Modify `app/aperturas/Calendario.tsx`, `app/aperturas/accionesCalendario.ts`, `app/aperturas/[id]/page.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `tonoConcepto` (Task 1).
- Produces: `Calendario(props)` sin `grupos` ni `agrupacion`. `Props = {proyecto; items; modo; mes; semana; persona; todos; hoy; edita}`.

- [ ] **Step 1: Component.** En `Calendario.tsx`:
  - Quita `grupos` y `agrupacion` de `Props` y de la firma.
  - Borra `color`, `colorDe`, `usados` y el tipo `{tipo:'colores'}` de `Abierta`.
  - Borra el bloque del selector «Colorear por», el botón «Colores», la función `Colores` y su render en la `Ventana`.
  - Agrega `const tono=(i:ItemCalendario)=>tonoConcepto(i,hoy);`, con `import {tonoConcepto} from '@/lib/aperturasAkton';`.
  - En barras, agenda, fichas del día y tarjetas: cambia `style={{…background:fondo,color:textoSobre(fondo)}}` por solo la posición (`gridColumn`, `gridRow`) y agrega `data-tono={tono(item)}`. Cambia `style={{borderLeftColor:colorDe(i)}}` por `data-tono={tono(i)}`. Quita `data-listo`; ahora lo cubre `data-tono="listo"`.
  - Fichas de persona (`ap-cal-chip`): quita el `style` de color.
  - `porPersona` pasa a ser `modo==='cuadros'`.
  - El `enlace()` ya no manda `color`.
  - Leyenda nueva, en lugar de `ap-cal-leyenda` con colores:
    ```tsx
    <ul className="ap-cal-leyenda" aria-label="Cómo leer el calendario">
     <li><span className="ap-cal-muestra" data-tono="listo"/>Listo</li><li><span className="ap-cal-muestra" data-tono="alerta"/>Vencido o bloqueado</li><li><span className="ap-cal-muestra" data-tono="normal"/>Pendiente o en curso</li>
     {leyendaPersonas.map(p=><li key={p.clave}><span className="ap-cal-chip">{p.iniciales}</span>{p.nombre}</li>)}
    </ul>
    ```
  - Borra los imports que queden sin uso: `claveGrupo`, `textoSobre`, `Grupo`, `Agrupacion` y `guardarColorApertura`.
- [ ] **Step 2: Action.** En `accionesCalendario.ts`, borra `guardarColorApertura` y los imports que solo usaba esa función (`esAgrupacionGuardable`, `esColor`).
- [ ] **Step 3: Page.** En `page.tsx`:
  - Borra la consulta `const colores=…apertura_colores…`.
  - Borra `agrupacion` y los props `grupos=` y `agrupacion=` de `<Calendario>`.
  - Del import de `@/lib/aperturasCalendario`, quita `esAgrupacion`, `gruposCalendario` y `ColorGuardado`.
  - El parámetro `f.color` se ignora; no lo quites del tipo de `searchParams`.
- [ ] **Step 4: CSS.** Agrega:
  ```css
  /* Calendario Akton: gris; verde = listo, rojo = vencido o bloqueado. */
  .ap-cal-tarea { background:var(--papel-2); color:var(--tinta); border:1px solid var(--linea-fuerte); }
  .ap-cal-tarea[data-tono="listo"] { background:var(--cuadra-fondo); color:var(--cuadra-texto); border-color:var(--cuadra); }
  .ap-cal-tarea[data-tono="alerta"] { background:var(--alerta-fondo); color:var(--alerta-texto); border-color:var(--alerta); }
  .ap-cal-agenda li button, .ap-cal-lista li button, .ap-dia-tarjeta { border-left-color:var(--linea-fuerte); }
  [data-tono="listo"].ap-dia-tarjeta, .ap-cal-agenda li button[data-tono="listo"] { border-left-color:var(--cuadra); }
  [data-tono="alerta"].ap-dia-tarjeta, .ap-cal-agenda li button[data-tono="alerta"] { border-left-color:var(--alerta); }
  .ap-cal-chip { background:var(--papel-2); color:var(--tinta); box-shadow:inset 0 0 0 1px var(--linea-fuerte); }
  .ap-cal-muestra { width:14px; height:10px; border-radius:2px; border:1px solid var(--linea-fuerte); background:var(--papel-2); }
  .ap-cal-muestra[data-tono="listo"] { background:var(--cuadra-fondo); border-color:var(--cuadra); }
  .ap-cal-muestra[data-tono="alerta"] { background:var(--alerta-fondo); border-color:var(--alerta); }
  ```
  Borra `.ap-cal-tarea[data-listo]`, `.ap-cal-colores*` y `.ap-cal-selector*` si ya no se usan. En `.ap-cal-leyenda span`, deja el ancho y alto solo para `.ap-cal-muestra`.
- [ ] **Step 5:** `npx tsc --noEmit && npm test`. Expected: sin errores; `fail 0`. Si una prueba de `aperturasCalendario` usa `gruposCalendario` o `textoSobre`, esas funciones siguen exportadas; no las borres en este PR. **Commit** `feat(aperturas): Calendario sin colores, con tonos de estado y fichas grises`.

---

### Task 5: Minors diferidos del PR 1

**Files:** `app/globals.css`, `app/aperturas/Cronograma.tsx`, `app/aperturas/Gantt.tsx`, `lib/aperturasAkton.ts` (+ prueba), `docs/tecnica/panel-aperturas.md`

- [ ] **Step 1: Test first (doble conteo).** Agrega a `lib/aperturasAkton.test.ts`:
  ```ts
  test('aperturas akton: vencida y bloqueada a la vez cuenta una sola vez en el título',()=>{
   const items=[it({id:'a',estado:'bloqueado',fin:'2026-11-20'})];
   const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},items,'2026-11-24'),filasCronograma(items,'2026-11-24'));
   assert.equal(l.find(x=>/vencida|bloqueada/.test(x.titulo))!.titulo,'1 tarea vencida (1 también bloqueada)');
  });
  ```
  Corre la prueba y confirma que falla. Implementa en `lecturaApertura`:
  - `soloBloq` = bloqueadas cuyo `id` no está en vencidas; `ambas` = bloqueadas que sí están.
  - Título: partes `[vencidas: plural('tarea vencida','tareas vencidas'), soloBloq: plural('bloqueada','bloqueadas')]` unidas con « y ».
  - Si `ambas>0`, agrega ` (${ambas} también ${ambas===1?'bloqueada':'bloqueadas'})`.
  - Ajusta la prueba existente «11 tareas vencidas y 1 bloqueada» a `'11 tareas vencidas (1 también bloqueada)'`, porque Licencia está vencida y bloqueada.
- [ ] **Step 2: Total con fechas.** En `Cronograma.tsx`, en la fila Total:
  - Inicio = `filas.map(f=>f.desde).filter(Boolean).sort()[0]`.
  - Fin = `filas.map(f=>f.hasta).filter(Boolean).sort().at(-1)`.
  - Formato `corta()`, o «—» si no hay.
  - Las celdas de fecha llevan `className="ap-crono-fecha"`.
- [ ] **Step 3: CSS.**
  - `.ap-crono-tabla tr.akton-subtotal` usa `var(--akton-durazno)`.
  - `.ap-gantt-barra > span`: `color:var(--tinta); mix-blend-mode:normal; text-shadow:0 0 2px var(--superficie), 0 0 2px var(--superficie);`.
  - `.ap-gantt-asignar summary`: `color:var(--tinta-2)`.
  - Borra `.ap-roadmap*` y `.ap-panel*` si `grep -rn "ap-roadmap\|ap-panel" app components` no encuentra nada.
- [ ] **Step 4: Restos.** En `Gantt.tsx`, corrige la sangría del `</div>` y cambia `ap-gantt-cabecera` por un `<div>` sin clase.
- [ ] **Step 5: Docs.** En `docs/tecnica/panel-aperturas.md`, en la sección del Gantt y la del Calendario:
  - Los colores son grises con tonos de estado (verde listo, rojo vencido o bloqueado).
  - No hay colores por etapa, por categoría ni por responsable, ni letra propia.
  - La pestaña se llama Cronograma.
  - Remite a `docs/diseno/estilo-akton.md`.
- [ ] **Step 6:** `node --experimental-strip-types --test lib/aperturasAkton.test.ts && npx tsc --noEmit`. **Commit** `fix(aperturas): detalles del PR 1 (doble conteo, total con fechas, textos y restos)`.

---

### Task 6: Revisión visual, revisión final y PR

- [ ] **Step 1:** Página temporal `app/login/prueba-akton/page.tsx` y `.env.local` (no se suben), con ~20 conceptos de ejemplo. Renderiza, dentro de `.akton`:
  - `ListaConceptos`
  - `AvanceCategorias`
  - `Checklist` (vía `ChecklistEditable` con `edita={false}`; si necesita Supabase en el navegador y truena con la URL falsa, revisa solo la lista y anótalo)
  - `Calendario` en modos barras, semana y cuadros

  Arranca con `preview_start`, entrada `aperturas-akton` apuntada a `wt-aperturas-akton-2`. Revisa a 1300, 800 y 375 px:
  - Sin desplazamiento lateral.
  - Verde solo en lo listo y rojo solo en lo vencido o bloqueado.
  - Fichas de persona grises con iniciales.
  - Sin selector de color ni botón Colores.
- [ ] **Step 2:** Borra lo temporal y `.next`. Corre `npx tsc --noEmit && npm test`.
- [ ] **Step 3:** Revisión final de toda la rama con un revisor nuevo (modelo más capaz), con el Review Focus de este plan. Corrige lo Critical/Important con prueba en rojo y luego en verde.
- [ ] **Step 4:** Integra `origin/main` si avanzó. Sube la rama y abre el PR a `main`, con resumen, verificación y la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Espera `Historial válido` y `Pruebas y tipos`. No integres sin el visto bueno de Sebastián.
