# Aperturas Akton · PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La página de cada apertura muestra franja de indicadores, lectura numerada, pestañas grises y un Cronograma (tabla por etapa + Gantt en grises) con el estilo Akton del P&L.

**Architecture:** Toda la lógica nueva va en `lib/aperturasAkton.ts`, en funciones puras con `hoy` explícito y pruebas `node --test`. Los componentes de servidor (`AktonProyecto.tsx`, `Cronograma.tsx`, `Gantt.tsx`) solo dibujan con las clases `.akton-*` que ya existen. Se retiran `PanelProyecto.tsx`, `fuenteGantt.ts` y el CSS pastel del Gantt.

**Tech Stack:** Next.js 15 (App Router, server components), TypeScript, CSS global (`app/globals.css`), pruebas con `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-aperturas-akton-design.md`

## Global Constraints

- Color Akton estricto. Naranja (`--accion`) solo para lo destacado (días para apertura, fecha objetivo) y alertas. Verde (`--cuadra`) y rojo (`--alerta`) solo para va bien / va mal. Todo lo demás en negro y grises.
- `TOLERANCIA_AVANCE = 5` puntos: favorable si `variación ≥ −5`.
- Conceptos que cuentan: `cuentaEnAvance` (sin no aplica ni equipo/referencias por validar). Listo: `marcaItem(i)==='listo'`.
- «Roadmap» se muestra como «Cronograma», pero la URL sigue siendo `vista=roadmap`.
- Sin migración. `apertura_colores` queda sin uso.
- Textos de la interfaz en español claro. Montos con `pesos()`.
- En `lib/*.ts`, los imports entre módulos de `lib` llevan extensión `.ts` precedida de `// @ts-expect-error Node strip-types requiere extensión explícita.` (patrón existente).
- Prohibido commitear a `main`. Se trabaja en la rama `feat/aperturas-akton` (worktree `wt-aperturas-akton`).

## Review Focus

1. **Proyecto sin ninguna fecha.** Esperado `null`: la franja muestra «Esperado a hoy: sin fechas» sin tono y la lectura 1 no aparece (Task 1 y Task 2).
2. **Hoy justo en el primer o el último día del rango.** El esperado debe dar `1/n` y `1` (incluye hoy), no 0 ni >1 (Task 1).
3. **Etapa con todos sus conceptos sin fecha.** El Cronograma muestra «—» en esperado y variación, sin color, y no truena (Task 1 y Task 4).
4. **Más de 3 vencidas o bloqueadas.** La lectura 2 lista solo 3, primero las de más días de atraso; la nota de la etapa resume «y N más» (Task 2).
5. **Fecha objetivo ya pasada.** Con todo listo, Días muestra «Abierta». Sin todo listo, «Vencida hace N días» en rojo; nunca días negativos (Task 1).

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/aperturasAkton.ts` | Crear | Esperado, avance comparado, días para apertura, filas del cronograma, notas, indicadores, lectura |
| `lib/aperturasAkton.test.ts` | Crear | Pruebas de todo lo anterior |
| `app/aperturas/AktonProyecto.tsx` | Crear | Franja de 6 KPIs y lectura numerada |
| `app/aperturas/Cronograma.tsx` | Crear | Tabla Akton por etapa con tareas desplegables y total |
| `app/aperturas/Gantt.tsx` | Modificar | Quitar colores y letra; dejar estilo gris |
| `app/aperturas/fuenteGantt.ts` | Borrar | — |
| `app/aperturas/PanelProyecto.tsx` | Borrar | — |
| `app/aperturas/[id]/page.tsx` | Modificar | Usar `.akton`, pestañas, Cronograma; no leer colores en roadmap |
| `app/finanzas/PLAkton.tsx` | Modificar | Exportar `Kpi` para reutilizarlo |
| `app/globals.css` | Modificar | `.akton-pestanas`, Gantt gris, borrar `.ap-gantt-*` pastel y `.ap-dona`/`.ap-indicador` sin uso |
| `docs/diseno/estilo-akton.md` | Modificar | Piezas nuevas y regla de avance esperado |
| `package.json` | Modificar | Agregar `lib/aperturasAkton.test.ts` al script `test` |

---

### Task 1: Avance esperado, avance comparado y días para la apertura

**Files:**
- Create: `lib/aperturasAkton.ts`
- Create: `lib/aperturasAkton.test.ts`
- Modify: `package.json` (script `test`: agregar `lib/aperturasAkton.test.ts` después de `lib/aperturasGantt.test.ts`)

**Interfaces:**
- Consumes: `cuentaEnAvance` (`lib/aperturasGantt.ts`), `marcaItem`, `ItemApertura` (`lib/aperturas.ts`), `rangoItem` (`lib/aperturasCalendario.ts`).
- Produces:
  - `TOLERANCIA_AVANCE: 5`
  - `type Concepto = Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'inicio'|'fin'|'responsable'|'notas'>`
  - `esperadoItem(i: Pick<ItemApertura,'inicio'|'fin'>, hoy: string): number | null` (fracción 0–1)
  - `type Avance = {conceptos:number; listos:number; real:number|null; conFecha:number; realConFecha:number|null; esperado:number|null; variacion:number|null; favorable:'si'|'no'|null}` (porcentajes enteros 0–100)
  - `avanceComparado(items: Concepto[], hoy: string): Avance`
  - `diasEntre(desde: string, hasta: string): number`
  - `type DiasApertura = {tipo:'faltan'|'hoy'|'vencida'|'abierta'; dias:number}`
  - `diasParaApertura(objetivo: string, hoy: string, todoListo: boolean): DiasApertura`
  - `textoPts(n: number): string` (`+3 pts`, `−8 pts`, `0 pts`)

- [ ] **Step 1: Write the failing tests**

```ts
// lib/aperturasAkton.test.ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avanceComparado,diasParaApertura,esperadoItem,textoPts,type Concepto} from './aperturasAkton.ts';

export const c=(d:Partial<Concepto>):Concepto=>({id:'i',nombre:'Tarea',tipo:'actividad',etapa:'P1',estado:'pendiente',inicio:null,fin:null,responsable:null,notas:null,...d});

