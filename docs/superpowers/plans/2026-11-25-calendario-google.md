# Calendario de aperturas estilo Google · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Calendario de cada apertura se ve y se usa como Google Calendar:
- panel izquierdo plegable, con «+ Programar tarea», mini mes, responsables con casilla de color y «Solo actividades»;
- barra con Hoy, ‹ › y Mes/Semana;
- vista Mes con barras de varios días, punto + nombre para un día y «N más» en tarjeta flotante;
- vista Semana en columnas.

**Architecture:** La lógica nueva va en `lib/aperturasCalendario.ts`, en funciones puras con pruebas. `Calendario.tsx` queda como orquestador (estado, URL, `localStorage`, ventanas) y delega el dibujo en `PanelCalendario.tsx`, `VistaMes.tsx`, `VistaSemana.tsx` y `TarjetaDia.tsx`. Las ventanas actuales `Dia` y `Tarea`, la acción `fijarFechasApertura` y la agenda de celular se conservan.

**Tech Stack:** Next.js 15, React client components, CSS global, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-estilo-google-calendar-design.md` (PR 2).

## Global Constraints

- **Color por responsable (opción A).** `COLORES_PERSONA = ['#e67c73','#f4511e','#f6bf26','#33b679','#0b8043','#039be5','#3f51b5','#7986cb','#8e24aa','#616161']`, sin el tomate. `SIN_ASIGNAR.color = '#a0a0a0'`.
- **Estado sobre el color:**
  - listo → tachado, opacidad .55;
  - alerta (vencida o bloqueada) → contorno 2 px `--alerta` y «!» antes del nombre;
  - normal → sin marca.

  Usa `tonoConcepto(i, hoy)`.
- **Modos:** solo `'mes' | 'semana'`. `modo=cuadros` o `barras` (enlaces viejos) caen a `mes`, que es el predeterminado.
- Semanas de **lunes a domingo**, como ya lo hace la app (`semanasCalendario`, `semanaDe`).
- **Almacenamiento** (todo en try/catch, porque sin almacenamiento funciona igual):
  - `localStorage('calPanel')`: `'plegado' | 'abierto'`.
  - `localStorage('calOcultos:<proyecto>')`: JSON de claves ocultas.
- **Enlaces viejos:** `resp=<clave>` muestra solo a esa persona al cargar.
- El estado se nombra con `nombreEstado(i)` (`lib/aperturas.ts`), no con `ESTADOS[...]`. La prueba `tests/aperturasEtapasVista.test.mjs` exige `nombreEstado(` en `Calendario.tsx`.
- En celular (≤ 700 px) el panel es cajón y la vista es la agenda de tarjetas. No debe haber desplazamiento lateral.
- **Excepción Akton:** se anota en `docs/diseno/estilo-akton.md` que el Calendario usa color por responsable.
- Rama `feat/calendario-google` en el worktree `wt-calendario-google`. Sin migración.

## Review Focus

1. **Todas las personas ocultas:** la vista dice «Ocultaste a todos los responsables. Marca alguno en el panel» y no queda en blanco (Task 4).
2. **`localStorage` con claves de personas que ya no existen o con JSON roto:** se ignoran y no truena (Task 1, `leerOcultos`).
3. **Tarea de un día contra tarea de varios días que empieza el último día de la semana:** la primera va como punto y la segunda como barra recortada con esquina recta (Task 1 y Task 2).
4. **«N más» en un día con 5 o más tareas:** la tarjeta flotante lista todas y se cierra con Esc y con ✕ (Task 2).
5. **Semana que cruza meses o años** («29 dic – 4 ene 2027»): el título y la navegación ‹ › son correctos (Task 1).

---

### Task 1: Lógica nueva del calendario

**Files:** `lib/aperturasCalendario.ts`, `lib/aperturasCalendario.test.ts`

**Interfaces (Produces):**
- `type ModoCalendario = 'mes'|'semana'`
- `esModoCalendario(v): v is ModoCalendario`
- `modoCalendario(v: unknown): ModoCalendario` (cualquier otro valor → `'mes'`)
- `COLORES_PERSONA` (10 colores)
- `SIN_ASIGNAR.color = '#a0a0a0'`
- `miniMes(mes: string): Celda[][]` (siempre 6 semanas)
- `esDeUnDia(i: Pick<ItemCalendario,'inicio'|'fin'>): boolean`
- `filtrarOcultos<T extends Pick<ItemCalendario,'responsable'>>(items: T[], ocultos: ReadonlySet<string>): T[]`
- `conteoPorPersona(items: Pick<ItemCalendario,'responsable'|'inicio'|'fin'|'estado'>[], desde: string, hasta: string): Record<string, number>`
- `ocultasPorDia(barras: Barra<unknown>[], semana: Celda[], limite: number): number[]`
- `tituloPeriodo(modo: ModoCalendario, mes: string, semana: string): string`
- `leerOcultos(texto: string|null, claves: readonly string[]): Set<string>`

- [ ] **Step 1: Failing tests** (agregar a `lib/aperturasCalendario.test.ts`; amplía el import de la línea 65 con `COLORES_PERSONA, conteoPorPersona, esDeUnDia, esModoCalendario, filtrarOcultos, leerOcultos, miniMes, modoCalendario, ocultasPorDia, tituloPeriodo, barrasSemana, semanasCalendario`; si alguno ya se importaba en otra línea, no lo repitas):

```ts
test('calendario google: modos mes y semana, con los viejos cayendo a mes',()=>{
 assert.ok(esModoCalendario('mes'));assert.ok(esModoCalendario('semana'));assert.ok(!esModoCalendario('cuadros'));
 assert.equal(modoCalendario('cuadros'),'mes');assert.equal(modoCalendario('barras'),'mes');assert.equal(modoCalendario(undefined),'mes');assert.equal(modoCalendario('semana'),'semana');
});
test('calendario google: paleta sin el rojo de alerta y sin asignar en gris',()=>{
 assert.equal(COLORES_PERSONA.length,10);assert.ok(!COLORES_PERSONA.includes('#d50000'));
 assert.equal(SIN_ASIGNAR.color,'#a0a0a0');
});
test('calendario google: el mini mes siempre tiene 6 semanas',()=>{
 for(const m of ['2026-02','2026-11','2027-01'])assert.equal(miniMes(m).length,6);
 const f=miniMes('2026-02');assert.equal(f[0][0].dia,'2026-01-26');assert.ok(f.every(s=>s.length===7));
});
test('calendario google: tareas de un día y de varios días',()=>{
 assert.ok(esDeUnDia({inicio:'2026-11-05',fin:'2026-11-05'}));assert.ok(esDeUnDia({inicio:null,fin:'2026-11-05'}));
 assert.ok(!esDeUnDia({inicio:'2026-11-05',fin:'2026-11-06'}));
});
test('calendario google: ocultar personas y contar por persona en el periodo',()=>{
 const t=(responsable:string|null,inicio:string|null,fin:string|null,estado='pendiente')=>({responsable,inicio,fin,estado});
 const items=[t('Ana Ruiz','2026-11-02','2026-11-04'),t('ana ruiz','2026-11-20','2026-11-20'),t(null,'2026-11-03','2026-11-03'),t('Luis','2026-12-01','2026-12-02'),t('Luis','2026-11-05','2026-11-05','no_aplica')];
 assert.deepEqual(filtrarOcultos(items,new Set(['sin'])).length,4);
 assert.deepEqual(conteoPorPersona(items,'2026-11-01','2026-11-30'),{'ana ruiz':2,sin:1});
});
test('calendario google: ocultos guardados se leen con cuidado',()=>{
 assert.deepEqual([...leerOcultos('["ana ruiz","fantasma"]',['ana ruiz','sin'])],['ana ruiz']);
 assert.deepEqual([...leerOcultos('{roto',['ana ruiz'])],[]);
 assert.deepEqual([...leerOcultos(null,['ana ruiz'])],[]);
 assert.deepEqual([...leerOcultos('"texto"',['ana ruiz'])],[]);
});
test('calendario google: «N más» por día con 4 renglones',()=>{
 const semana=semanasCalendario('2026-11')[1];
 const items=Array.from({length:6},(_,n)=>({nombre:`T${n}`,inicio:'2026-11-03',fin:'2026-11-03'}));
 const {barras}=barrasSemana(items,semana);
 assert.deepEqual(ocultasPorDia(barras,semana,4),[0,2,0,0,0,0,0]);
});
test('calendario google: título del periodo, también cruzando año',()=>{
 assert.equal(tituloPeriodo('mes','2026-11','2026-11-23'),'noviembre de 2026');
 assert.equal(tituloPeriodo('semana','2026-12','2026-12-28'),'28 dic – 3 ene 2027');
});
```

Nota: si `nombreMes('2026-11')` devuelve otro formato (por ejemplo «noviembre 2026»), ajusta solo el texto esperado de la prueba. Lo mismo con `tituloSemana` en el último caso. No cambies esas funciones.

- [ ] **Step 2:** Run `node --experimental-strip-types --test lib/aperturasCalendario.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** en `lib/aperturasCalendario.ts`:

```ts
// Reemplaza la línea de ModoCalendario/esModoCalendario:
export type ModoCalendario = 'mes'|'semana';
export const esModoCalendario = (v:unknown):v is ModoCalendario => v==='mes'||v==='semana';
// Enlaces viejos (cuadros, barras) y vacío caen a Mes, como Google.
export const modoCalendario = (v:unknown):ModoCalendario => v==='semana'?'semana':'mes';

// Reemplaza SIN_ASIGNAR y COLORES_PERSONA:
export const SIN_ASIGNAR = {clave:'sin',nombre:'Sin asignar',color:'#a0a0a0'} as const;
// Paleta tipo Google Calendar; sin el tomate (#d50000) para no confundirse con el rojo de alerta.
export const COLORES_PERSONA = ['#e67c73','#f4511e','#f6bf26','#33b679','#0b8043','#039be5','#3f51b5','#7986cb','#8e24aa','#616161'];

// Al final del archivo:
// ── Estilo Google Calendar ──
// Mini mes del panel: siempre 6 semanas, para que no salte de alto.
export function miniMes(mes:string):Celda[][] {
 const s=semanasCalendario(mes);
 while(s.length<6){const ult=s.at(-1)!.at(-1)!.dia;s.push(Array.from({length:7},(_,i)=>({dia:moverDias(ult,i+1),delMes:false})));}
 return s;
}
export const esDeUnDia = (i:Pick<ItemCalendario,'inicio'|'fin'>) => {const r=rangoItem(i);return r!==null&&r.desde===r.hasta;};
export const filtrarOcultos = <T extends Pick<ItemCalendario,'responsable'>>(items:T[],ocultos:ReadonlySet<string>) => items.filter(i=>!ocultos.has(clavePersona(i.responsable)));
// Tareas visibles de cada persona en el periodo (para el número junto a su casilla).
export function conteoPorPersona(items:Pick<ItemCalendario,'responsable'|'inicio'|'fin'|'estado'>[],desde:string,hasta:string):Record<string,number> {
 const r:Record<string,number>={};
 for(const i of items){if(!enCalendario(i))continue;const g=rangoItem(i)!;if(g.desde>hasta||g.hasta<desde)continue;const c=clavePersona(i.responsable);r[c]=(r[c]??0)+1;}
 return r;
}
// Cuántas barras no caben en cada día de la semana (para «N más»).
export const ocultasPorDia = (barras:Barra<unknown>[],semana:Celda[],limite:number) =>
 semana.map((_,col)=>barras.filter(b=>b.carril>=limite&&b.col<=col&&col<b.col+b.span).length);
export const tituloPeriodo = (modo:ModoCalendario,mes:string,semana:string) => modo==='mes'?nombreMes(mes):tituloSemana(semanaDe(semana));
// Personas ocultas guardadas en el navegador: JSON de claves; se ignora lo roto y quien ya no está.
export function leerOcultos(texto:string|null,claves:readonly string[]):Set<string> {
 try{const v=JSON.parse(texto??'[]');return new Set(Array.isArray(v)?v.filter((c):c is string=>typeof c==='string'&&claves.includes(c)):[]);}catch{return new Set();}
}
```

Ajusta `Barra` si hace falta para aceptar `Barra<unknown>[]`; ya es genérico en `T`.

- [ ] **Step 4:** Run las pruebas. Expected: PASS (las existentes también; `conteoDia` se conserva porque tiene prueba). Luego corre `npx tsc --noEmit`. Expected: errores **solo** en `Calendario.tsx` y `page.tsx` por `'cuadros'`/`'barras'`. Las Tasks 4 y 5 los resuelven. Si quieres compilar aquí, cambia temporalmente en `page.tsx` `esModoCalendario(f.modo)?f.modo:'cuadros'` por `modoCalendario(f.modo)`.
- [ ] **Step 5: Commit** `feat(aperturas): lógica del calendario estilo Google`.

### Task 2: Vista Mes y tarjeta «N más»

**Files:** Create `app/aperturas/VistaMes.tsx`, `app/aperturas/TarjetaDia.tsx`

**Interfaces:**
- `VistaMes({mes, hoy, items, colorDe, tono, abrirDia, abrirItem, abrirMas}: {mes:string; hoy:string; items:ItemCalendario[]; colorDe:(i:ItemCalendario)=>string; tono:(i:ItemCalendario)=>TonoConcepto; abrirDia:(dia:string)=>void; abrirItem:(i:ItemCalendario)=>void; abrirMas:(dia:string, ancla:DOMRect)=>void})`
- `TarjetaDia({dia, ancla, items, colorDe, tono, abrirItem, cerrar}: {dia:string; ancla:DOMRect; items:ItemCalendario[]; colorDe; tono; abrirItem; cerrar:()=>void})`

- [ ] **Step 1: `VistaMes.tsx`**

```tsx
"use client";
import {nombreEstado} from '@/lib/aperturas';
import {barrasSemana,esDeUnDia,ocultasPorDia,rangoItem,semanasCalendario,textoSobre,type ItemCalendario} from '@/lib/aperturasCalendario';
import type {TonoConcepto} from '@/lib/aperturasAkton';

const DIAS=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'],LIMITE=4;
const fechaLarga=(d:string)=>new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));

// Mes como Google Calendar: barras de color para lo de varios días, punto + nombre para lo de un día, «N más» si no cabe.
export function VistaMes({mes,hoy,items,colorDe,tono,abrirDia,abrirItem,abrirMas}:{mes:string;hoy:string;items:ItemCalendario[];colorDe:(i:ItemCalendario)=>string;tono:(i:ItemCalendario)=>TonoConcepto;abrirDia:(dia:string)=>void;abrirItem:(i:ItemCalendario)=>void;abrirMas:(dia:string,ancla:DOMRect)=>void}) {
 return <div className="ap-gcal-mes" role="grid" aria-label="Mes">
  <div className="ap-gcal-mes-cabeza" role="row">{DIAS.map(d=><span key={d} role="columnheader">{d}</span>)}</div>
  {semanasCalendario(mes).map(semana=>{
   const {barras}=barrasSemana(items,semana),ocultas=ocultasPorDia(barras,semana,LIMITE);
   return <div key={semana[0].dia} className="ap-gcal-semana" role="row" style={{gridTemplateRows:`28px repeat(${LIMITE},22px) 22px`}}>
    {semana.map((c,col)=><div key={c.dia} role="gridcell" className="ap-gcal-dia" data-fuera={!c.delMes||undefined} style={{gridColumn:col+1,gridRow:'1 / -1'}}>
     <button type="button" className="ap-gcal-num" data-hoy={c.dia===hoy||undefined} aria-label={fechaLarga(c.dia)} onClick={()=>abrirDia(c.dia)}>{Number(c.dia.slice(8))}</button>
    </div>)}
    {barras.filter(b=>b.carril<LIMITE).map(b=>{const i=b.item,color=colorDe(i),t=tono(i),uno=esDeUnDia(i)&&b.span===1;
     return <button key={i.id} type="button" className={uno?'ap-gcal-punto':'ap-gcal-barra'} data-tono={t}
      data-antes={b.empiezaAntes||undefined} data-despues={b.sigueDespues||undefined}
      style={{gridColumn:`${b.col+1} / span ${b.span}`,gridRow:b.carril+2,...(uno?{'--ap-c':color}:{background:color,color:textoSobre(color)})} as React.CSSProperties}
      title={`${i.nombre} · ${nombreEstado(i)}${i.responsable?` · ${i.responsable}`:''}`} onClick={()=>abrirItem(i)}>
      {uno&&<span className="ap-gcal-bolita" aria-hidden="true"/>}{t==='alerta'&&<b aria-label="Atención">!</b>}<span>{i.nombre}</span>
     </button>;})}
    {ocultas.map((n,col)=>n>0&&<button key={col} type="button" className="ap-gcal-mas" style={{gridColumn:col+1,gridRow:LIMITE+2}}
     onClick={e=>abrirMas(semana[col].dia,e.currentTarget.getBoundingClientRect())}>{n} más</button>)}
   </div>;
  })}
 </div>;
}
export const unDiaEn = (i:ItemCalendario,dia:string) => {const r=rangoItem(i);return r!==null&&r.desde<=dia&&dia<=r.hasta;};
```

- [ ] **Step 2: `TarjetaDia.tsx`**

```tsx
"use client";
import {useEffect,useRef} from 'react';
import {Icono} from '@/components/Icono';
import {nombreEstado} from '@/lib/aperturas';
import {cubreDia,esDeUnDia,type ItemCalendario} from '@/lib/aperturasCalendario';
import type {TonoConcepto} from '@/lib/aperturasAkton';

// Tarjeta flotante del día («N más»), como Google: día y número grandes, lista completa; se cierra con ✕ o Esc.
export function TarjetaDia({dia,ancla,items,colorDe,tono,abrirItem,cerrar}:{dia:string;ancla:DOMRect;items:ItemCalendario[];colorDe:(i:ItemCalendario)=>string;tono:(i:ItemCalendario)=>TonoConcepto;abrirItem:(i:ItemCalendario)=>void;cerrar:()=>void}) {
 const caja=useRef<HTMLDivElement>(null);
 useEffect(()=>{const t=(e:KeyboardEvent)=>{if(e.key==='Escape')cerrar();};window.addEventListener('keydown',t);caja.current?.focus();return ()=>window.removeEventListener('keydown',t);},[cerrar]);
 const del=items.filter(i=>cubreDia(i,dia)).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es-MX'));
 const ancho=260,izq=Math.max(8,Math.min(ancla.left+ancla.width/2-ancho/2,window.innerWidth-ancho-8)),arriba=Math.max(8,Math.min(ancla.top-120,window.innerHeight-420));
 const d=new Date(`${dia}T00:00:00Z`);
 return <div ref={caja} tabIndex={-1} role="dialog" aria-label={`Tareas del ${dia}`} className="ap-gcal-tarjeta" style={{left:izq,top:arriba,width:ancho}}>
  <button type="button" className="ap-gcal-tarjeta-cerrar" aria-label="Cerrar" onClick={cerrar}><Icono nombre="cerrar" tamano={18}/></button>
  <p className="ap-gcal-tarjeta-dia">{new Intl.DateTimeFormat('es-MX',{weekday:'short',timeZone:'UTC'}).format(d).replace('.','').toUpperCase()}</p>
  <p className="ap-gcal-tarjeta-num">{d.getUTCDate()}</p>
  <ul>{del.map(i=>{const c=colorDe(i),t=tono(i);return <li key={i.id}><button type="button" data-tono={t} onClick={()=>{cerrar();abrirItem(i);}} title={nombreEstado(i)}>
   <span className={esDeUnDia(i)?'ap-gcal-bolita':'ap-gcal-tira'} style={{background:c}} aria-hidden="true"/>{t==='alerta'&&<b>!</b>}<span>{i.nombre}</span></button></li>;})}</ul>
 </div>;
}
```

- [ ] **Step 3:** `npx tsc --noEmit` (puede seguir fallando solo por `Calendario.tsx`/`page.tsx`). **Commit** `feat(aperturas): vista Mes y tarjeta del día estilo Google`.

### Task 3: Vista Semana y panel izquierdo

**Files:** Create `app/aperturas/VistaSemana.tsx`, `app/aperturas/PanelCalendario.tsx`

**Interfaces:**
- `VistaSemana({semana, hoy, items, personas, colorDe, tono, abrirDia, abrirItem}: {semana:string; hoy:string; items:ItemCalendario[]; personas:Persona[]; colorDe; tono; abrirDia:(d:string)=>void; abrirItem:(i:ItemCalendario)=>void})`
- `PanelCalendario({proyecto, hoy, modo, mes, semana, personas, ocultos, conteo, todos, edita, irA, alternar, enlaceTipos, programar}: {proyecto:string; hoy:string; modo:ModoCalendario; mes:string; semana:string; personas:Persona[]; ocultos:ReadonlySet<string>; conteo:Record<string,number>; todos:boolean; edita:boolean; irA:(dia:string)=>void; alternar:(clave:string)=>void; enlaceTipos:string; programar:()=>void})`

- [ ] **Step 1: `VistaSemana.tsx`**

```tsx
"use client";
import {nombreEstado} from '@/lib/aperturas';
import {clavePersona,MOMENTOS,momentoEnDia,semanaDe,textoSobre,type ItemCalendario,type Persona} from '@/lib/aperturasCalendario';
import type {TonoConcepto} from '@/lib/aperturasAkton';

const DIAS=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
// Semana como los eventos de «todo el día» de Google: 7 columnas, cada tarea en cada día que ocupa, sin límite.
export function VistaSemana({semana,hoy,items,personas,colorDe,tono,abrirDia,abrirItem}:{semana:string;hoy:string;items:ItemCalendario[];personas:Persona[];colorDe:(i:ItemCalendario)=>string;tono:(i:ItemCalendario)=>TonoConcepto;abrirDia:(d:string)=>void;abrirItem:(i:ItemCalendario)=>void}) {
 const ini=new Map(personas.map(p=>[p.clave,p.iniciales]));
 return <div className="ap-gcal-sem" role="grid" aria-label="Semana">{semanaDe(semana).map((c,k)=>{
  const del=items.map(i=>({i,m:momentoEnDia(i,c.dia)})).filter(x=>x.m!==null).sort((a,b)=>a.i.nombre.localeCompare(b.i.nombre,'es-MX'));
  return <div key={c.dia} className="ap-gcal-sem-col" data-hoy={c.dia===hoy||undefined} role="gridcell">
   <button type="button" className="ap-gcal-sem-cabeza" onClick={()=>abrirDia(c.dia)} aria-label={`Abrir ${c.dia}`}>
    <span>{DIAS[k]}</span><b data-hoy={c.dia===hoy||undefined}>{Number(c.dia.slice(8))}</b></button>
   {del.map(({i,m})=>{const color=colorDe(i),t=tono(i);return <button key={i.id} type="button" className="ap-gcal-bloque" data-tono={t}
    style={{background:color,color:textoSobre(color)}} title={`${i.nombre} · ${nombreEstado(i)}`} onClick={()=>abrirItem(i)}>
    <strong>{t==='alerta'&&'! '}{i.nombre}</strong><small>{ini.get(clavePersona(i.responsable))??'—'} · {MOMENTOS[m!]}</small></button>;})}
  </div>;})}</div>;
}
```

- [ ] **Step 2: `PanelCalendario.tsx`**

```tsx
"use client";
import Link from 'next/link';
import {useState} from 'react';
import {miniMes,moverMesTexto,nombreMes,semanaDe,type ModoCalendario,type Persona} from '@/lib/aperturasCalendario';

const INI=['L','M','M','J','V','S','D'];
// Panel izquierdo como Google: programar, mini mes, responsables con casilla de color y qué mostrar.
export function PanelCalendario({hoy,modo,mes,semana,personas,ocultos,conteo,todos,edita,irA,alternar,enlaceTipos,programar}:{proyecto:string;hoy:string;modo:ModoCalendario;mes:string;semana:string;personas:Persona[];ocultos:ReadonlySet<string>;conteo:Record<string,number>;todos:boolean;edita:boolean;irA:(dia:string)=>void;alternar:(clave:string)=>void;enlaceTipos:string;programar:()=>void}) {
 const [mini,setMini]=useState(mes);
 const visibles=new Set(modo==='semana'?semanaDe(semana).map(c=>c.dia):[]);
 return <aside className="ap-gcal-panel" aria-label="Panel del calendario">
  {edita&&<button type="button" className="ap-gcal-crear" onClick={programar}><span aria-hidden="true">＋</span> Programar tarea</button>}
  <div className="ap-gcal-mini">
   <div className="ap-gcal-mini-barra"><strong>{nombreMes(mini)}</strong>
    <button type="button" aria-label="Mes anterior" onClick={()=>setMini(moverMesTexto(mini,-1))}>‹</button>
    <button type="button" aria-label="Mes siguiente" onClick={()=>setMini(moverMesTexto(mini,1))}>›</button></div>
   <div className="ap-gcal-mini-rejilla" role="grid">
    {INI.map((d,k)=><span key={k} className="ap-gcal-mini-ini">{d}</span>)}
    {miniMes(mini).flat().map(c=><button key={c.dia} type="button" onClick={()=>irA(c.dia)}
     data-fuera={!c.delMes||undefined} data-hoy={c.dia===hoy||undefined} data-visible={(modo==='semana'?visibles.has(c.dia):c.dia.startsWith(mes)&&c.delMes&&mini===mes)||undefined}
     aria-label={c.dia}>{Number(c.dia.slice(8))}</button>)}
   </div>
  </div>
  <h3 className="ap-gcal-panel-titulo">Responsables</h3>
  <ul className="ap-gcal-personas">{personas.map(p=><li key={p.clave}><label>
   <input type="checkbox" checked={!ocultos.has(p.clave)} onChange={()=>alternar(p.clave)} style={{'--ap-c':p.color} as React.CSSProperties}/>
   <span>{p.nombre}</span><small>{conteo[p.clave]??0}</small></label></li>)}</ul>
  <h3 className="ap-gcal-panel-titulo">Mostrar</h3>
  <Link className="ap-gcal-mostrar" href={enlaceTipos} aria-pressed={!todos}><span className="ap-gcal-check" data-activo={!todos||undefined} aria-hidden="true"/>Solo actividades</Link>
 </aside>;
}
```

`data-visible` en el mini mes, para que sea legible: en Semana se marcan los 7 días visibles; en Mes, los días del mes visible, cuando el mini mes muestra ese mismo mes.

- [ ] **Step 3:** **Commit** `feat(aperturas): vista Semana y panel del calendario estilo Google`.

### Task 4: Orquestador, página y CSS

**Files:** Rewrite el componente principal de `app/aperturas/Calendario.tsx` (conserva `Ventana`, `useGuardar`, `formulario`, `Dia` y `Tarea`, y borra `Cuadros` y `Semana`). Modify `app/aperturas/[id]/page.tsx`, `app/globals.css`, `docs/diseno/estilo-akton.md`. Test: `tests/calendarioGoogle.test.mjs` (y agrégalo a `package.json`).

- [ ] **Step 1: Failing guard test** `tests/calendarioGoogle.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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
```

Run it and confirm FAIL.

- [ ] **Step 2: Orquestador.** En `Calendario.tsx`, reemplaza la función `Calendario` (de `export function Calendario` hasta su cierre) por:

```tsx
export function Calendario({proyecto,items,modo,mes,semana,persona,todos,hoy,edita}:Props) {
 const [abierta,setAbierta]=useState<Abierta>(null);
 const [mas,setMas]=useState<{dia:string;ancla:DOMRect}|null>(null);
 const [panel,setPanel]=useState(true),[cajon,setCajon]=useState(false);
 const personas=useMemo(()=>personasDe(items.filter(enCalendario)),[items]);
 const claves=useMemo(()=>personas.map(p=>p.clave),[personas]);
 const porClave=useMemo(()=>new Map(personas.map(p=>[p.clave,p])),[personas]);
 const personaDe=(i:ItemCalendario)=>porClave.get(clavePersona(i.responsable));
 const [ocultos,setOcultos]=useState<Set<string>>(new Set());
 // Ocultos guardados por proyecto; con ?resp= de un enlace viejo, solo esa persona.
 useEffect(()=>{
  try{setPanel(localStorage.getItem('calPanel')!=='plegado');}catch{}
  if(persona&&claves.includes(persona)){setOcultos(new Set(claves.filter(c=>c!==persona)));return;}
  try{setOcultos(leerOcultos(localStorage.getItem(`calOcultos:${proyecto}`),claves));}catch{}
 },[proyecto,persona,claves]);
 const alternar=(clave:string)=>setOcultos(prev=>{const n=new Set(prev);if(n.has(clave))n.delete(clave);else n.add(clave);
  try{localStorage.setItem(`calOcultos:${proyecto}`,JSON.stringify([...n]));}catch{}return n;});
 const alternarPanel=()=>{
  if(window.matchMedia('(max-width: 700px)').matches){setCajon(c=>!c);return;}
  setPanel(p=>{try{localStorage.setItem('calPanel',p?'plegado':'abierto');}catch{}return !p;});
 };
 const tono=(i:ItemCalendario):TonoConcepto=>tonoConcepto(i,hoy);
 const colorDe=(i:ItemCalendario)=>personaDe(i)?.color??SIN_ASIGNAR.color;
 const delTipo=useMemo(()=>items.filter(i=>todos||esActividad(i)),[items,todos]);
 const visibles=useMemo(()=>filtrarOcultos(delTipo.filter(enCalendario),ocultos),[delTipo,ocultos]);
 const dias7=semanaDe(semana),periodo=modo==='semana'?{desde:dias7[0].dia,hasta:dias7[6].dia}:{desde:`${mes}-01`,hasta:`${mes}-31`};
 const conteo=useMemo(()=>conteoPorPersona(filtrarOcultos(delTipo,new Set()),periodo.desde,periodo.hasta),[delTipo,periodo.desde,periodo.hasta]);
 const delPeriodo=visibles.filter(i=>{const r=rangoItem(i)!;return r.desde<=periodo.hasta&&r.hasta>=periodo.desde;}).sort((a,b)=>rangoItem(a)!.desde.localeCompare(rangoItem(b)!.desde)||a.nombre.localeCompare(b.nombre));
 const sinFecha=delTipo.filter(i=>i.estado!=='no_aplica'&&!rangoItem(i)).length;
 const enlace=(cambios:Record<string,string>)=>{const q=new URLSearchParams({vista:'calendario',modo,mes,semana,tipos:todos?'todos':'',...cambios});for(const [k,v] of [...q.entries()])if(!v)q.delete(k);return `/aperturas/${proyecto}?${q}`;};
 const irA=(dia:string)=>{location.assign(modo==='semana'?enlace({semana:semanaDe(dia)[0].dia,mes:dia.slice(0,7)}):enlace({mes:dia.slice(0,7),semana:semanaDe(dia)[0].dia}));};
 const paso=(n:number)=>modo==='semana'?enlace({semana:moverDias(dias7[0].dia,7*n),mes:moverDias(dias7[0].dia,7*n+3).slice(0,7)}):enlace({mes:moverMesTexto(mes,n),semana:semanaDe(`${moverMesTexto(mes,n)}-01`)[0].dia});
 const todosOcultos=personas.length>0&&personas.every(p=>ocultos.has(p.clave));
 const etiqueta=(i:ItemCalendario)=>{const p=personaDe(i);return p&&p.clave!=='sin'?`${p.iniciales} · ${i.nombre}`:i.nombre;};
 void etiqueta;
 return <section className="seccion ap-gcal" data-panel={panel?'abierto':'plegado'} data-cajon={cajon||undefined}>
  <div className="ap-gcal-barra">
   <button type="button" className="ap-gcal-menu" aria-label={panel?'Plegar panel':'Mostrar panel'} aria-expanded={panel} onClick={alternarPanel}><Icono nombre="menu" tamano={22}/></button>
   <Link className="ap-gcal-hoy" href={enlace({mes:hoy.slice(0,7),semana:semanaDe(hoy)[0].dia})}>Hoy</Link>
   <Link className="ap-gcal-flecha" href={paso(-1)} aria-label="Anterior">‹</Link>
   <Link className="ap-gcal-flecha" href={paso(1)} aria-label="Siguiente">›</Link>
   <h2 className="ap-gcal-titulo">{tituloPeriodo(modo,mes,semana)}</h2>
   <div className="ap-gcal-modo" role="group" aria-label="Vista">
    <Link href={enlace({modo:'mes'})} aria-current={modo==='mes'||undefined}>Mes</Link>
    <Link href={enlace({modo:'semana'})} aria-current={modo==='semana'||undefined}>Semana</Link>
   </div>
  </div>
  <div className="ap-gcal-cuerpo">
   {cajon&&<button type="button" className="ap-gcal-velo" aria-label="Cerrar panel" onClick={()=>setCajon(false)}/>}
   <PanelCalendario proyecto={proyecto} hoy={hoy} modo={modo} mes={mes} semana={semana} personas={personas} ocultos={ocultos} conteo={conteo} todos={todos} edita={edita}
    irA={irA} alternar={alternar} enlaceTipos={enlace({tipos:todos?'':'todos'})} programar={()=>setAbierta({tipo:'dia',dia:hoy>=periodo.desde&&hoy<=periodo.hasta?hoy:periodo.desde})}/>
   <div className="ap-gcal-vista">
    {sinFecha>0&&<p className="ap-nota">{sinFecha} {sinFecha===1?'tarea sin fecha':'tareas sin fecha'}.{edita?' Prográmalas con «+ Programar tarea».':''}</p>}
    {todosOcultos?<p className="aviso">Ocultaste a todos los responsables. Marca alguno en el panel.</p>
    :modo==='mes'?<VistaMes mes={mes} hoy={hoy} items={visibles} colorDe={colorDe} tono={tono} abrirDia={dia=>setAbierta({tipo:'dia',dia})} abrirItem={item=>setAbierta({tipo:'item',item})} abrirMas={(dia,ancla)=>setMas({dia,ancla})}/>
    :<VistaSemana semana={semana} hoy={hoy} items={visibles} personas={personas} colorDe={colorDe} tono={tono} abrirDia={dia=>setAbierta({tipo:'dia',dia})} abrirItem={item=>setAbierta({tipo:'item',item})}/>}
    {/* En celular: tarjetas del periodo en orden, con el color de su responsable. */}
    <div className="ap-cal-agenda">
     {delPeriodo.length===0?<p className="ap-nota">Sin tareas programadas {modo==='semana'?'esta semana':'este mes'}.</p>:<ul>{delPeriodo.map(i=><li key={i.id}><button type="button" data-tono={tono(i)} style={{borderLeftColor:colorDe(i)}} onClick={()=>setAbierta({tipo:'item',item:i})}>
      <strong>{tono(i)==='alerta'&&'! '}{i.nombre}</strong><small>{rangoTexto(i)} · {nombreEstado(i)} · {personaDe(i)?.nombre??'Sin asignar'}</small><small>{grupoTexto(i)}</small></button></li>)}</ul>}
    </div>
   </div>
  </div>
  {mas&&<TarjetaDia dia={mas.dia} ancla={mas.ancla} items={visibles} colorDe={colorDe} tono={tono} abrirItem={item=>setAbierta({tipo:'item',item})} cerrar={()=>setMas(null)}/>}
  <Ventana grande={abierta?.tipo==='dia'} abierta={abierta!==null} alCerrar={()=>setAbierta(null)} titulo={abierta?.tipo==='dia'?fechaLarga(abierta.dia):abierta?.tipo==='item'?abierta.item.nombre:''}>
   {abierta?.tipo==='dia'&&<Dia dia={abierta.dia} items={items} visibles={visibles} personas={personas} proyecto={proyecto} tono={tono} edita={edita} abrir={item=>setAbierta({tipo:'item',item})} listo={()=>setAbierta(null)}/>}
   {abierta?.tipo==='item'&&<Tarea item={abierta.item} persona={personaDe(abierta.item)} proyecto={proyecto} edita={edita} listo={()=>setAbierta(null)}/>}
  </Ventana>
 </section>;
}
```

Borra `void etiqueta;` y `etiqueta` si quedan sin uso. Ajusta los imports del archivo:
- de `@/lib/aperturasCalendario`: `SIN_ASIGNAR`, `clavePersona`, `conteoPorPersona`, `cubreDia`, `diaPorPersona`, `enCalendario`, `esActividad`, `filtrarOcultos`, `leerOcultos`, `MOMENTOS`, `moverDias`, `moverMesTexto`, `personasDe`, `rangoItem`, `semanaDe`, `tituloPeriodo`, y los tipos `ItemCalendario`, `ModoCalendario`, `Persona`;
- `Link` (ya existe), `PanelCalendario`, `VistaMes`, `VistaSemana`, `TarjetaDia`.

Borra lo que quede sin uso: `CARRILES`, `CHIPS`, `DIAS`, `barrasSemana`, `conteoDia`, `semanasCalendario`, `tituloSemana`, `nombreMes`, `useRouter`. Borra las funciones `Cuadros` y `Semana`.

- [ ] **Step 3: Página.** En `app/aperturas/[id]/page.tsx`:
  - cambia `modo=esModoCalendario(f.modo)?f.modo:'cuadros'` por `modo=modoCalendario(f.modo)`;
  - ajusta el import (`modoCalendario` en vez de `esModoCalendario`).

- [ ] **Step 4: CSS.** Al final de `app/globals.css`:

```css
/* ─── Calendario de aperturas estilo Google Calendar ─── */
.ap-gcal { padding:0; overflow:hidden; }
.ap-gcal-barra { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid var(--linea); }
.ap-gcal-menu, .ap-gcal-flecha { display:inline-grid; place-items:center; width:38px; height:38px; border-radius:50%; border:0; background:transparent; color:var(--tinta-2); font-size:1.4rem; text-decoration:none; cursor:pointer; }
.ap-gcal-menu:hover, .ap-gcal-flecha:hover { background:var(--papel-2); color:var(--tinta); }
.ap-gcal-hoy { padding:7px 18px; border:1px solid var(--linea-fuerte); border-radius:999px; color:var(--tinta); text-decoration:none; font-weight:600; }
.ap-gcal-hoy:hover { background:var(--papel-2); }
.ap-gcal-titulo { margin:0 0 0 6px; font-size:1.35rem; font-weight:500; }
.ap-gcal-titulo::first-letter { text-transform:uppercase; }
.ap-gcal-modo { margin-left:auto; display:inline-flex; border:1px solid var(--linea-fuerte); border-radius:999px; overflow:hidden; }
.ap-gcal-modo a { padding:7px 16px; color:var(--tinta); text-decoration:none; font-weight:600; font-size:.9rem; }
.ap-gcal-modo a[aria-current] { background:var(--accion-tinte); color:var(--accion-oscuro); }
.ap-gcal-cuerpo { display:grid; grid-template-columns:248px minmax(0,1fr); }
.ap-gcal[data-panel="plegado"] .ap-gcal-cuerpo { grid-template-columns:minmax(0,1fr); }
.ap-gcal[data-panel="plegado"] .ap-gcal-panel { display:none; }
.ap-gcal-panel { padding:14px 12px; border-right:1px solid var(--linea); display:flex; flex-direction:column; gap:10px; min-width:0; }
.ap-gcal-crear { align-self:flex-start; display:inline-flex; align-items:center; gap:10px; padding:12px 20px; border:0; border-radius:16px; background:var(--superficie); color:var(--tinta); font:inherit; font-weight:600; box-shadow:0 1px 3px rgb(0 0 0 / .2), 0 2px 8px rgb(0 0 0 / .08); cursor:pointer; }
.ap-gcal-crear span { font-size:1.3rem; color:var(--accion); }
.ap-gcal-mini-barra { display:flex; align-items:center; gap:4px; font-size:.9rem; }
.ap-gcal-mini-barra strong { flex:1; font-weight:600; }
.ap-gcal-mini-barra strong::first-letter { text-transform:uppercase; }
.ap-gcal-mini-barra button { width:28px; height:28px; border:0; border-radius:50%; background:transparent; color:var(--tinta-2); cursor:pointer; }
.ap-gcal-mini-rejilla { display:grid; grid-template-columns:repeat(7,1fr); text-align:center; font-size:.72rem; }
.ap-gcal-mini-ini { color:var(--tinta-3); padding:4px 0; }
.ap-gcal-mini-rejilla button { aspect-ratio:1; border:0; border-radius:50%; background:transparent; color:var(--tinta); font:inherit; cursor:pointer; }
.ap-gcal-mini-rejilla button[data-fuera] { color:var(--tinta-3); }
.ap-gcal-mini-rejilla button[data-visible] { background:var(--accion-tinte); }
.ap-gcal-mini-rejilla button[data-hoy] { background:var(--accion); color:#fff; font-weight:700; }
.ap-gcal-mini-rejilla button:hover { outline:1px solid var(--linea-fuerte); }
.ap-gcal-panel-titulo { margin:6px 0 0; font-size:.85rem; font-weight:600; }
.ap-gcal-personas { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
.ap-gcal-personas label { display:flex; align-items:center; gap:10px; padding:5px 6px; border-radius:6px; cursor:pointer; font-size:.88rem; }
.ap-gcal-personas label:hover { background:var(--papel-2); }
.ap-gcal-personas span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ap-gcal-personas small { color:var(--tinta-3); font-variant-numeric:tabular-nums; }
.ap-gcal-personas input { appearance:none; width:18px; height:18px; margin:0; border-radius:3px; border:2px solid var(--ap-c); background:transparent; display:grid; place-items:center; cursor:pointer; flex:none; }
.ap-gcal-personas input:checked { background:var(--ap-c); }
.ap-gcal-personas input:checked::after { content:"✓"; color:#fff; font-size:.75rem; font-weight:800; line-height:1; }
.ap-gcal-mostrar { display:flex; align-items:center; gap:10px; padding:5px 6px; color:var(--tinta); text-decoration:none; font-size:.88rem; border-radius:6px; }
.ap-gcal-mostrar:hover { background:var(--papel-2); }
.ap-gcal-check { width:18px; height:18px; border-radius:3px; border:2px solid var(--tinta-2); display:grid; place-items:center; }
.ap-gcal-check[data-activo] { background:var(--tinta-2); }
.ap-gcal-check[data-activo]::after { content:"✓"; color:var(--superficie); font-size:.75rem; font-weight:800; }
.ap-gcal-vista { min-width:0; padding:0 0 10px; }
.ap-gcal-vista > .ap-nota, .ap-gcal-vista > .aviso { margin:10px 12px; }
.ap-gcal-mes-cabeza, .ap-gcal-semana { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
.ap-gcal-mes-cabeza span { padding:6px 0 2px; text-align:center; font-size:.7rem; font-weight:600; color:var(--tinta-2); border-left:1px solid var(--linea); }
.ap-gcal-mes-cabeza span:first-child, .ap-gcal-dia:first-child { border-left:0; }
.ap-gcal-semana { min-height:132px; row-gap:2px; border-bottom:1px solid var(--linea); }
.ap-gcal-dia { border-left:1px solid var(--linea); display:flex; justify-content:center; padding-top:4px; }
.ap-gcal-dia[data-fuera] .ap-gcal-num { color:var(--tinta-3); }
.ap-gcal-num { width:26px; height:26px; border:0; border-radius:50%; background:transparent; color:var(--tinta); font:inherit; font-size:.8rem; font-weight:600; cursor:pointer; }
.ap-gcal-num:hover { background:var(--papel-2); }
.ap-gcal-num[data-hoy] { background:var(--accion); color:#fff; }
.ap-gcal-barra-x, .ap-gcal-barra, .ap-gcal-punto { position:relative; z-index:1; margin:0 4px; min-width:0; height:20px; border:0; border-radius:4px; padding:0 6px; font:inherit; font-size:.76rem; font-weight:600; line-height:20px; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; display:flex; align-items:center; gap:5px; }
.ap-gcal-barra[data-antes] { margin-left:0; border-top-left-radius:0; border-bottom-left-radius:0; }
.ap-gcal-barra[data-despues] { margin-right:0; border-top-right-radius:0; border-bottom-right-radius:0; }
.ap-gcal-punto { background:transparent; color:var(--tinta); font-weight:500; }
.ap-gcal-punto:hover, .ap-gcal-barra:hover { filter:brightness(.95); background-color:var(--papel-2); }
.ap-gcal-barra:hover { background-color:inherit; }
.ap-gcal-bolita { width:8px; height:8px; border-radius:50%; background:var(--ap-c); flex:none; }
.ap-gcal-tira { width:14px; height:8px; border-radius:2px; flex:none; }
:is(.ap-gcal-barra, .ap-gcal-punto, .ap-gcal-bloque, .ap-gcal-tarjeta li button)[data-tono="listo"] span, .ap-gcal-bloque[data-tono="listo"] strong { text-decoration:line-through; }
:is(.ap-gcal-barra, .ap-gcal-punto, .ap-gcal-bloque)[data-tono="listo"] { opacity:.55; }
:is(.ap-gcal-barra, .ap-gcal-bloque)[data-tono="alerta"] { box-shadow:inset 0 0 0 2px var(--alerta); }
:is(.ap-gcal-barra, .ap-gcal-punto, .ap-gcal-tarjeta li button) b { font-weight:800; }
.ap-gcal-punto[data-tono="alerta"] b, .ap-gcal-tarjeta li button[data-tono="alerta"] b { color:var(--alerta-texto); }
.ap-gcal-mas { margin:0 4px; border:0; background:transparent; color:var(--tinta); font:inherit; font-size:.76rem; font-weight:600; text-align:left; padding:0 6px; border-radius:4px; cursor:pointer; }
.ap-gcal-mas:hover { background:var(--papel-2); }
.ap-gcal-tarjeta { position:fixed; z-index:60; background:var(--superficie-solida); color:var(--tinta); border-radius:12px; box-shadow:0 4px 24px rgb(0 0 0 / .28); padding:14px 12px 10px; max-height:400px; overflow:auto; outline:none; }
.ap-gcal-tarjeta-cerrar { position:absolute; top:8px; right:8px; width:30px; height:30px; border:0; border-radius:50%; background:transparent; color:var(--tinta-2); cursor:pointer; }
.ap-gcal-tarjeta-dia { margin:0; text-align:center; font-size:.72rem; font-weight:600; color:var(--tinta-2); }
.ap-gcal-tarjeta-num { margin:0 0 8px; text-align:center; font-size:1.8rem; }
.ap-gcal-tarjeta ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
.ap-gcal-tarjeta li button { width:100%; display:flex; align-items:center; gap:8px; padding:4px 6px; border:0; border-radius:4px; background:transparent; color:var(--tinta); font:inherit; font-size:.82rem; text-align:left; cursor:pointer; }
.ap-gcal-tarjeta li button:hover { background:var(--papel-2); }
.ap-gcal-tarjeta li button > span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ap-gcal-sem { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); min-height:320px; }
.ap-gcal-sem-col { border-left:1px solid var(--linea); padding:0 4px 8px; display:flex; flex-direction:column; gap:4px; min-width:0; }
.ap-gcal-sem-col:first-child { border-left:0; }
.ap-gcal-sem-col[data-hoy] { background:color-mix(in srgb, var(--accion) 4%, transparent); }
.ap-gcal-sem-cabeza { display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 0; border:0; background:transparent; color:var(--tinta-2); font:inherit; cursor:pointer; }
.ap-gcal-sem-cabeza span { font-size:.7rem; font-weight:600; }
.ap-gcal-sem-cabeza b { width:42px; height:42px; display:grid; place-items:center; border-radius:50%; font-size:1.5rem; font-weight:500; color:var(--tinta); }
.ap-gcal-sem-cabeza b[data-hoy] { background:var(--accion); color:#fff; }
.ap-gcal-bloque { display:flex; flex-direction:column; gap:1px; padding:4px 6px; border:0; border-radius:6px; font:inherit; text-align:left; cursor:pointer; min-width:0; }
.ap-gcal-bloque strong { font-size:.78rem; overflow-wrap:anywhere; }
.ap-gcal-bloque small { font-size:.7rem; opacity:.9; }
.ap-gcal-velo { display:none; }
html[data-luz="noche"] :is(.ap-gcal-barra[style], .ap-gcal-bloque, .ap-gcal-personas input:checked) { filter:brightness(.85); }
.ap-gcal .ap-cal-agenda { display:none; }
@media (max-width:700px) {
 .ap-gcal-cuerpo { grid-template-columns:minmax(0,1fr); }
 .ap-gcal-panel { display:none; }
 .ap-gcal[data-cajon] .ap-gcal-panel { display:flex; position:fixed; top:0; left:0; bottom:0; z-index:45; width:min(280px,85vw); background:var(--superficie-solida); overflow:auto; box-shadow:0 0 24px rgb(0 0 0 / .3); }
 .ap-gcal[data-cajon] .ap-gcal-velo { display:block; position:fixed; inset:0; z-index:44; border:0; background:rgb(0 0 0 / .45); }
 .ap-gcal-mes, .ap-gcal-sem { display:none; }
 .ap-gcal .ap-cal-agenda { display:block; padding:0 10px; }
 .ap-gcal-titulo { font-size:1.1rem; }
 .ap-gcal-modo { margin-left:0; }
}
```

Borra las reglas `.ap-cuadros*`, `.ap-cuadro*` y `.ap-cal-semana[data-larga]`, que ya no se usan. Conserva `.ap-cal-agenda*`, `.ap-cal-modal*`, `.ap-dia-*` y `.ap-cal-sub`, porque las usan la ventana del día y la agenda. Antes de borrar otras `.ap-cal-*` (`.ap-cal-barra`, `.ap-cal-mes`, `.ap-cal-selector`, `.ap-cal-leyenda`, `.ap-cal-rejilla`, `.ap-cal-dias`, `.ap-cal-semana`, `.ap-cal-dia`, `.ap-cal-tarea`, `.ap-cal-mas`, `.ap-cal-filtros`, `.ap-cal-campo`, `.ap-cal-casilla`, `.ap-cal-muestra`), revisa con `grep -rn` en `app` y `components` que nada más las use.

- [ ] **Step 5: Guía.** En `docs/diseno/estilo-akton.md`, debajo de la regla de verde y rojo en Aperturas, agrega:
  ```
     Excepción: el Calendario de aperturas usa color por responsable (estilo Google Calendar); el estado va encima
     (listo tachado, vencido o bloqueado con borde rojo y «!»).
  ```
- [ ] **Step 6:** Corre `node --test tests/calendarioGoogle.test.mjs tests/aperturasEtapasVista.test.mjs`, luego `node --experimental-strip-types --test lib/aperturasCalendario.test.ts` y `npx tsc --noEmit`. Expected: todo PASS. Agrega `tests/calendarioGoogle.test.mjs` al `package.json`. **Commit** `feat(aperturas): Calendario estilo Google Calendar`.

### Task 5: Revisión visual, revisión final y PR

- [ ] Página temporal `app/login/prueba-calendario/page.tsx` (no se sube) con `<Calendario>` y ~20 tareas de ejemplo: 5 personas, una sin asignar, tareas de un día y de varios, 6 en un mismo día, una vencida, una bloqueada y una lista. Revisa con `preview_start` en día y noche, a 1300 px y 375 px:
  - Mes y Semana;
  - ocultar y mostrar personas, y recargar (se recuerda);
  - ocultar a todos;
  - «N más» con Esc y ✕;
  - mini mes;
  - plegar el panel;
  - cajón en celular;
  - sin desplazamiento lateral.
- [ ] Borra lo temporal y `.next`. Corre `npx tsc --noEmit && npm test`.
- [ ] Revisión final con un revisor nuevo (modelo más capaz) y el Review Focus. Corrige lo Critical/Important con prueba en rojo y luego en verde.
- [ ] Integra `origin/main` si avanzó y abre el PR (línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Espera los checks y no integres sin el visto bueno de Sebastián.
