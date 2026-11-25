# Aperturas Akton · PR 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar al estilo Akton la portada de Aperturas, el detalle de cada tarea, el historial, la página de Inversión y el corte de presupuesto. También se cierran los detalles menores que quedaron del PR 2.

**Architecture:** La lógica va en funciones puras con pruebas. `resumenPortada` va en `lib/aperturasAkton.ts` y `analisisInversion` en `lib/inversionApertura.ts`. Las páginas solo dibujan, con `.akton`, `.akton-kpis`, `.akton-lectura` y `.akton-tabla`, y reutilizan `Kpi`, `LecturaProyecto`, `textoDiasApertura`, `avanceComparado` y `filasCronograma`.

**Tech Stack:** Next.js 15, TypeScript, CSS global, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-aperturas-akton-design.md` (Parte 3).

## Global Constraints

- Color Akton estricto:
  - Naranja solo para lo destacado (próxima apertura, días) y las alertas.
  - Verde y rojo solo para va bien / va mal (avance contra esperado, vencidas o bloqueadas, cuadre).
  - Lo demás en negro y grises. Los enlaces de las tablas van en negro (`.ap-tabla`).
- «Vencido» y «listo» usan el mismo criterio del PR 2 (`diasVencido`, `tonoConcepto`, `marcaItem`).
- Montos con `pesos()`. Sin migración. En celular, tarjetas (`.tabla-tarjetas`) y sin desplazamiento lateral.
- Rama `feat/aperturas-akton-3`, worktree `wt-aperturas-akton-3`. Nada directo a `main`.

## Decisión que cambia el spec (para confirmar al revisar el plan)

El spec pedía en Inversión «Presupuesto · % ejercido · Var.». Pero Inversión no tiene presupuesto propio. El único es el del proyecto (`apertura_proyectos.presupuesto`), capturado **con IVA**, y no hay forma de saber si los movimientos de Inversión vienen con o sin IVA. Para no mostrar un % engañoso, **este plan no compara Inversión contra presupuesto**. En su lugar:

- **Franja:** Inversión registrada · Movimientos · Clasificaciones · Cuadre con la fuente (verde si coincide, rojo si no).
- **Lectura:** las 3 clasificaciones con más inversión y su % del total. Si no cuadra con la fuente, la diferencia.
- **Tabla:** una sección por clasificación con su subtotal, y sus movimientos dentro.

La comparación contra el presupuesto ya vive en el **corte de presupuesto** del proyecto (adquirido, cotizado y supuesto contra el total sin IVA) y en el CAPEX de Finanzas.

El resumen CAPEX (`app/finanzas/capex/ResumenCapexApertura.tsx`) es un componente de Finanzas que también se usa allá, así que **no se toca** en este PR.

## Review Focus

1. **Portada con un proyecto sin conceptos o sin fechas:** la tarjeta muestra «—» y «Sin fechas», sin tono, y la franja no cuenta ese proyecto como atrasado (Task 1).
2. **Portada sin proyectos por venir** (todos pasaron): «Próxima apertura» dice «Ninguna programada», sin naranja (Task 1).
3. **Tarea con solo fecha de inicio pasada:** el detalle dice «Vencida hace N días» con la misma fecha que la lista (Task 3).
4. **Inversión cuyo detalle no cuadra con el total de la fuente:** cuadre en rojo con la diferencia, y la lectura lo menciona (Task 1 y Task 4).
5. **Historial con un cambio de un campo desconocido o con valores vacíos:** se muestra el campo crudo y «—», sin romper la tabla (Task 3).

---

### Task 1: Lógica de portada, inversión y título de bloqueadas

**Files:** `lib/aperturasAkton.ts`, `lib/aperturasAkton.test.ts`, `lib/inversionApertura.ts`, `lib/inversionApertura.test.ts`

**Interfaces:**
- Produces:
  - `type TarjetaPortada = {id:string; dias:DiasApertura; avance:Avance; vencidas:number; bloqueadas:number}`
  - `resumenPortada(proyectos: Pick<ProyectoApertura,'id'|'objetivo_hasta'>[], items: (Concepto & {proyecto_id:string})[], hoy:string): {tarjetas: Record<string,TarjetaPortada>; enCurso:number; proxima:{id:string;dias:number}|null; atrasados:number}`
    - `enCurso`: proyectos cuyo `dias.tipo` no es `'abierta'`.
    - `proxima`: el de menos días con `tipo==='faltan'` o `'hoy'` (`dias` = 0 si es hoy).
    - `atrasados`: proyectos con `avance.favorable==='no'`.
  - `type AnalisisInversion = {total:number; movimientos:number; grupos:{tipo:string; monto:number; pct:number; detalles:DetalleInversion[]}[]; diferencia:number; cuadra:boolean; lectura:{titulo:string;texto:string}[]}`
  - `analisisInversion(detalles: DetalleInversion[], totalFuente:number): AnalisisInversion`
    - Grupos ordenados por monto descendente; `pct` entero del total.
    - `diferencia = total − totalFuente`, redondeada a centavos; `cuadra = |diferencia| ≤ 0.01`.
    - Lectura 1, si hay grupos: título «Donde más se invirtió: {tipo}», texto «{tipo} {pesos} ({pct} %), {tipo2} …» con hasta 3 grupos.
    - Lectura 2, si no cuadra: título «El detalle no cuadra con la fuente», texto «El detalle suma {pesos(total)} y la fuente {pesos(totalFuente)}: diferencia de {pesos(|dif|)}.».
- Minor del PR 2: en `lecturaApertura`, sin vencidas el título de bloqueadas pasa a ser `plural(soloBloq,'tarea bloqueada','tareas bloqueadas')`.

- [ ] **Step 1: Failing tests.**

`lib/aperturasAkton.test.ts` (agrega `resumenPortada` al import):

```ts
test('aperturas akton: resumen de la portada',()=>{
 const hoy='2026-11-24';
 const r=resumenPortada([{id:'a',objetivo_hasta:'2026-12-04'},{id:'b',objetivo_hasta:'2026-11-30'},{id:'c',objetivo_hasta:'2026-10-01'},{id:'d',objetivo_hasta:'2027-01-10'}],[
  {...c({id:'1',inicio:'2026-11-01',fin:'2026-11-10'}),proyecto_id:'a'},                       // vencida: a atrasado
  {...c({id:'2',estado:'completado',inicio:'2026-11-01',fin:'2026-11-10'}),proyecto_id:'b'},   // al día
  {...c({id:'3',estado:'completado'}),proyecto_id:'c'},                                         // todo listo y pasado: abierta
 ],hoy);
 assert.equal(r.tarjetas.a.vencidas,1);assert.equal(r.tarjetas.a.avance.favorable,'no');
 assert.deepEqual(r.tarjetas.c.dias,{tipo:'abierta',dias:54});
 assert.equal(r.tarjetas.d.avance.real,null);assert.equal(r.tarjetas.d.avance.favorable,null);
 assert.equal(r.enCurso,3);assert.deepEqual(r.proxima,{id:'b',dias:6});assert.equal(r.atrasados,1);
 assert.equal(resumenPortada([{id:'c',objetivo_hasta:'2026-10-01'}],[],hoy).proxima,null);
});
test('aperturas akton: solo bloqueadas lleva sustantivo',()=>{
 const items=[it({id:'a',estado:'bloqueado'}),it({id:'b',estado:'bloqueado'})];
 const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},items,'2026-11-24'),filasCronograma(items,'2026-11-24'));
 assert.equal(l.find(x=>/bloquead/.test(x.titulo))!.titulo,'2 tareas bloqueadas');
});
```

En la prueba existente «títulos de vencidas y bloqueadas sin traslape», cambia el texto esperado `'2 bloqueadas'` por `'2 tareas bloqueadas'`.

`lib/inversionApertura.test.ts` (créalo si no existe y agrégalo al script `test` de `package.json`):

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analisisInversion,type DetalleInversion} from './inversionApertura.ts';
const d=(id:string,tipo:string,monto:number):DetalleInversion=>({id,mayor:'M',fecha:'2026-10-01',proveedor:'P',concepto:'C',tipo,categoria:'K',monto,fuente:'F',nota:null});
test('inversión: grupos ordenados, porcentajes y lectura',()=>{
 const a=analisisInversion([d('1','Obra',600),d('2','Equipo',300),d('3','Obra',100),d('4','Mobiliario',0.5)],1000.5);
 assert.deepEqual(a.grupos.map(g=>[g.tipo,g.monto,g.pct]),[['Obra',700,70],['Equipo',300,30],['Mobiliario',0.5,0]]);
 assert.equal(a.total,1000.5);assert.equal(a.movimientos,4);assert.equal(a.cuadra,true);
 assert.equal(a.lectura.length,1);assert.equal(a.lectura[0].titulo,'Donde más se invirtió: Obra');
 assert.match(a.lectura[0].texto,/^Obra \$700\.00 \(70 %\), Equipo \$300\.00 \(30 %\) y Mobiliario \$0\.50 \(0 %\)\.$/);
});
test('inversión: detalle que no cuadra con la fuente',()=>{
 const a=analisisInversion([d('1','Obra',600)],650);
 assert.equal(a.cuadra,false);assert.equal(a.diferencia,-50);
 assert.equal(a.lectura[1].titulo,'El detalle no cuadra con la fuente');
 assert.equal(a.lectura[1].texto,'El detalle suma $600.00 y la fuente $650.00: diferencia de $50.00.');
 assert.deepEqual(analisisInversion([],0).lectura,[]);
});
```