test('aperturas akton: esperado antes, durante y después del rango, contando hoy',()=>{
 const r={inicio:'2026-11-01',fin:'2026-11-10'};
 assert.equal(esperadoItem(r,'2026-10-31'),0);
 assert.equal(esperadoItem(r,'2026-11-01'),0.1);
 assert.equal(esperadoItem(r,'2026-11-05'),0.5);
 assert.equal(esperadoItem(r,'2026-11-10'),1);
 assert.equal(esperadoItem(r,'2026-11-11'),1);
 assert.equal(esperadoItem({inicio:null,fin:'2026-11-03'},'2026-11-03'),1);
 assert.equal(esperadoItem({inicio:null,fin:null},'2026-11-03'),null);
});
test('aperturas akton: el avance comparado usa solo conceptos con fecha para la variación',()=>{
 const a=avanceComparado([
  c({id:'a',estado:'completado',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'b',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'d',estado:'completado'}),
  c({id:'e'}),
  c({id:'f',estado:'no_aplica',inicio:'2026-11-01',fin:'2026-11-02'}),
  c({id:'g',tipo:'equipo',estado:'por_validar',fin:'2026-11-01'}),
 ],'2026-11-05');
 assert.equal(a.conceptos,4);assert.equal(a.listos,2);assert.equal(a.real,50);
 assert.equal(a.conFecha,2);assert.equal(a.realConFecha,50);
 assert.equal(a.esperado,50);assert.equal(a.variacion,0);assert.equal(a.favorable,'si');
});
test('aperturas akton: tolerancia de 5 puntos',()=>{
 const items=(listos:number)=>Array.from({length:20},(_,n)=>c({id:`x${n}`,inicio:'2026-11-01',fin:'2026-11-10',estado:n<listos?'completado':'pendiente'}));
 assert.equal(avanceComparado(items(9),'2026-11-05').favorable,'si'); // 45 vs 50 → −5
 assert.equal(avanceComparado(items(8),'2026-11-05').favorable,'no'); // 40 vs 50 → −10
});
test('aperturas akton: sin fechas no hay esperado ni tono',()=>{
 const a=avanceComparado([c({estado:'completado'}),c({id:'b'})],'2026-11-05');
 assert.equal(a.real,50);assert.equal(a.esperado,null);assert.equal(a.variacion,null);assert.equal(a.favorable,null);
 const v=avanceComparado([],'2026-11-05');
 assert.equal(v.real,null);assert.equal(v.esperado,null);
});
test('aperturas akton: días para la apertura',()=>{
 assert.deepEqual(diasParaApertura('2026-12-01','2026-11-24',false),{tipo:'faltan',dias:7});
 assert.deepEqual(diasParaApertura('2026-11-24','2026-11-24',false),{tipo:'hoy',dias:0});
 assert.deepEqual(diasParaApertura('2026-11-20','2026-11-24',false),{tipo:'vencida',dias:4});
 assert.deepEqual(diasParaApertura('2026-11-20','2026-11-24',true),{tipo:'abierta',dias:4});
 assert.equal(textoPts(3),'+3 pts');assert.equal(textoPts(-8),'−8 pts');assert.equal(textoPts(0),'0 pts');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/aperturasAkton.test.ts`
Expected: FAIL with `Cannot find module` for `./aperturasAkton.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/aperturasAkton.ts
// Aperturas con estilo Akton: avance esperado a hoy, indicadores y lectura. Guía: docs/diseno/estilo-akton.md.
// @ts-expect-error Node strip-types requiere extensión explícita.
import {marcaItem,type ItemApertura} from './aperturas.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {rangoItem} from './aperturasCalendario.ts';
// @ts-expect-error Node strip-types requiere extensión explícita.
import {cuentaEnAvance} from './aperturasGantt.ts';

export const TOLERANCIA_AVANCE = 5;
export type Concepto = Pick<ItemApertura,'id'|'nombre'|'tipo'|'etapa'|'estado'|'inicio'|'fin'|'responsable'|'notas'>;

const DIA=86_400_000;
const aMs=(d:string)=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)));
export const diasEntre=(desde:string,hasta:string)=>Math.round((aMs(hasta)-aMs(desde))/DIA);
export const textoPts=(n:number)=>`${n>0?'+':n<0?'−':''}${Math.abs(n)} pts`;
const pct=(n:number,d:number)=>d?Math.round(n/d*100):null;

// Qué parte de su ventana ya debió avanzar un concepto a hoy (incluye hoy). Sin fechas: null.
export function esperadoItem(i:Pick<ItemApertura,'inicio'|'fin'>,hoy:string):number|null {
 const r=rangoItem(i);if(!r)return null;
 if(hoy<r.desde)return 0;if(hoy>r.hasta)return 1;
 return (diasEntre(r.desde,hoy)+1)/(diasEntre(r.desde,r.hasta)+1);
}

export type Avance = {conceptos:number;listos:number;real:number|null;conFecha:number;realConFecha:number|null;esperado:number|null;variacion:number|null;favorable:'si'|'no'|null};
// Real de todos los conceptos; la variación compara el real y el esperado de los mismos conceptos con fecha.
export function avanceComparado(items:Concepto[],hoy:string):Avance {
 const de=items.filter(cuentaEnAvance),listo=(i:Concepto)=>marcaItem(i)==='listo';
 const fechados=de.flatMap(i=>{const e=esperadoItem(i,hoy);return e===null?[]:[{i,e}];});
 const realConFecha=pct(fechados.filter(x=>listo(x.i)).length,fechados.length);
 const esperado=fechados.length?Math.round(fechados.reduce((s,x)=>s+x.e,0)/fechados.length*100):null;
 const variacion=realConFecha!==null&&esperado!==null?realConFecha-esperado:null;
 return {conceptos:de.length,listos:de.filter(listo).length,real:pct(de.filter(listo).length,de.length),conFecha:fechados.length,realConFecha,esperado,variacion,
  favorable:variacion===null?null:variacion>=-TOLERANCIA_AVANCE?'si':'no'};
}

