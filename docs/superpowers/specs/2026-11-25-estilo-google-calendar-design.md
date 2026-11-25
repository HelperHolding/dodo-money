# Menú lateral con tema y Calendario de aperturas estilo Google Calendar — diseño

Fecha: 2026-11-25 · Pidió: Sebastián · Estado: por revisar

## Objetivo

Tomar de Google Calendar tres ideas:

- **Organización del calendario:** panel izquierdo con mini mes y calendarios con casilla, y vistas Mes y Semana limpias.
- **Responsables como «calendarios»** con su color.
- **Menú lateral que sigue el tema** de día y de noche, y que se **pliega**.

Son dos cambios independientes y se entregan en **2 PR**:

1. Menú lateral con tema y plegable (toda la app).
2. Calendario de aperturas estilo Google.

Ninguno lleva migración.

## Decisiones tomadas

1. **Color por responsable (opción A).**
   - Cada persona tiene su color en la casilla del panel, el punto y la barra.
   - El estado se marca encima del color:
     - **lista:** tachada y atenuada;
     - **vencida o bloqueada:** borde rojo (`--alerta`) y «!»;
     - **pendiente o en curso:** normal.
   - Es una **excepción documentada** a la regla Akton de color, que se anota en `docs/diseno/estilo-akton.md`. El resto de Aperturas sigue en grises.
2. **Se elimina la vista Cuadros.** Quedan **Mes** y **Semana**.
3. **Semana sin horas.** Las tareas solo tienen fecha, así que la semana son 7 columnas con las tareas apiladas, como los eventos de «todo el día» de Google.
4. **Dos plegados independientes:** el menú de la app y el panel del calendario. Cada uno tiene su botón ☰ y el navegador recuerda su estado.

## PR 1 · Menú lateral con tema y plegable

### Tema

Hoy el menú lateral es negro siempre (`.lateral { background: var(--tinta) }` en globals.css y `#000` en marca.css). Pasa a usar tokens que cambian con `html[data-luz]`:

| Token nuevo | Día | Noche |
|---|---|---|
| `--menu-fondo` | `var(--papel-2)` (beige) | `#121212` |
| `--menu-texto` | `var(--tinta)` | `var(--tinta)` (beige de noche) |
| `--menu-texto-2` | `var(--tinta-2)` | `var(--tinta-2)` |
| `--menu-linea` | `var(--linea)` | `var(--linea)` |
| `--menu-hover` | `rgb(0 0 0 / .05)` | `rgb(255 255 255 / .06)` |
| `--menu-activo-fondo` | `var(--accion-tinte)` | `var(--accion-tinte)` |
| `--menu-activo-texto` | `var(--accion-oscuro)` | `var(--accion-oscuro)` |

- **Área activa:** píldora redondeada (`border-radius: 999px` en el lado derecho) con fondo `--menu-activo-fondo`, texto `--menu-activo-texto` y peso 700. Ya no lleva el borde izquierdo naranja ni el fondo negro.
- **Borde derecho del menú:** 1 px `--menu-linea`, en lugar de los 4 px naranjas.
- Iconos, títulos de sección, buscador, interruptor de luz, contadores y pie usan los tokens nuevos. El contador urgente sigue en rojo.
- **Franja móvil y barra inferior** también siguen el tema, porque hoy son negras.

### Plegable

- **Botón ☰** («Plegar menú» / «Mostrar menú», con `aria-expanded`):
  - en la cabecera del menú, a la izquierda del logo;
  - y, cuando el menú está plegado, un botón fijo arriba a la izquierda del contenido para volver a mostrarlo.
- **Estado:** `html[data-menu="plegado"]`, guardado en `localStorage('menu')`.
  - `app/layout.tsx` lo aplica antes de pintar, igual que `LUZ`, para que no parpadee.
  - Si el almacenamiento falla, vale solo para esa visita.
- **Plegado:** `.marco` pasa de `264px minmax(0,1fr)` a `0 minmax(0,1fr)` y `.lateral` se oculta (`visibility:hidden`), con transición de 200 ms.
- **Celular (≤ el breakpoint actual del cajón):** no cambia. El menú sigue siendo cajón con ☰ y barra inferior, y `data-menu` se ignora.
- Componente: `MenuLateral.tsx` suma el botón y la lógica. Se agrega `components/BotonMenu.tsx` si hace falta reutilizarlo en el contenido.

