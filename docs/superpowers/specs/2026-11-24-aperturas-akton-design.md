# Aperturas con estilo Akton — diseño

Fecha: 2026-11-24 · Pidió: Sebastián · Estado: por revisar

## Objetivo

Que el módulo de Aperturas se lea como el P&L **Contra meta**: primero los números, luego una lectura calculada
de qué está pasando y al final el detalle como respaldo. Se usan las piezas `.akton-*` y las reglas de
`docs/diseno/estilo-akton.md`. No cambian datos, permisos ni cálculos existentes. Solo es nuevo el
**avance esperado a hoy** y las lecturas.

## Decisiones tomadas

1. **Akton estricto en color (opción A).**
   - Naranja (`--accion`): solo lo destacado (días para la apertura, fecha objetivo) y alertas.
   - Verde (`--cuadra`) y rojo (`--alerta`): solo para "va bien / va mal". Avance contra esperado, vencidas, bloqueadas y terminadas.
   - Todo lo demás va en negro y grises.
   - Se quitan los colores por etapa, categoría y responsable del Gantt y del Calendario, y el botón «Colores».
2. La tabla `apertura_colores` y `guardar_color_apertura` se quedan en la base **sin uso**. No hay migración.
3. La letra DM Sans del Gantt (`fuenteGantt.ts`) se retira. Akton usa la tipografía de la app, como el P&L.
4. "Roadmap" se llama **"Cronograma"**. Se conserva `vista=roadmap` en la URL para no romper enlaces.
5. Entrega en **3 PR**, en el orden de la sección "Entregas".

## Cálculo nuevo: avance esperado a hoy

Vive en `lib/aperturasAkton.ts`, en funciones puras con pruebas en `lib/aperturasAkton.test.ts`.

- **Conceptos que cuentan:** los mismos del avance (`cuentaEnAvance` de `lib/aperturasGantt.ts`), sin no aplica ni equipo/referencias por validar.
- **Esperado de un concepto con fechas:** usa su rango (`rangoItem`).
  - 0 si `hoy < desde`.
  - 1 si `hoy > hasta`.
  - Si está en medio: `(días transcurridos incluyendo hoy) / (días del rango)`.
- **Conceptos sin fecha:** no entran al esperado. Sí entran al real, como hoy.
- **Esperado de una etapa o del proyecto:** promedio del esperado de sus conceptos con fecha. Sin conceptos con fecha → `null`.
- **Real comparable:** para comparar peras con peras, la variación usa el real de **los mismos conceptos con fecha**:
  - Listos con fecha / conceptos con fecha.
  - El real general que se muestra sigue siendo el de todos los conceptos.
- **Variación** = real comparable − esperado, en puntos.
  - `favorable = 'si'` si la variación es ≥ −5 pp.
  - `'no'` si es menor.
  - Sin esperado → sin tono.
  - El umbral de 5 pp es la constante `TOLERANCIA_AVANCE`.

## Parte 1 · Proyecto: franja y lectura (PR 1)

Contenedor `.akton` en `/aperturas/[id]`. Reemplaza las 4 tarjetas de `PanelProyecto` y las dos donas.

**Franja `.akton-kpis`** (6 indicadores):

| Indicador | Valor | Pie | Tono |
|---|---|---|---|
| Días para la apertura | días hasta `objetivo_hasta` (o «Abierta», o «Vencida hace N días») | «Objetivo: 8 ene» | `destacado` |
| Avance general | % de todos los conceptos | «Con fecha: 48 % · esperado a hoy: 55 %». El tono compara esas dos cifras, para que no se contradiga con el valor grande. | `si` / `no` según la variación |
| Tareas vencidas | n | «De N aplicables» | `no` si n > 0 |
| Bloqueadas | n | — | `no` si n > 0 |
| Equipo recibido | % de unidades (`indicadoresApertura`) | «30 de 50 unidades» | sin tono |
| Compras con precio firme | monto (`cortePresupuesto` o `resumenApertura`) | «Presupuesto: $X» | `no` si supera el presupuesto |

**Lectura `.akton-lectura`** (hasta 3, calculada en `lecturaApertura`). Cada una aparece solo si aplica:

1. **Avance contra esperado.** Título: «Avance de 42 % contra 55 % esperado a hoy». Texto: los pp de diferencia y las 2 etapas con peor variación (nombre y pp). Si va al día, dice «Va al día» y nombra la etapa más adelantada.
2. **Vencidas y bloqueadas.** Título: «3 tareas vencidas y 1 bloqueada». Texto: hasta 3 nombres, ordenados por más días de atraso, con «vencida hace N días» o «bloqueada».
3. **Compras.** Título: «Compras: $X con precio firme de $Y de presupuesto». Texto: cuánto falta cotizar (conceptos sin precio o sin cantidad). Solo aparece si hay presupuesto o corte.

## Parte 2 · Detalle del proyecto (PR 1 y PR 2)

### Pestañas (PR 1)

Selector gris (`.akton-pestanas`, pieza nueva que se agrega a la guía): Checklist · Calendario · Cronograma ·
Actividades · Equipo y compras · Validaciones técnicas · Activos · Atención. La activa va en negro.

### Cronograma (PR 1)

**Tabla Akton por etapa** (`.akton-tabla-marco` > `.akton-tabla`):
- Columnas: Etapa · Conceptos · Listos · Avance · Esperado · Var. vs esperado · Inicio · Fin · Notas.
- `Var.` usa `.akton-var[data-favorable]`.
- En Notas van las `.akton-nota`: «N bloqueadas: nombre», «N vencidas».
- Cada etapa se despliega (`desplegable`, como «De dónde sale») y muestra sus tareas en `tr.akton-sub`. Columnas de cada tarea: nombre, estado, fechas y nota de vencida o bloqueada.
- Al final va `tr.akton-subtotal`, **Total del proyecto**, con real, esperado y variación generales.

**Gantt en grises** debajo de la tabla. Reutiliza `escalaGantt` y `ganttEtapas`:
- Barra de etapa: pista `--dato-pista`, avance en `--tinta-2` y % en texto negro.
- **Hoy:** línea negra (`--tinta`) con etiqueta negra.
- **Apertura objetivo:** rombo y línea punteada en `--accion`.
- **Tareas desplegadas:**
  - Las terminadas van en `--cuadra` (verde).
  - Las vencidas o bloqueadas van con contorno y trama `--alerta`.
  - Las en curso van en gris medio y las pendientes con contorno gris punteado.
- Sin colores por etapa. Se borra el CSS pastel `.ap-gantt-*` que ya no aplique.

### Listas (PR 2)

Actividades, Equipo y compras, Validaciones técnicas y Atención pasan a **tabla Akton agrupada por etapa**:
- Cada etapa va en `tr.akton-seccion`.
- Columnas: Concepto · Estado · Responsable · Cantidad / recibido · Fecha fin · Notas.
- En Notas: «vencida hace N días» (rojo), el texto de `notas` si está bloqueada, o «Referencia / lista de apoyo».
- Los filtros actuales se conservan y van en una tarjeta blanca encima.
- En celular (≤ 640 px) se ve en tarjetas (`.tabla-tarjetas`).
- «Avance por categoría» (Equipo y compras) pasa a una tabla Akton: Categoría · Conceptos · Listos · Avance · En curso · Recibidos · Notas (bloqueados).

### Checklist (PR 2)

- Módulos en tarjetas blancas con borde de 1 px, sin sombras.
- Marcas: ✓ verde (listo), ! rojo (bloqueado), ◐ gris (en curso) y vacío gris (pendiente).
- El avance del módulo va en gris oscuro.
- La ventana para cambiar estado no cambia.

### Calendario (PR 2)

- Las barras van en gris claro con texto negro.
- Hay contorno `--alerta` en vencidas o bloqueadas y relleno `--cuadra-fondo` con texto `--cuadra-texto` en terminadas.
- Se quitan el selector «Colorear por: Etapa / Categoría», el botón «Colores» y la leyenda de colores.
- **Responsable** sigue como filtro y vista: las personas se distinguen por **iniciales** en fichas grises, no por color.
- La vista «cuadros» y la semana siguen igual, sin color por persona.
- `gruposCalendario` y los predeterminados de color dejan de usarse en pantalla y se borran si nada más los usa.

## Parte 3 · Portada, tarea e inversión (PR 3)

### Portada `/aperturas`

**Franja:**
- Aperturas en curso.
- **Próxima apertura en N días** (`destacado`).
- Proyectos atrasados contra esperado (`no` si hay alguno).
- Inversión registrada total.

**Tarjetas por sucursal**, con borde de 1 px y sin sombra:
- Nombre.
- Días para la apertura, en grande.
- «Avance 42 % · esperado 55 %» con la variación en verde o rojo.
- `.akton-nota` si tiene vencidas o bloqueadas.