- [ ] **Step 2:** Corre las dos pruebas y confirma que fallan.
- [ ] **Step 3: Implement.**

`lib/aperturasAkton.ts`:

```ts
export type TarjetaPortada = {id:string;dias:DiasApertura;avance:Avance;vencidas:number;bloqueadas:number};
export function resumenPortada(proyectos:Pick<ProyectoApertura,'id'|'objetivo_hasta'>[],items:(Concepto&{proyecto_id:string})[],hoy:string) {
 const tarjetas:Record<string,TarjetaPortada>={};
 for(const p of proyectos){
  const de=items.filter(i=>i.proyecto_id===p.id),avance=avanceComparado(de,hoy),aplicables=de.filter(cuentaEnAvance);
  tarjetas[p.id]={id:p.id,dias:diasParaApertura(p.objetivo_hasta,hoy,avance.conceptos>0&&avance.listos===avance.conceptos),avance,
   vencidas:aplicables.filter(i=>diasVencido(i,hoy)!==null).length,bloqueadas:aplicables.filter(i=>i.estado==='bloqueado').length};
 }
 const lista=Object.values(tarjetas),porVenir=lista.filter(t=>t.dias.tipo==='faltan'||t.dias.tipo==='hoy').sort((a,b)=>a.dias.dias-b.dias.dias);
 return {tarjetas,enCurso:lista.filter(t=>t.dias.tipo!=='abierta').length,proxima:porVenir[0]?{id:porVenir[0].id,dias:porVenir[0].dias.dias}:null,atrasados:lista.filter(t=>t.avance.favorable==='no').length};
}
```