export type DiasApertura = {tipo:'faltan'|'hoy'|'vencida'|'abierta';dias:number};
export function diasParaApertura(objetivo:string,hoy:string,todoListo:boolean):DiasApertura {
 const d=diasEntre(hoy,objetivo);
 if(d>0)return {tipo:'faltan',dias:d};
 if(d===0)return {tipo:'hoy',dias:0};
 return {tipo:todoListo?'abierta':'vencida',dias:-d};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/aperturasAkton.test.ts`
Expected: 5 pass, 0 fail.

- [ ] **Step 5: Register the test and commit**

En `package.json`, en el script `test`, reemplaza `lib/aperturasGantt.test.ts` por `lib/aperturasGantt.test.ts lib/aperturasAkton.test.ts`.

```bash
git add lib/aperturasAkton.ts lib/aperturasAkton.test.ts package.json
git commit -m "feat(aperturas): avance esperado a hoy y días para la apertura"
```

---

### Task 2: Filas del cronograma, notas, indicadores y lectura

**Files:**
- Modify: `lib/aperturasAkton.ts`
- Modify: `lib/aperturasAkton.test.ts`

**Interfaces:**
- Consumes: Task 1 (`avanceComparado`, `diasEntre`, `diasParaApertura`, `textoPts`, `Concepto`, `Avance`). También `ETAPAS`, `indicadoresApertura`, `resumenApertura`, `ProyectoApertura` (`lib/aperturas.ts`), `cortePresupuesto` (`lib/cortePresupuesto.ts`), `ganttEtapas` (`lib/aperturasGantt.ts`) y `pesos` (`lib/formato.ts`).
- Produces:
  - `type TareaCronograma = {item:Concepto; desde:string; hasta:string; diasVencida:number|null}`
  - `type FilaCronograma = {clave:keyof typeof ETAPAS; nombre:string; avance:Avance; desde:string|null; hasta:string|null; tareas:TareaCronograma[]; sinFecha:number; bloqueadas:Concepto[]; vencidas:TareaCronograma[]; notas:string[]}`
  - `filasCronograma(items: Concepto[], hoy: string): FilaCronograma[]` (siempre 7, en orden P1–P7)
  - `type IndicadoresProyecto = {dias:DiasApertura; avance:Avance; vencidas:number; bloqueadas:number; aplicables:number; recepcion:number|null; recibidas:number; unidades:number; compras:{monto:number; presupuesto:number|null; excede:boolean; firme:boolean; sinPrecio:number}}`
  - `indicadoresProyecto(p: Pick<ProyectoApertura,'objetivo_hasta'|'presupuesto'>, items: ItemApertura[], hoy: string): IndicadoresProyecto`
  - `type Lectura = {titulo:string; texto:string}`
  - `lecturaApertura(k: IndicadoresProyecto, filas: FilaCronograma[]): Lectura[]` (0 a 3)

- [ ] **Step 1: Write the failing tests** (agregar al final de `lib/aperturasAkton.test.ts`; agregar al import: `filasCronograma, indicadoresProyecto, lecturaApertura`)

```ts
import type {ItemApertura} from './aperturas.ts';
const it=(d:Partial<ItemApertura>):ItemApertura=>({id:'i',proyecto_id:'p',clave:'K',tipo:'actividad',etapa:'P1',nombre:'Tarea',fuente:'x',original:{},estado:'pendiente',responsable:null,inicio:null,fin:null,cantidad:null,recibido:0,precio:null,evidencia:null,notas:null,orden_id:null,factura_id:null,revision:1,categoria:null,...d});

test('aperturas akton: filas del cronograma con vencidas, bloqueadas y notas',()=>{
 const f=filasCronograma([
  c({id:'a',etapa:'P3',nombre:'Licencia',estado:'bloqueado',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'b',etapa:'P3',nombre:'Contrato',inicio:'2026-11-01',fin:'2026-11-20'}),
  c({id:'d',etapa:'P3',nombre:'Planos',fin:'2026-11-15'}),
  c({id:'e',etapa:'P3',nombre:'Sin fecha'}),
 ],'2026-11-24');
 assert.equal(f.length,7);
 const p3=f.find(x=>x.clave==='P3')!;
 assert.equal(p3.desde,'2026-11-01');assert.equal(p3.hasta,'2026-11-20');
 assert.equal(p3.sinFecha,1);
 assert.deepEqual(p3.vencidas.map(v=>[v.item.id,v.diasVencida]),[['a',14],['d',9],['b',4]]);
 assert.deepEqual(p3.bloqueadas.map(b=>b.id),['a']);
 assert.deepEqual(p3.notas,['1 bloqueada: Licencia','3 vencidas']);
 const p1=f.find(x=>x.clave==='P1')!;
 assert.equal(p1.avance.esperado,null);assert.deepEqual(p1.notas,[]);
});
test('aperturas akton: la nota de bloqueadas resume después de dos nombres',()=>{
 const p=filasCronograma(['A','B','C','D'].map((n,k)=>c({id:n,nombre:n,etapa:'P5',estado:'bloqueado'})),'2026-11-24').find(x=>x.clave==='P5')!;
 assert.deepEqual(p.notas,['4 bloqueadas: A, B y 2 más']);
});
test('aperturas akton: indicadores del proyecto',()=>{
 const items=[
  it({id:'a',estado:'completado',inicio:'2026-11-01',fin:'2026-11-10'}),
  it({id:'b',estado:'bloqueado',fin:'2026-11-20'}),
  it({id:'d',tipo:'equipo',etapa:'P4',estado:'pedido',cantidad:4,recibido:1,precio:100}),
  it({id:'e',estado:'no_aplica'}),
 ];
 const k=indicadoresProyecto({objetivo_hasta:'2026-12-04',presupuesto:300},items,'2026-11-24');
 assert.deepEqual(k.dias,{tipo:'faltan',dias:10});
 assert.equal(k.vencidas,1);assert.equal(k.bloqueadas,1);assert.equal(k.aplicables,3);
 assert.equal(k.recepcion,25);assert.equal(k.recibidas,1);assert.equal(k.unidades,4);
 assert.deepEqual(k.compras,{monto:400,presupuesto:300,excede:true,firme:false,sinPrecio:0});
});
test('aperturas akton: lectura con las tres conclusiones y en su orden',()=>{
 const items=[
  ...Array.from({length:10},(_,n)=>it({id:`o${n}`,etapa:'P5',nombre:`Obra ${n}`,inicio:'2026-11-01',fin:'2026-11-10'})),
  it({id:'l',etapa:'P3',nombre:'Licencia',estado:'bloqueado',inicio:'2026-11-01',fin:'2026-11-18'}),
  it({id:'q',etapa:'P1',nombre:'Contrato',estado:'completado',inicio:'2026-11-01',fin:'2026-11-05'}),
  it({id:'eq',tipo:'equipo',etapa:'P4',nombre:'Horno',estado:'cotizado',cantidad:1,precio:null}),
 ];
 const filas=filasCronograma(items,'2026-11-24');
 const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:5000},items,'2026-11-24'),filas);
 assert.equal(l.length,3);
 assert.equal(l[0].titulo,'Avance de 8 % contra 100 % esperado a hoy');
 // Empate en −100: desempata por clave de etapa (P3 antes que P5).
 assert.equal(l[0].texto,'Faltan 92 puntos. Las etapas más atrasadas: Permisos y contratación (−100 pts) y Obra e instalaciones (−100 pts).');
 assert.equal(l[1].titulo,'11 tareas vencidas y 1 bloqueada');
 // Primero las de más días de atraso; Licencia (6 días) queda dentro de «y 8 más».
 assert.equal(l[1].texto,'Las más urgentes: Obra 0 (vencida hace 14 días), Obra 1 (vencida hace 14 días), Obra 2 (vencida hace 14 días) y 8 más.');
 assert.equal(l[2].titulo,'Compras: $0.00 estimado de $5,000.00 de presupuesto');
 assert.equal(l[2].texto,'1 concepto sin precio o sin cantidad.');
});
test('aperturas akton: la lectura omite lo que no aplica',()=>{
 const items=[it({id:'a',estado:'completado',inicio:'2026-11-01',fin:'2026-11-10'})];
 const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},items,'2026-11-24'),filasCronograma(items,'2026-11-24'));
 assert.equal(l.length,1);
 assert.equal(l[0].titulo,'Avance de 100 % contra 100 % esperado a hoy');
 assert.equal(l[0].texto,'Va al día (0 pts). La etapa más adelantada es Local y alcance (0 pts).');
 assert.deepEqual(lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},[],'2026-11-24'),filasCronograma([],'2026-11-24')),[]);
});
```

Nota sobre el monto de la lectura 3: `pesos()` formatea con `Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})`. Si la salida real difiere (por ejemplo `$5,000.00` vs `$5,000`), ajusta solo el texto esperado de la prueba a lo que devuelva `pesos(5000)`; no cambies `pesos`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/aperturasAkton.test.ts`
Expected: FAIL. `filasCronograma` no existe.