### Pruebas y verificación

- Prueba de guardia (`tests/menuLateralTema.test.mjs`):
  - el CSS del menú no usa colores fijos de fondo (`#000`, `var(--tinta)` como fondo);
  - existen los tokens `--menu-*` en día y noche;
  - `layout.tsx` aplica `data-menu` antes de pintar;
  - `MenuLateral` tiene el botón con `aria-expanded`.
- Revisión visual en día y noche, con el menú desplegado y plegado, a 1300 px y 375 px.

## PR 2 · Calendario de aperturas estilo Google

### Estructura (`app/aperturas/Calendario.tsx`)

```
┌ barra: [☰] [Hoy] [‹] [›]  noviembre 2026                [Mes ▾ / Semana] ┐
├ panel izquierdo ─────────┬ vista ─────────────────────────────────────────┤
│ [+ Programar tarea]      │  DOM  LUN  MAR  MIÉ  JUE  VIE  SÁB             │
│ mini mes ‹ ›             │  ...                                           │
│ Responsables             │                                                │
│  ☑ ■ Ana Ruiz            │                                                │
│  ☑ ■ Julio Pérez         │                                                │
│  ☐ ■ Sin asignar         │                                                │
│ Mostrar                  │                                                │
│  ☑ Solo actividades      │                                                │
└──────────────────────────┴────────────────────────────────────────────────┘
```

- **Barra:**
  - **Hoy** lleva al mes o la semana de hoy.
  - **‹ ›** mueven un mes o una semana según la vista.
  - El título va en grande: «noviembre 2026» o «23 – 29 nov 2026».
  - El **selector** es Mes / Semana.
  - El **☰** pliega el panel izquierdo (estado en `localStorage('calPanel')`).
- **Panel izquierdo:**
  - **«+ Programar tarea»** (solo quien edita) abre la ventana actual del día de hoy, con la búsqueda de tareas sin fecha.
  - **Mini mes:**
    - es de 6 semanas, con ‹ › propios;
    - hoy va en un círculo naranja;
    - el día o la semana visible va resaltado;
    - el clic en un día lleva a su mes (en vista Mes) o a su semana (en vista Semana).
  - **Responsables:** las personas con tareas en el proyecto, más «Sin asignar», cada una con su **casilla de color**.
    - Desmarcar oculta sus tareas en las dos vistas.
    - Lo oculto se guarda en `localStorage('calOcultos:<proyecto>')`.
    - Al lado del nombre va el número de tareas visibles en el periodo.
  - **Mostrar:** «Solo actividades», como hoy (parámetro `tipos`).
- **Celular (≤ 700 px):**
  - el panel se abre como cajón con ☰;
  - la vista Mes queda como hoy en celular: **agenda de tarjetas** del periodo, con el borde del color de la persona y las marcas de estado;
  - la vista Semana se ve como lista por día.

### Vista Mes

- Cuadrícula de 6 semanas × 7 días, sin bordes gruesos y con líneas `--linea`.
  - El número del día va arriba al centro, como en Google.
  - Hoy va en un círculo naranja.
  - Los días de otros meses van en gris.
- **Tareas de varios días:** barra de color que cruza los días, reutilizando `barrasSemana` con sus carriles.
  - Fondo: el color de la persona. Texto: `textoSobre(color)`.
  - Si empieza antes o sigue después de la semana, la esquina va recta.
- **Tareas de un día:** **punto de color + nombre** en una línea, sin fondo, como los eventos con hora en Google.
- **Hasta 4 renglones por día.** Si hay más, «N más» abre una **tarjeta flotante**:
  - cerca del día, con el día de la semana y el número en grande;
  - con la lista completa (punto o barra corta + nombre);
  - se cierra con ✕ o Esc.
- Clic en el número del día: abre la ventana del día actual (programar y lista agrupada).
- Clic en una tarea: abre la ventana actual de la tarea (cambiar fechas o abrir el detalle).

### Vista Semana

- **Encabezado de 7 columnas:** día de la semana en versalitas y número grande; hoy en círculo naranja.
- En cada columna, las tareas de ese día apiladas sin límite:
  - cada una es un bloque con el color de la persona, nombre, iniciales del responsable y estado;
  - las de varios días se repiten en cada día con «continúa» o «termina» (`MOMENTOS`), en vez de barras que cruzan columnas;
  - así no se amontonan en columnas angostas.