En `lecturaApertura`, en la rama `else` de `soloBloq` (cuando `titulo` está vacío), usa `plural(soloBloq,'tarea bloqueada','tareas bloqueadas')`.

`lib/inversionApertura.ts`. Importa `pesos` desde `./formato.ts`, con el comentario `@ts-expect-error` del patrón:

```ts
export type AnalisisInversion={total:number;movimientos:number;grupos:{tipo:string;monto:number;pct:number;detalles:DetalleInversion[]}[];diferencia:number;cuadra:boolean;lectura:{titulo:string;texto:string}[]};
export function analisisInversion(detalles:DetalleInversion[],totalFuente:number):AnalisisInversion {
 const r=resumirInversion(detalles),total=r.total;
 const grupos=r.grupos.map(g=>({...g,pct:total?Math.round(g.monto/total*100):0,detalles:detalles.filter(x=>x.tipo===g.tipo)})).sort((a,b)=>b.monto-a.monto||a.tipo.localeCompare(b.tipo));
 const diferencia=Math.round((total-Number(totalFuente))*100)/100,cuadra=Math.abs(diferencia)<=0.01,lectura:{titulo:string;texto:string}[]=[];
 if(grupos.length){const top=grupos.slice(0,3).map(g=>`${g.tipo} ${pesos(g.monto)} (${g.pct} %)`);
  lectura.push({titulo:`Donde más se invirtió: ${grupos[0].tipo}`,texto:`${top.length>1?`${top.slice(0,-1).join(', ')} y ${top.at(-1)}`:top[0]}.`});}
 if(!cuadra)lectura.push({titulo:'El detalle no cuadra con la fuente',texto:`El detalle suma ${pesos(total)} y la fuente ${pesos(Number(totalFuente))}: diferencia de ${pesos(Math.abs(diferencia))}.`});
 return {total,movimientos:detalles.length,grupos,diferencia,cuadra,lectura};
}
```