- [ ] **Step 3: Write minimal implementation** (agregar a `lib/aperturasAkton.ts`; extender los imports de `./aperturas.ts` con `ETAPAS, indicadoresApertura, resumenApertura, type ProyectoApertura`, y agregar los imports con el mismo comentario `@ts-expect-error`: `import {cortePresupuesto} from './cortePresupuesto.ts';`, `import {pesos} from './formato.ts';`)

```ts
export type TareaCronograma = {item:Concepto;desde:string;hasta:string;diasVencida:number|null};
export type FilaCronograma = {clave:keyof typeof ETAPAS;nombre:string;avance:Avance;desde:string|null;hasta:string|null;tareas:TareaCronograma[];sinFecha:number;bloqueadas:Concepto[];vencidas:TareaCronograma[];notas:string[]};

const terminada=(estado:string)=>estado==='completado'||estado==='verificado';
const plural=(n:number,uno:string,varios:string)=>`${n} ${n===1?uno:varios}`;
function listaCorta(nombres:string[]) {
 if(nombres.length<=2)return nombres.join(' y ');
 return `${nombres.slice(0,2).join(', ')} y ${nombres.length-2} más`;
}

export function filasCronograma(items:Concepto[],hoy:string):FilaCronograma[] {
 return (Object.keys(ETAPAS) as (keyof typeof ETAPAS)[]).map(clave=>{
  const de=items.filter(i=>i.etapa===clave&&cuentaEnAvance(i));
  const tareas=de.flatMap(item=>{const r=rangoItem(item);if(!r)return [];
   return [{item,desde:r.desde,hasta:r.hasta,diasVencida:r.hasta<hoy&&!terminada(item.estado)?diasEntre(r.hasta,hoy):null}];})
   .sort((a,b)=>a.desde.localeCompare(b.desde)||a.hasta.localeCompare(b.hasta)||a.item.nombre.localeCompare(b.item.nombre));
  const vencidas=tareas.filter(t=>t.diasVencida!==null).sort((a,b)=>b.diasVencida!-a.diasVencida!||a.item.nombre.localeCompare(b.item.nombre));
  const bloqueadas=de.filter(i=>i.estado==='bloqueado');
  const notas=[
   ...(bloqueadas.length?[`${plural(bloqueadas.length,'bloqueada','bloqueadas')}: ${listaCorta(bloqueadas.map(b=>b.nombre))}`]:[]),
   ...(vencidas.length?[plural(vencidas.length,'vencida','vencidas')]:[]),
  ];
  return {clave,nombre:ETAPAS[clave],avance:avanceComparado(de,hoy),desde:tareas[0]?.desde??null,hasta:tareas.length?tareas.map(t=>t.hasta).sort().at(-1)!:null,
   tareas,sinFecha:de.length-tareas.length,bloqueadas,vencidas,notas};
 });
}

export type IndicadoresProyecto = {dias:DiasApertura;avance:Avance;vencidas:number;bloqueadas:number;aplicables:number;recepcion:number|null;recibidas:number;unidades:number;
 compras:{monto:number;presupuesto:number|null;excede:boolean;firme:boolean;sinPrecio:number}};

export function indicadoresProyecto(p:Pick<ProyectoApertura,'objetivo_hasta'|'presupuesto'>,items:ItemApertura[],hoy:string):IndicadoresProyecto {
 const r=indicadoresApertura(items,hoy),avance=avanceComparado(items,hoy),corte=cortePresupuesto(items),estimado=resumenApertura(items);
 const monto=corte?Math.round((corte.adquirido+corte.cotizado)*100)/100:estimado.cotizado;
 const presupuesto=corte?corte.total_sin_iva:p.presupuesto!==null&&Number(p.presupuesto)>0?Number(p.presupuesto):null;
 return {dias:diasParaApertura(p.objetivo_hasta,hoy,avance.conceptos>0&&avance.listos===avance.conceptos),avance,
  vencidas:r.atrasados.length,bloqueadas:r.bloqueados.length,aplicables:items.filter(i=>i.estado!=='no_aplica').length,
  recepcion:r.recepcion,recibidas:r.recibidas,unidades:r.unidades,
  compras:{monto,presupuesto,excede:presupuesto!==null&&monto>presupuesto,firme:corte!==null,sinPrecio:estimado.sinPrecio}};
}

export type Lectura = {titulo:string;texto:string};
export function lecturaApertura(k:IndicadoresProyecto,filas:FilaCronograma[]):Lectura[] {
 const l:Lectura[]=[],a=k.avance;
 if(a.esperado!==null&&a.realConFecha!==null&&a.variacion!==null){
  const conVar=filas.filter(f=>f.avance.variacion!==null);
  const peores=conVar.filter(f=>f.avance.variacion!<0).sort((x,y)=>x.avance.variacion!-y.avance.variacion!||x.clave.localeCompare(y.clave)).slice(0,2);
  const mejor=[...conVar].sort((x,y)=>y.avance.variacion!-x.avance.variacion!||x.clave.localeCompare(y.clave))[0];
  l.push({titulo:`Avance de ${a.realConFecha} % contra ${a.esperado} % esperado a hoy`,
   texto:a.favorable==='no'
    ?`Faltan ${-a.variacion} puntos. ${peores.length===1?'La etapa más atrasada':'Las etapas más atrasadas'}: ${peores.map(f=>`${f.nombre} (${textoPts(f.avance.variacion!)})`).join(' y ')}.`
    :`Va al día (${textoPts(a.variacion)}).${mejor?` La etapa más adelantada es ${mejor.nombre} (${textoPts(mejor.avance.variacion!)}).`:''}`});
 }
 const vencidas=filas.flatMap(f=>f.vencidas),bloqueadas=filas.flatMap(f=>f.bloqueadas);
 if(vencidas.length||bloqueadas.length){
  const partes=[vencidas.length?plural(vencidas.length,'tarea vencida','tareas vencidas'):'',bloqueadas.length?plural(bloqueadas.length,'bloqueada','bloqueadas'):''].filter(Boolean);
  const urgentes=new Map<string,string>();
  for(const v of [...vencidas].sort((x,y)=>y.diasVencida!-x.diasVencida!)){
   const b=v.item.estado==='bloqueado'?'bloqueada, ':'';urgentes.set(v.item.id,`${v.item.nombre} (${b}vencida hace ${plural(v.diasVencida!,'día','días')})`);
  }
  for(const b of bloqueadas)if(!urgentes.has(b.id))urgentes.set(b.id,`${b.nombre} (bloqueada)`);
  const lista=[...urgentes.values()].slice(0,3);
  l.push({titulo:partes.join(' y '),texto:`Las más urgentes: ${lista.join(', ')}${urgentes.size>3?` y ${urgentes.size-3} más`:''}.`});
 }
 if(k.compras.presupuesto!==null){
  const c=k.compras;
  l.push({titulo:`Compras: ${pesos(c.monto)} ${c.firme?'con precio firme':'estimado'} de ${pesos(c.presupuesto!)} de presupuesto`,
   texto:c.excede?`Se pasa por ${pesos(c.monto-c.presupuesto!)}.`:c.sinPrecio?`${plural(c.sinPrecio,'concepto','conceptos')} sin precio o sin cantidad.`:'Todos los conceptos tienen precio y cantidad.'});
 }
 return l;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/aperturasAkton.test.ts`