- La columna de hoy lleva un fondo muy tenue.

### Estado sobre el color

- **Lista** (`tonoConcepto==='listo'`): texto tachado y opacidad .55.
- **Alerta** (vencida o bloqueada): contorno de 2 px `--alerta` y un «!» antes del nombre, en `--alerta-texto` sobre fondo claro o blanco sobre barra.
- **Normal:** sin marca.

### Paleta de personas

`COLORES_PERSONA` pasa del pastel a una paleta parecida a la de Google, legible en día y noche:

```
#d50000 (tomate), #e67c73 (flamenco), #f4511e (mandarina), #f6bf26 (plátano), #33b679 (salvia),
#0b8043 (albahaca), #039be5 (pavo real), #3f51b5 (arándano), #7986cb (lavanda), #8e24aa (uva), #616161 (grafito)
```

- Asignación estable por orden, como hoy.
- **«Sin asignar»** va en grafito claro (`#a0a0a0`).
- **Evitar choque con la alerta:** el tomate (`#d50000`) se parece al rojo de alerta, así que **se excluye de la paleta**. Quedan 10 colores.
- En noche, las barras bajan la luminosidad con `filter: brightness(.85)`, para que no deslumbren sobre fondo negro.

### Lo que se retira

- Vista **Cuadros** (`Cuadros`, `conteoDia`, `.ap-cuadros*`) y el modo `cuadros` de `ModoCalendario`.
  - El parámetro viejo `modo=cuadros` cae a Mes.
  - `modo=barras` también cae a Mes, porque Mes reemplaza a «Barras del mes».
  - La vista por defecto pasa a ser Mes.
- La leyenda de colores de arriba y el filtro «Responsable» de lista desplegable, porque los reemplazan las casillas.
  - El parámetro `resp` (enlaces viejos) sigue funcionando: muestra solo a esa persona al cargar.

### Arquitectura

- **Lógica pura nueva**, en `lib/aperturasCalendario.ts` y con pruebas:
  - `miniMes(mes)`: 6 semanas.
  - `renglonesDia(barras, dia, limite)`: cuántos se ven y cuántos van en «N más».
  - `esDeUnDia(item)`.
  - `filtrarOcultos(items, ocultos)`.
  - `conteoPorPersona(items, periodo)`.
  - `tituloPeriodo(modo, mes, semana)`.
- **Se reutilizan:** `barrasSemana`, `semanasCalendario`, `semanaDe`, `personasDe`, `clavePersona`, `tonoConcepto`, `textoSobre`, `MOMENTOS`, `diaPorPersona`, y las ventanas `Dia` y `Tarea`.
- `Calendario.tsx` se divide para no pasar de ~250 líneas:
  - `PanelCalendario.tsx`: botón, mini mes, responsables y mostrar.
  - `VistaMes.tsx`.
  - `VistaSemana.tsx`.
  - `TarjetaDia.tsx`: la tarjeta flotante de «N más».
  - `Calendario.tsx` queda como orquestador: estado, URL, almacenamiento y ventanas.

### Pruebas y verificación

- `lib/aperturasCalendario.test.ts`:
  - mini mes que siempre da 6 semanas;
  - «N más» con 4 renglones;
  - tarea de un día contra varios días;
  - ocultos por clave (incluye «sin»);
  - conteo por persona dentro del periodo;
  - título de semana que cruza meses o años;
  - `modo` viejo (`cuadros`/`barras`) que cae a `mes`.
- **Revisión visual** con datos de ejemplo en día y noche, Mes y Semana, panel desplegado y plegado, «N más» abierto, a 1300 px y 375 px. Sin desplazamiento lateral.

## Errores y casos límite

- **Persona con nombre escrito distinto** («Julio» y «julio »): `clavePersona` ya las une.
- **Todas las personas ocultas:** la vista dice «Ocultaste a todos los responsables. Marca alguno en el panel».
- **Proyecto sin tareas con fecha:** «Sin tareas programadas este periodo» y el botón «+ Programar tarea».
- **`localStorage` bloqueado:** todo funciona, solo que no se recuerda el estado.
- **Muchas personas (más de 10):** los colores se repiten en ciclo, y las iniciales y los nombres las distinguen.