- [ ] **Step 4:** Corre las pruebas y confirma que pasan. **Commit:** `feat(aperturas): resumen de portada y análisis de inversión para Akton`.

### Task 2: Portada `/aperturas`

**Files:** `app/aperturas/page.tsx`, `app/globals.css`

- [ ] **Step 1: Consultas.**
  - Los conceptos se leen con `id,proyecto_id,nombre,tipo,etapa,estado,inicio,fin,responsable,notas`.
  - Además se lee `inversion_apertura_fuentes` con `select('total')`. Si falla, el total es `null` y se muestra «—».
  - Se calcula `const r=resumenPortada(data,items??[],hoy)`.
- [ ] **Step 2: Dibujo.** Debajo del encabezado va `<div className="akton">` con:
  - **Franja de 4 `Kpi`:**
    - «Aperturas en curso»: `r.enCurso`, con pie «De N proyectos».
    - «Próxima apertura»: con tono `destacado` si hay una. El valor es `r.proxima?(r.proxima.dias===0?'Hoy':`${r.proxima.dias} días`):'Ninguna programada'` y el pie, el nombre de la sucursal.
    - «Atrasadas contra lo esperado»: `r.atrasados`, con tono `no` si es mayor que 0 y pie «Más de 5 pts abajo de lo esperado a hoy».
    - «Inversión registrada»: `pesos(total)` o «—», con pie «Ver Inversión de apertura».
  - **Tarjetas** en `<div className="ap-portada">`, en el mismo orden (`ordenarProyectos`). Cada `Link` lleva `className="ap-tarjeta ap-tarjeta-akton"` y adentro:
    - `<span className="akton-kpi-etiqueta">{sucursal}</span>`.
    - `<strong className="ap-tarjeta-dias" data-tono={tonoDias}>{textoDiasApertura(t.dias).valor}</strong>`, con `tonoDias` = `no` si está vencida y `destacado` si no.
    - `<small>{responsable} · {rango(objetivo_desde,objetivo_hasta)}</small>`.
    - `<span>Avance {real ?? '—'} % · esperado {esperado ?? 'sin fechas'}{esperado!==null&&' %'} <b className="akton-var" data-favorable={favorable}>{variacion!==null?textoPts(variacion):''}</b></span>`.
    - Si hay vencidas o bloqueadas: `<p className="akton-nota">N vencidas · M bloqueadas</p>`.
  - Se dejan de usar `cuentaRegresiva`, `porcentajeAvance`, `avancePorProyecto` y `.estado`. Las funciones se conservan en `lib/aperturas.ts`, porque `tests/aperturasPortada` las prueba.
- [ ] **Step 3: CSS.**
  ```css
  .ap-tarjeta-akton { display:flex; flex-direction:column; gap:6px; background:var(--superficie); border:1px solid var(--linea); border-radius:var(--r-md); box-shadow:none; padding:16px; color:var(--tinta); text-decoration:none; }
  .ap-tarjeta-akton:hover { border-color:var(--tinta-3); }
  .ap-tarjeta-dias { font-size:1.6rem; font-weight:800; font-variant-numeric:tabular-nums; }
  .ap-tarjeta-dias[data-tono="destacado"] { color:var(--accion-oscuro); }
  .ap-tarjeta-dias[data-tono="no"] { color:var(--alerta); }
  ```
  La pieza `.akton` define `--akton-si/no`. Verifica que `.ap-portada` quede dentro de `.akton`.