El orden no cambia (`ordenarProyectos`). La consulta de la portada ahora también lee `etapa, tipo, inicio, fin` de los conceptos para calcular el esperado.

### Detalle de tarea `/aperturas/[id]/items/[item]`

- Franja corta con:
  - Estado.
  - Fechas: «vencida hace N días» con tono `no`.
  - Cantidad / recibido.
  - Importe (cantidad × precio, con `<Importe>`).
- El formulario de seguimiento va en `.akton-tabla-marco` y funciona igual.
- «Origen y especificaciones»: tabla Akton de dos columnas (Campo · Valor).
- Historial: tabla Akton (Fecha · Quién · Qué cambió).

### Inversión `/aperturas/inversion`, resumen CAPEX y corte de presupuesto

- **Franja:**
  - Inversión registrada.
  - Presupuesto.
  - % ejercido (`no` si > 100 %).
  - Por ejercer.
- **Lectura:** las 3 clasificaciones con más gasto. Si hay presupuesto por clasificación, las 3 que más se pasan.
- **Tabla Akton:**
  - Una sección por clasificación, con `tr.akton-subtotal`.
  - Columnas: Real · Presupuesto · % ejercido · Var. · Notas.
  - Cada clasificación se despliega en sus movimientos (fecha, proveedor y concepto, importe, trazabilidad).
  - Montos con `<Importe>`.
- `CortePresupuesto` y el resumen CAPEX de la página del proyecto usan la misma tabla.

## Arquitectura

- **Lógica:** `lib/aperturasAkton.ts` con `esperadoItem`, `avanceComparado` (real comparable, esperado, var, favorable) por etapa y proyecto, `indicadoresAperturaAkton`, `lecturaApertura`, `notasEtapa` y `diasParaApertura`. Las funciones son puras y reciben `hoy`.
- **Componentes de dibujo:** `app/aperturas/AktonProyecto.tsx` (franja y lectura), `app/aperturas/Cronograma.tsx` (tabla por etapa) y `Gantt.tsx` en grises. Las listas se reescriben en el `page.tsx` del proyecto o se extraen a `ListaConceptos.tsx`.
- **Se reutiliza:** `ganttEtapas`, `escalaGantt`, `indicadoresApertura`, `cortePresupuesto`, `resumenApertura`, `marcaItem`, `rangoItem`, `<Importe>`, `porcentaje()` y las clases `.akton-*`.
- **Se retira:** `PanelProyecto` (donas y tarjetas), `fuenteGantt.ts`, CSS `.ap-gantt-*` pastel, `.ap-cal-leyenda`, la ventana `Colores` y lo que deje de usarse en `.ap-indicador*` / `.ap-dona*`.
- **Guía:** se agregan a `docs/diseno/estilo-akton.md` las piezas nuevas (`.akton-pestanas`, Gantt en grises y la regla de avance esperado).

## Errores y casos límite

- Proyecto sin conceptos con fecha: «Esperado a hoy: sin fechas» y sin tono. Se omite la lectura 1.
- Sin vencidas ni bloqueadas: se omite la lectura 2.
- Sin presupuesto ni corte: el indicador de compras muestra el estimado y se omite la lectura 3.
- Proyecto ya abierto (`hoy > objetivo_hasta` y todo listo): Días muestra «Abierta».
- Fechas inválidas o fin antes del inicio: `rangoItem` ya las normaliza.

## Pruebas

- `lib/aperturasAkton.test.ts`:
  - Esperado antes, durante y después del rango, incluyendo hoy.
  - Conceptos sin fecha excluidos del esperado.
  - Real comparable.
  - Umbral de 5 pp.
  - Lectura: cada tarjeta aparece y desaparece en su caso; orden por días de atraso; etapas peor variación.
  - Días para apertura: futuro, hoy, vencida y abierta.
- Las pruebas existentes de `aperturasGantt`, `aperturasCalendario` y `aperturas` siguen pasando o se ajustan si se borran funciones de color.
- **Revisión visual:** con datos de ejemplo en escritorio y celular (≤ 640 px), en una página temporal que no se sube, como en los PR anteriores.

## Entregas

1. **PR 1:** cálculo de avance esperado, franja y lectura del proyecto, pestañas, Cronograma (tabla por etapa y Gantt en grises), guía actualizada.
2. **PR 2:** listas en tabla Akton, avance por categoría, Checklist y Calendario sin colores.
3. **PR 3:** portada, detalle de tarea, Inversión, CAPEX y corte de presupuesto.

Ninguno requiere migración.