Expected: 10 pass. Si solo falla el texto con `$`, ajusta la prueba al formato real de `pesos()` como dice la nota del Step 1.

- [ ] **Step 5: Commit**

```bash
git add lib/aperturasAkton.ts lib/aperturasAkton.test.ts
git commit -m "feat(aperturas): filas del cronograma, indicadores y lectura Akton"
```

---

### Task 3: Franja, lectura y pestañas en la página del proyecto

**Files:**
- Create: `app/aperturas/AktonProyecto.tsx`
- Modify: `app/finanzas/PLAkton.tsx` (cambiar `function Kpi(` por `export function Kpi(`)
- Modify: `app/aperturas/[id]/page.tsx`
- Delete: `app/aperturas/PanelProyecto.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 2 (`indicadoresProyecto`, `filasCronograma`, `lecturaApertura`, `IndicadoresProyecto`, `Lectura`) y `Kpi` de `app/finanzas/PLAkton.tsx` (`{etiqueta:string; valor:ReactNode; pie:ReactNode; tono?:'destacado'|'si'|'no'}`).
- Produces:
  - `IndicadoresProyectoAkton({k}: {k: IndicadoresProyecto})`
  - `LecturaProyecto({lecturas}: {lecturas: Lectura[]})`
  - `PestanasProyecto({id, vista}: {id:string; vista:string})`

- [ ] **Step 1: Create the component**

```tsx
// app/aperturas/AktonProyecto.tsx
import Link from 'next/link';
import {Kpi} from '@/app/finanzas/PLAkton';
import {fechaTexto,pesos} from '@/lib/formato';
import type {IndicadoresProyecto,Lectura} from '@/lib/aperturasAkton';

// Franja y lectura del proyecto en el estilo Akton (docs/diseno/estilo-akton.md). Solo dibuja.
const VISTAS=[['checklist','Checklist'],['calendario','Calendario'],['roadmap','Cronograma'],['actividades','Actividades'],['compras','Equipo y compras'],['tecnico','Validaciones técnicas'],['activos','Activos'],['alertas','Atención']] as const;

export function IndicadoresProyectoAkton({k,objetivo}:{k:IndicadoresProyecto;objetivo:string}) {
 const d=k.dias,a=k.avance;
 const valorDias=d.tipo==='faltan'?d.dias:d.tipo==='hoy'?'Hoy':d.tipo==='abierta'?'Abierta':`−${d.dias}`;
 const pieDias=d.tipo==='vencida'?`Vencida hace ${d.dias} ${d.dias===1?'día':'días'} · objetivo ${fechaTexto(objetivo)}`:`Objetivo: ${fechaTexto(objetivo)}`;
 return <section className="akton-kpis" aria-label="Indicadores de la apertura">
  <Kpi etiqueta="Días para la apertura" tono={d.tipo==='vencida'?'no':'destacado'} valor={valorDias} pie={pieDias}/>
  <Kpi etiqueta="Avance general" tono={a.favorable??undefined} valor={a.real===null?'—':`${a.real} %`}
   pie={a.esperado===null?'Esperado a hoy: sin fechas':`Con fecha: ${a.realConFecha} % · esperado a hoy: ${a.esperado} %`}/>
  <Kpi etiqueta="Tareas vencidas" tono={k.vencidas?'no':undefined} valor={k.vencidas} pie={`De ${k.aplicables} aplicables`}/>
  <Kpi etiqueta="Bloqueadas" tono={k.bloqueadas?'no':undefined} valor={k.bloqueadas} pie={k.bloqueadas?'Ver en Atención':'Sin bloqueos'}/>
  <Kpi etiqueta="Equipo recibido" valor={k.recepcion===null?'—':`${k.recepcion} %`} pie={`${k.recibidas} de ${k.unidades} unidades`}/>
  <Kpi etiqueta={k.compras.firme?'Compras con precio firme':'Compras estimadas'} tono={k.compras.excede?'no':undefined} valor={pesos(k.compras.monto)}
   pie={k.compras.presupuesto===null?'Presupuesto sin definir':`Presupuesto: ${pesos(k.compras.presupuesto)}`}/>
 </section>;
}

export function LecturaProyecto({lecturas}:{lecturas:Lectura[]}) {
 return <>{lecturas.map((l,n)=><section key={n} className="akton-lectura" aria-labelledby={`ap-lectura-${n+1}`}>
  <span className="akton-lectura-numero" aria-hidden="true">{n+1}</span>
  <div><h2 id={`ap-lectura-${n+1}`}>{l.titulo}</h2><p>{l.texto}</p></div>
 </section>)}</>;
}