- [ ] **Step 4:** `npx tsc --noEmit`. **Commit:** `feat(aperturas): portada con franja y tarjetas Akton`.

### Task 3: Detalle de tarea e historial

**Files:** `app/aperturas/[id]/items/[item]/page.tsx`, `app/aperturas/Historial.tsx`, `app/globals.css`

- [ ] **Step 1: Franja del detalle.** Reemplaza la `<section className="seccion"><h2>Seguimiento</h2><dl …>` por `<div className="akton">` con `<section className="akton-kpis">` de 4 `Kpi`:
  - **Estado:** `ESTADOS[i.estado]`, con tono `si` si `tonoConcepto` es `listo` y `no` si es `alerta`. El pie es «Responsable: …».
  - **Fecha:** `fechaConcepto(i)` con `fechaTexto`, o «Sin fecha». Tono `no` si `diasVencido!==null`. El pie dice «Vencida hace N días»; si no, `inicio – fin`, o «Sin programar».
  - **Cantidad / recibido:** solo si es compra; si no, «Categoría» con su nombre.
  - **Importe:** `pesos(cantidad*precio)` si hay los dos; si no, «—». El pie es «Precio unitario: …» o «Sin precio».

  Debajo, una `.akton-tabla-marco` «Seguimiento». Es la tabla de dos columnas Campo · Valor con lo que tenía el `<dl>`: categoría, orden, factura, evidencia y notas. Usa `className="akton-tabla tabla-tarjetas ap-tabla"` y en cada celda `data-label`.
- [ ] **Step 2: Origen y especificaciones.** El `<dl>` pasa a una tabla Akton Campo · Valor, con las mismas etiquetas de campo que hoy y `i.fuente` como subtítulo.
- [ ] **Step 3: Formulario.** La `<section className="seccion"><h2>Actualizar seguimiento</h2>` pasa a `<section className="akton-tabla-marco"><h2 className="akton-titulo">Actualizar seguimiento</h2>`. El contenido no cambia.
- [ ] **Step 4: Historial** (lo usan el detalle de tarea y la página del proyecto).
  - `Historial` devuelve una `.akton-tabla-marco` con la tabla Fecha · Quién · Qué cambió (`akton-tabla tabla-tarjetas ap-tabla`).
  - «Qué cambió» lista los campos distintos entre `anterior` y `nuevo` como «Campo: antes → después», con `CAMPOS[k]??k` y `valor()`.
  - Se ignoran `revision`, `actualizado_en`, `id` y `original`.
  - Si no hay cambios, dice «Sin cambios registrados».
  - Antes de borrar el formato actual de cada cambio, revisa cómo arma la comparación y conserva sus exclusiones.
- [ ] **Step 5:** `npx tsc --noEmit`. **Commit:** `feat(aperturas): detalle de tarea e historial con estilo Akton`.

### Task 4: Inversión y corte de presupuesto

**Files:** `app/aperturas/inversion/page.tsx`, `app/aperturas/CortePresupuesto.tsx`, `app/globals.css`

- [ ] **Step 1: Inversión.** Con `const a=analisisInversion(f.datos.detalles,Number(f.total))`:
  - Encabezado igual: volver, título, fuente.
  - `<div className="akton">` con:
    - **Franja:**
      - «Inversión registrada»: `pesos(a.total)` con tono `destacado`.
      - «Movimientos»: `a.movimientos`.
      - «Clasificaciones»: `a.grupos.length`.
      - «Cuadre con la fuente»: «Cuadra» con tono `si`, o «Diferencia de $X» con tono `no`. El pie es «Total de la fuente: $Y».
    - **Lectura:** `<LecturaProyecto lecturas={a.lectura}/>`.
    - **Filtros:** el formulario actual, en `.akton-tabla-marco`.
    - **Tabla `akton-tabla tabla-tarjetas ap-tabla`:**
      - Columnas: Movimiento · Clasificación · Importe · Trazabilidad.
      - Por cada grupo con filas filtradas va un `tr.akton-seccion` «{tipo} · N movimientos».
      - Luego sus movimientos (fecha, id · mayor, proveedor, concepto, nota; categoría; `pesos(monto)`; el `<details>` de vínculos que ya existe, sin cambios).
      - Al final de cada grupo va un `tr.akton-subtotal` «Subtotal {tipo}», con el monto del grupo filtrado y su % del total.
  - Se borra el bloque viejo con `style={{display:'flex'}}` y el aviso de no cuadre, porque ahora lo cubren la franja y la lectura.
  - El componente `ConInfo` puede quedarse junto al título de la tabla.
- [ ] **Step 2: Corte de presupuesto** (`CortePresupuesto.tsx`):
  - `.akton-tabla-marco` con título «Presupuesto del proyecto» y subtítulo con el corte, el total con IVA y el total sin IVA.
  - Tabla Akton de 3 renglones (Adquirido, Cotizado / confirmado, Falta cotizar · supuesto). Columnas: Monto sin IVA · % del presupuesto.
  - Renglón final `akton-subtotal`, «Total sin IVA».
  - Se quitan la barra apilada de colores y las tarjetas `saldo` de colores.
  - El `<details>` con el desglose y los puntos por cerrar se queda, con su tabla pasada a `akton-tabla tabla-tarjetas ap-tabla`.
  - Para tener las variables de color, envuelve el componente en `.akton`.
- [ ] **Step 3:** `npx tsc --noEmit && npm test`. **Commit:** `feat(aperturas): Inversión y corte de presupuesto con estilo Akton`.

### Task 5: Minors del PR 2

- [ ] Borra de `app/aperturas/[id]/page.tsx` el import sin uso `avanceCategorias`. Revisa también `grupoApertura` y `esObra`, y quítalos si quedan sin uso.
- [ ] En `app/globals.css`, borra los selectores muertos:
  - Dentro de las líneas mixtas: `.ap-roadmap progress*`, `.ap-categorias`, `.ap-panel`, `.ap-dona` y `.ap-roadmap li` en las media queries.
  - Los tonos viejos `.ap-estado[data-tono="bloqueado|en_curso|terminado|recibido|gris"]`, si ninguna pantalla los emite. Confírmalo con `grep -rn "data-tono" app/aperturas`.

  Edita solo los selectores muertos dentro de las líneas mixtas y conserva lo demás de cada línea.
- [ ] Borra `.estado` del CSS solo si nada más lo usa. Lo usan otras pantallas, así que probablemente no se borra.
- [ ] `npx tsc --noEmit && npm test`. **Commit:** `chore(aperturas): limpieza de CSS e imports sin uso`.

### Task 6: Revisión visual, revisión final y PR

- [ ] Página temporal `app/login/prueba-akton/page.tsx` y `.env.local` (no se suben). Las páginas de servidor necesitan Supabase, así que en la página temporal se renderizan las piezas con datos de ejemplo:
  - la franja y las tarjetas de la portada;
  - la franja y las tablas del detalle;
  - `Historial`;
  - la franja, la lectura y la tabla de Inversión;
  - `CortePresupuesto` con un concepto `PRE26-CORTE` de ejemplo.

  Si una página no se puede renderizar sin base, extrae su parte de dibujo a un componente y renderízalo; anota la decisión. Revisa a 1300, 800 y 375 px: sin desplazamiento lateral, naranja solo en lo destacado, verde y rojo solo en bien / mal.
- [ ] Borra lo temporal y `.next`. Corre `npx tsc --noEmit && npm test`.
- [ ] Revisión final con un revisor nuevo (modelo más capaz) y el Review Focus. Corrige lo Critical/Important con prueba en rojo y luego en verde.
- [ ] Integra `origin/main` si avanzó y abre el PR, con la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Espera los checks y no integres sin el visto bueno de Sebastián.