export function PestanasProyecto({id,vista}:{id:string;vista:string}) {
 return <nav className="akton-pestanas" aria-label="Vistas del proyecto">{VISTAS.map(([v,t])=>
  <Link key={v} href={`/aperturas/${id}?vista=${v}`} aria-current={vista===v?'page':undefined}>{t}</Link>)}</nav>;
}
```

- [ ] **Step 2: Export `Kpi`**

En `app/finanzas/PLAkton.tsx`, cambia `function Kpi({ etiqueta, valor, pie, tono }` por `export function Kpi({ etiqueta, valor, pie, tono }`.

- [ ] **Step 3: Wire the page**

En `app/aperturas/[id]/page.tsx`:
1. Borra `import {PanelProyecto} from '../PanelProyecto';`.
2. Agrega:
   - `import {IndicadoresProyectoAkton,LecturaProyecto,PestanasProyecto} from '../AktonProyecto';`
   - `import {filasCronograma,indicadoresProyecto,lecturaApertura} from '@/lib/aperturasAkton';`
3. Después de calcular `items` y `hoy`, agrega:
   ```ts
   const filas=filasCronograma(items,hoy),kpis=indicadoresProyecto(p,items,hoy);
   ```
4. Reemplaza `<PanelProyecto proyecto={p} items={items} hoy={hoy}/>` y la `<nav className="acciones" aria-label="Vistas del proyecto">…</nav>` que le sigue por:
   ```tsx
   <div className="akton"><IndicadoresProyectoAkton k={kpis} objetivo={p.objetivo_hasta}/><LecturaProyecto lecturas={lecturaApertura(kpis,filas)}/><PestanasProyecto id={id} vista={vista}/></div>
   ```

- [ ] **Step 4: Delete the old panel and add the tabs CSS**

```bash
git rm app/aperturas/PanelProyecto.tsx
```

Al final de `app/globals.css` agrega:

```css
/* Pestañas Akton: selector gris; la activa en negro. */
.akton-pestanas { display:flex; flex-wrap:wrap; gap:4px; padding:4px; background:var(--superficie); border:1px solid var(--linea); border-radius:var(--r-md); }
.akton-pestanas a { padding:6px 12px; border-radius:var(--r-sm); color:var(--tinta-2); text-decoration:none; font-weight:600; font-size:.9rem; }
.akton-pestanas a:hover { background:var(--papel-2); color:var(--tinta); }
.akton-pestanas a[aria-current="page"] { background:var(--tinta); color:var(--blanco); }
```

Busca con `grep -rn "ap-graficas\|ap-distribucion\|ap-leyenda\|\"ap-indicadores\"" app components`. Si ya nada usa `.ap-graficas`, `.ap-distribucion`, `.ap-leyenda` ni `.ap-indicadores`, borra sus reglas de `app/globals.css`. No borres `.ap-indicador` ni `.ap-dona`: todavía los usan Avance por categoría y `ChecklistEditable` (se rediseñan en el PR 2).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add -A app/aperturas app/finanzas/PLAkton.tsx app/globals.css
git commit -m "feat(aperturas): franja, lectura y pestañas con estilo Akton"
```

---

### Task 4: Cronograma: tabla Akton por etapa

**Files:**
- Create: `app/aperturas/Cronograma.tsx`
- Modify: `app/aperturas/[id]/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `FilaCronograma`, `avanceComparado`, `textoPts` (Task 1–2), `ESTADOS` (`lib/aperturas.ts`).
- Produces: `Cronograma({filas, total, base}: {filas: FilaCronograma[]; total: Avance; base: string})`

- [ ] **Step 1: Create the component**

```tsx
// app/aperturas/Cronograma.tsx
import Link from 'next/link';
import {Fragment} from 'react';
import {ESTADOS} from '@/lib/aperturas';
import {textoPts,type Avance,type FilaCronograma} from '@/lib/aperturasAkton';

const corta=(d:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`)).replace('.','');
const pct=(n:number|null)=>n===null?'—':`${n} %`;
function Var({a}:{a:Avance}) {
 return <span className="akton-var" data-favorable={a.favorable??undefined}>{a.variacion===null?'—':textoPts(a.variacion)}</span>;
}

// Tabla por etapa: real contra esperado a hoy, fechas y avisos al margen. Cada etapa despliega sus tareas.
export function Cronograma({filas,total,base}:{filas:FilaCronograma[];total:Avance;base:string}) {
 return <section className="akton-tabla-marco" aria-labelledby="ap-cronograma">
  <h2 id="ap-cronograma" className="akton-titulo">Cronograma por etapa</h2>
  <p className="akton-subtitulo">Avance real contra lo esperado a hoy según las fechas de cada tarea. Tolerancia: 5 pts.</p>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas">
   <thead><tr><th>Etapa</th><th>Conceptos</th><th>Listos</th><th>Avance</th><th>Esperado</th><th>Var. vs esperado</th><th>Inicio</th><th>Fin</th><th>Notas</th></tr></thead>
   <tbody>{filas.map(f=><Fragment key={f.clave}>
    <tr>
     <td data-label="Etapa"><details className="ap-crono-etapa"><summary><strong>{f.clave} · {f.nombre}</strong></summary>
      {f.tareas.length===0?<p className="akton-subtitulo">Sin tareas con fecha.</p>:<ul className="ap-crono-tareas">{f.tareas.map(t=><li key={t.item.id}>
       <Link href={`${base}/items/${t.item.id}`}>{t.item.nombre}</Link>
       <small>{corta(t.desde)}{t.desde!==t.hasta?` – ${corta(t.hasta)}`:''} · {ESTADOS[t.item.estado]}{t.item.responsable?` · ${t.item.responsable}`:''}</small>
       {t.item.estado==='bloqueado'&&<span className="akton-no">Bloqueada</span>}
       {t.diasVencida!==null&&<span className="akton-no">Vencida hace {t.diasVencida} {t.diasVencida===1?'día':'días'}</span>}
      </li>)}</ul>}
      {f.sinFecha>0&&<p className="akton-subtitulo">{f.sinFecha} sin fecha · <Link href={`${base}?vista=calendario`}>programar en el Calendario</Link></p>}
     </details></td>
     <td data-label="Conceptos">{f.avance.conceptos}</td>
     <td data-label="Listos">{f.avance.listos}</td>
     <td data-label="Avance">{pct(f.avance.real)}</td>
     <td data-label="Esperado" className="akton-pct">{pct(f.avance.esperado)}</td>
     <td data-label="Var. vs esperado"><Var a={f.avance}/></td>
     <td data-label="Inicio">{f.desde?corta(f.desde):'—'}</td>
     <td data-label="Fin">{f.hasta?corta(f.hasta):'—'}</td>
     <td data-label="Notas" className="akton-nota-celda">{f.notas.map(n=><p key={n} className="akton-nota">{n}</p>)}</td>
    </tr>
   </Fragment>)}
   <tr className="akton-subtotal">
    <td data-label="Etapa">Total del proyecto</td><td data-label="Conceptos">{total.conceptos}</td><td data-label="Listos">{total.listos}</td>
    <td data-label="Avance">{pct(total.real)}</td><td data-label="Esperado">{pct(total.esperado)}</td><td data-label="Var. vs esperado"><Var a={total}/></td>
    <td data-label="Inicio">—</td><td data-label="Fin">—</td><td data-label="Notas"/>
   </tr>
   </tbody>
  </table></div>
 </section>;
}
```

- [ ] **Step 2: Wire it into the roadmap view**

En `app/aperturas/[id]/page.tsx`:
- Agrega `import {Cronograma} from '../Cronograma';`.
- En la rama `vista==='roadmap'?<>…`, antes de `<Gantt`, inserta:
  ```tsx
  <Cronograma filas={filas} total={kpis.avance} base={`/aperturas/${id}`}/>
  ```

- [ ] **Step 3: CSS for the expandable stage**

Agrega al final de `app/globals.css`:

```css
/* Cronograma: cada etapa despliega sus tareas dentro de la tabla Akton. */
.ap-crono-etapa summary { cursor:pointer; }
.ap-crono-tareas { list-style:none; padding:0; margin:8px 0 0; display:flex; flex-direction:column; gap:6px; }
.ap-crono-tareas li { display:flex; flex-direction:column; gap:1px; padding-left:12px; border-left:2px solid var(--linea); font-size:.88rem; }
.ap-crono-tareas a { color:var(--tinta); }
.ap-crono-tareas small { color:var(--tinta-2); }
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add app/aperturas/Cronograma.tsx "app/aperturas/[id]/page.tsx" app/globals.css
git commit -m "feat(aperturas): Cronograma por etapa en tabla Akton"
```

---

### Task 5: Gantt en grises

**Files:**
- Modify: `app/aperturas/Gantt.tsx`
- Delete: `app/aperturas/fuenteGantt.ts`
- Modify: `app/aperturas/[id]/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: el mismo `Gantt` actual, sin la prop `colores`.
- Produces: `Gantt({proyecto, items, hoy, pendientes?, personas?, volverA?})`. Se elimina la prop `colores`.

- [ ] **Step 1: Remove color and font from the component**

En `app/aperturas/Gantt.tsx`:
- Borra `import type {CSSProperties} from 'react';` y `import {fuenteGantt} from './fuenteGantt';`.
- En la firma de `Gantt`, quita `colores,` del destructuring y `colores:Record<string,string>;` del tipo.
- Cambia `` <section className={`ap-panel ap-gantt ${fuenteGantt.className}`}> `` por `<section className="akton-tabla-marco ap-gantt">`.
- Cambia `<h2>Cronograma (Gantt)</h2>` por `<h2 className="akton-titulo">Gantt</h2>`.
- Borra la línea `const color=colores[e.clave]??'#64748b',estilo={'--ap-c':color} as CSSProperties;`.
- Cambia `<details key={e.clave} className="ap-gantt-etapa" style={estilo}>` por `<details key={e.clave} className="ap-gantt-etapa">`.
- Cambia el enlace del aviso de sin fecha de `` `${base}?vista=calendario&color=etapa` `` a `` `${base}?vista=calendario` ``.
- Borra el bloque `<div className="ap-gantt-general">…</div>`, porque el avance general ya está en la franja.

```bash
git rm app/aperturas/fuenteGantt.ts
```

- [ ] **Step 2: Stop reading colors for the roadmap**

En `app/aperturas/[id]/page.tsx`:
- Cambia `const colores=vista==='calendario'||vista==='roadmap'?` por `const colores=vista==='calendario'?`.
- En `<Gantt …>`, borra la prop `` colores={Object.fromEntries(gruposCalendario('etapa',colores).map(g=>[g.clave,g.color]))} ``.

- [ ] **Step 3: Replace the pastel CSS with grays**

En `app/globals.css`, borra desde la línea que empieza con `/* Gantt de aperturas:` hasta la regla `.ap-gantt-tbarra:hover { … }` inclusive. Conserva las reglas `.ap-gantt-pendientes`, `.ap-gantt-pendiente*` y `.ap-gantt-asignar*` que van después. Borra también el bloque `@media (max-width:700px) { .ap-gantt-fila …}` que cierra el Gantt pastel. En su lugar pega:

```css
/* Gantt Akton: grises; verde = listo, rojo = vencida o bloqueada, naranja = apertura objetivo. Hoy en negro. */
.ap-gantt { --ap-gantt-izq:minmax(220px,300px); }
.ap-gantt-leyenda { display:flex; flex-wrap:wrap; gap:6px 18px; list-style:none; padding:0; margin:10px 0 8px; font-size:.82rem; color:var(--tinta-2); }
.ap-gantt-leyenda li { display:inline-flex; align-items:center; gap:6px; }
.ap-gantt-ley-hoy { width:2px; height:14px; background:var(--tinta); }
.ap-gantt-ley-objetivo { width:10px; height:10px; border:2px solid var(--accion); transform:rotate(45deg); box-sizing:border-box; }
.ap-gantt-ley-tarea { width:22px; height:10px; border-radius:3px; box-sizing:border-box; }
.ap-gantt-fila { display:grid; grid-template-columns:var(--ap-gantt-izq) minmax(0,1fr); gap:16px; align-items:center; }
.ap-gantt-escala { margin-top:6px; padding-bottom:6px; border-bottom:2px solid var(--tinta); }
.ap-gantt-escala .ap-gantt-linea { height:22px; }
.ap-gantt-escala .ap-gantt-linea > span { position:absolute; top:2px; transform:translateX(2px); font-size:.72rem; text-transform:uppercase; letter-spacing:.04em; color:var(--tinta-2); white-space:nowrap; }
.ap-gantt-hoy-etiqueta { position:absolute; top:0; transform:translateX(-50%); background:var(--tinta); color:var(--blanco); font-size:.72rem; font-weight:700; padding:1px 8px; border-radius:var(--r-sm); z-index:2; }
.ap-gantt-linea { position:relative; height:30px; min-width:0; }
.ap-gantt-guia { position:absolute; top:0; bottom:0; width:1px; background:var(--linea); }
.ap-gantt-hoy { position:absolute; top:-6px; bottom:-6px; width:2px; margin-left:-1px; background:var(--tinta); z-index:2; }
.ap-gantt-objetivo { position:absolute; top:-6px; bottom:-6px; border-left:2px dashed var(--accion); z-index:1; }
.ap-gantt-objetivo::after { content:""; position:absolute; top:50%; left:-7px; width:10px; height:10px; margin-top:-6px; border:2px solid var(--accion); background:var(--superficie); transform:rotate(45deg); }
.ap-gantt-etapa { border-bottom:1px solid var(--linea); }
.ap-gantt-etapa > summary { list-style:none; cursor:pointer; padding:8px 0; }
.ap-gantt-etapa > summary::-webkit-details-marker { display:none; }
.ap-gantt-etapa > summary:hover { background:var(--papel-2); }
.ap-gantt-nombre { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; min-width:0; }
.ap-gantt-nombre > div { display:flex; flex-direction:column; gap:2px; min-width:0; }
.ap-gantt-nombre strong { font-size:.92rem; overflow-wrap:anywhere; }
.ap-gantt-nombre small { color:var(--tinta-2); font-size:.8rem; }
.ap-gantt-num { width:24px; height:24px; border-radius:50%; display:grid; place-items:center; background:var(--tinta); color:var(--blanco); font-weight:700; font-size:.78rem; }
.ap-gantt-pct { font-size:.95rem; font-weight:700; font-variant-numeric:tabular-nums; color:var(--tinta); }
.ap-gantt-avisos { display:flex; flex-wrap:wrap; gap:4px; }
.ap-gantt-avisos em { font-style:normal; font-size:.72rem; font-weight:700; color:var(--alerta-texto); }
.ap-gantt-barra { position:absolute; top:6px; height:18px; min-width:6px; box-sizing:border-box; border-radius:3px; overflow:hidden; background:var(--dato-pista); z-index:1; }
.ap-gantt-barra > i { position:absolute; inset:0 auto 0 0; background:var(--tinta-2); }
.ap-gantt-barra > span { position:absolute; right:8px; top:0; line-height:18px; font-size:.75rem; font-weight:700; color:var(--blanco); mix-blend-mode:difference; }
.ap-gantt-fuera { position:absolute; top:6px; line-height:18px; font-size:.75rem; font-weight:700; color:var(--tinta); z-index:1; white-space:nowrap; }
.ap-gantt-sin { position:absolute; top:6px; left:0; line-height:18px; font-size:.8rem; color:var(--tinta-3); }
.ap-gantt-tareas { padding:0 0 10px; }
.ap-gantt-tarea { padding:3px 0; }
.ap-gantt-tarea .ap-gantt-linea { height:20px; }
.ap-gantt-tarea .ap-gantt-nombre { grid-template-columns:auto minmax(0,1fr); padding-left:34px; }
.ap-gantt-tarea .ap-gantt-nombre a { color:var(--tinta); font-size:.86rem; text-decoration:none; overflow-wrap:anywhere; }
.ap-gantt-tarea .ap-gantt-nombre a:hover { text-decoration:underline; }
.ap-gantt-marca { width:18px; height:18px; border-radius:50%; display:grid; place-items:center; font-size:.7rem; font-weight:700; border:1.5px solid var(--linea-fuerte); color:var(--tinta-2); background:var(--superficie); box-sizing:border-box; }
.ap-gantt-marca[data-marca="listo"] { border-color:var(--cuadra); background:var(--cuadra-fondo); color:var(--cuadra-texto); }
.ap-gantt-marca[data-marca="bloqueado"] { border-color:var(--alerta); background:var(--alerta-fondo); color:var(--alerta-texto); }
.ap-gantt-tbarra { position:absolute; top:3px; height:14px; min-width:8px; box-sizing:border-box; border-radius:3px; z-index:1; font-size:.68rem; font-weight:700; line-height:12px; text-align:center; text-decoration:none; overflow:hidden; }
.ap-gantt-tbarra[data-marca="listo"], .ap-gantt-ley-tarea[data-marca="listo"] { background:var(--cuadra-fondo); border:1px solid var(--cuadra); color:var(--cuadra-texto); }
.ap-gantt-tbarra[data-marca="curso"], .ap-gantt-ley-tarea[data-marca="curso"] { background:var(--linea-fuerte); border:1px solid var(--tinta-3); }
.ap-gantt-tbarra[data-marca="pendiente"], .ap-gantt-ley-tarea[data-marca="pendiente"] { background:var(--superficie); border:1.5px dashed var(--tinta-3); }
.ap-gantt-tbarra[data-marca="bloqueado"], .ap-gantt-ley-tarea[data-marca="bloqueado"], .ap-gantt-tbarra[data-vencida] { background:repeating-linear-gradient(135deg,var(--alerta-fondo) 0 5px,var(--superficie) 5px 10px); border:1.5px solid var(--alerta); }
.ap-gantt-tbarra:hover { filter:brightness(.96); }
@media (max-width:700px) {
 .ap-gantt-fila { grid-template-columns:minmax(0,1fr); gap:6px; }
 .ap-gantt-escala > div:first-child { display:none; }
 .ap-gantt-escala .ap-gantt-linea > span[data-impar] { display:none; }
 .ap-gantt-tarea .ap-gantt-nombre { padding-left:0; }
}
```

Las fichas de pendientes (`.ap-gantt-pendiente`) usan colores propios (`#eef2fb`, `#fdf0e1`, `#e3f4ea`). Cámbialos así:
- base: `background:var(--papel-2); color:var(--tinta-2);`
- en curso/revisión: `background:var(--papel-2); color:var(--tinta);`
- hecho: `background:var(--cuadra-fondo); color:var(--cuadra-texto);`

- [ ] **Step 4: Typecheck, run all tests, commit**

Run: `npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: sin errores de tipos; `fail 0`.

```bash
git add -A app/aperturas "app/aperturas/[id]/page.tsx" app/globals.css
git commit -m "feat(aperturas): Gantt en grises con estilo Akton"
```

---

### Task 6: Guía, revisión visual y PR

**Files:**
- Modify: `docs/diseno/estilo-akton.md`
- Temporal (no se sube): `app/login/prueba-akton/page.tsx`, `.env.local`

- [ ] **Step 1: Update the guide**

En `docs/diseno/estilo-akton.md`, agrega a la tabla «Piezas y clases»:

```markdown
| Pestañas | `.akton-pestanas` | Cambiar de vista dentro de un tablero. Fondo blanco con borde; la activa en negro (`aria-current="page"`). |
| Gantt | `.akton-tabla-marco.ap-gantt` | Barras grises con el avance en gris oscuro. Verde solo para tareas listas y rojo para vencidas o bloqueadas. Hoy va en negro y la fecha objetivo en naranja. |
```

Y agrega al final de «Reglas de cálculo»:

```markdown
- **Aperturas, avance esperado a hoy** (`lib/aperturasAkton.ts`): cada concepto con fechas espera 0 antes de su
  inicio, 1 después de su fin y la parte proporcional en medio (incluye hoy). La variación compara real y esperado
  de los mismos conceptos con fecha. Es favorable si queda ≥ −5 pts (`TOLERANCIA_AVANCE`).
```

- [ ] **Step 2: Visual check with sample data**

Crea `.env.local` con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=prueba-local`. Crea `app/login/prueba-akton/page.tsx`. La ruta `/login` no pide sesión. La página arma ~15 `ItemApertura` de ejemplo en las 7 etapas: algunas vencidas, una bloqueada, equipo con cantidad y precio, y un proyecto con `presupuesto`. Después renderiza:

```tsx
<div className="akton"><IndicadoresProyectoAkton k={kpis} objetivo={p.objetivo_hasta}/><LecturaProyecto lecturas={lecturaApertura(kpis,filas)}/><PestanasProyecto id="demo" vista="roadmap"/></div>
<Cronograma filas={filas} total={kpis.avance} base="/aperturas/demo"/>
<Gantt proyecto={p} items={items} hoy={hoy}/>
```

Arranca el servidor con `preview_start` (entrada `gantt-aperturas` del `launch.json` de la sesión, apuntada a `wt-aperturas-akton` y puerto 3109). Revisa en escritorio y en 375 px:
- La franja tiene 6 tarjetas: Días en naranja, Avance en verde o rojo, y vencidas y bloqueadas en rojo.
- Hay 3 lecturas numeradas.
- Las pestañas son grises y la activa negra.
- La tabla tiene la variación coloreada, las notas al margen y el total en durazno.
- El Gantt está en gris, con Hoy en negro y la fecha objetivo en naranja.
- En celular la tabla pasa a tarjetas y no hay desplazamiento horizontal.

Después borra `app/login/prueba-akton`, `.env.local` y `.next`, y detén el servidor.

- [ ] **Step 3: Final checks and commit**

Run: `rm -rf .next && npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: sin errores; `fail 0`.

```bash
git add docs/diseno/estilo-akton.md
git commit -m "docs(diseno): pestañas, Gantt y avance esperado en la guía Akton"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/aperturas-akton
"/c/Program Files/GitHub CLI/gh.exe" pr create --repo HelperHolding/dodo-money --head feat/aperturas-akton --base main --title "feat(aperturas): estilo Akton en el proyecto (franja, lectura, Cronograma y Gantt)" --body-file <archivo con resumen, verificación y la línea 🤖 Generated with [Claude Code](https://claude.com/claude-code)>
```

Revisa el diff completo del PR (`gh pr diff`). Espera a que pasen `Historial válido` y `Pruebas y tipos`, y no integres sin el visto bueno de Sebastián.
