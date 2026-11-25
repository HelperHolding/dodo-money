# Aperturas: presupuesto vivo desde CAPEX (HD-3) — diseño

Fecha: 2026-11-25 · Ticket: HD-3 (Julio) · Responsable: Sebastián

## Objetivo

Que el bloque «Presupuesto del proyecto» de cada apertura muestre lo que de verdad está pagado, facturado, comprometido y cotizado, y lo que falta. Hoy lee la foto fija del corte del 13-oct (`PRE26-CORTE`). Por eso López Mateos marca $1.8 M «por cotizar», cuando lo real es ~$490 mil.

## Decisiones tomadas

- **La fuente es CAPEX.** El bloque usa lo que ya existe en Finanzas → CAPEX: el presupuesto aprobado por categoría (`capex_presupuestos`), y lo comprometido, facturado y pagado de `capex_resumen`. Esto último sale solo de órdenes de compra, facturas y pagos asignados a la apertura.
- **Las compras de López Mateos ya están en DODO MX** como órdenes de compra y facturas de su sucursal (confirmado por Sebastián).
- **Cotizado sin OC:** equipo y referencias de la apertura en estado `cotizado` o `aprobado`, con cantidad y precio, y sin `orden_id`. El precio de la partida trae IVA, así que se divide entre 1.16 para comparar sin IVA.
- **El presupuesto se edita en CAPEX**, con su revisión, motivo e historial. Editar el corte viejo queda fuera.
- **El corte del 13-oct** se conserva plegado como «Presupuesto original (13-oct)».
- **Visibilidad.** La tabla viva la ve quien tiene acceso a Finanzas (`puedeVerFinanzas`), igual que la tarjeta CAPEX de hoy. Quien no lo tiene ve el corte como hoy.
- **Carga inicial** del presupuesto CAPEX de López Mateos desde el corte. Es un script SQL que corre Sebastián, con este reparto sin IVA:

| Categoría CAPEX | Conceptos del corte | Monto |
|---|---|---|
| `obra_civil` | Obra civil e instalaciones (César) 1,300,000.00 + Carpintería 25,236.75 | 1,325,236.75 |
| `equipo_cocina` | Horno y gabinete 496,055.55 + Acero inox., cámara e instalación 469,734.00 + Atosa 113,620.50 + Otro equipo de cocina 146,847.74 | 1,226,257.79 |
| `tecnologia` | Tecnología y pantallas | 128,000.00 |
| `mobiliario` | Dispensadores, seguridad, mobiliario staff y varios | 19,800.00 |
| `smallware` | Smallware | 170,586.80 |
| `proyecto_permisos` | Trámites y licencias | 28,500.00 |
| **Total** | | **2,898,381.34** |

## Bloque «Presupuesto del proyecto» (con acceso a Finanzas)

**Una fila por categoría CAPEX**, solo las que tienen presupuesto o movimiento, más un total.

| Columna | Cálculo |
|---|---|
| Presupuesto | `capex_resumen.presupuesto` (última revisión); «Sin presupuesto» si es null |
| Pagado | `capex_resumen.pagado` (sin IVA) |
| Facturado | `capex_resumen.facturado` |
| Comprometido | `capex_resumen.comprometido` (OC confirmadas aún sin facturar) |
| Cotizado sin OC | Σ `cantidad × precio / 1.16` de las partidas que cumplen la regla, agrupadas con `equivalenciaItem(categoria)` |
| Falta cotizar | `max(0, presupuesto − comprometido − facturado − cotizado)`; vacío si no hay presupuesto |

**Encabezado:**
- Presupuesto total, «Ejercido» (comprometido + facturado) con su %, «Cotizado sin OC» y «Falta cotizar».
- Se usa el estilo Akton: la tabla `akton-tabla` y las clases de los bloques vecinos.

**Aviso de documentos sin categoría.**
- Cuenta las órdenes de compra confirmadas y las facturas no canceladas de la sucursal de la apertura que no tienen asignación CAPEX en `capex_asignaciones`, con fecha hasta `objetivo_hasta + 60 días`.
- Si hay alguno, muestra «N documentos de esta sucursal sin categoría CAPEX: no suman al presupuesto» y liga a `/finanzas/capex/{proyecto}`, donde ya se asignan con sugerencia.

**Respaldo:**
- Si la consulta CAPEX falla, se muestra el aviso «No se pudo cargar el presupuesto vivo» y debajo el corte.
- Si la apertura no tiene presupuesto CAPEX aprobado, el bloque dice «Sin presupuesto CAPEX aprobado» con liga a Finanzas y muestra el corte, si existe.

**El corte del 13-oct** queda en un `<details>` «Presupuesto original (corte 13-oct)», con su tabla y desglose actuales.

## Bloque sin acceso a Finanzas

Igual que hoy: solo el corte (`CortePresupuesto`).

## KPI y lectura (Akton)

- **«Compras con precio firme»** (`indicadoresProyecto`, `AktonProyecto`, `lecturaApertura`):
  - Con acceso a Finanzas y presupuesto CAPEX: el monto es comprometido + facturado + cotizado sin OC, sobre el presupuesto CAPEX.
  - Sin acceso a Finanzas o sin CAPEX: se comporta como hoy.
- **Pantallas que no cambian:** la tarjeta «CAPEX de la apertura» (`ResumenCapexApertura`) se queda igual.

## Código

- `lib/aperturas/presupuestoVivo.ts`, una función pura:
  - Firma: `presupuestoVivo(filas: FilaCapex[], items: ItemApertura[]): { categorias: {clave, nombre, presupuesto, pagado, facturado, comprometido, cotizado, faltante}[], total: {...}, conPresupuesto: boolean }`.
  - Redondea a centavos con el mismo criterio que `resumir` de `lib/finanzas/capex.ts`.
- `app/aperturas/PresupuestoVivo.tsx`, componente de servidor:
  - Carga `capex_resumen` del proyecto y cuenta los documentos sin categoría.
  - Llama a la función y pinta la tabla, el aviso y el `<details>` con `CortePresupuesto`.
- `app/aperturas/[id]/page.tsx`:
  - Con `puedeVerFinanzas` muestra `<PresupuestoVivo>`; si no, `<CortePresupuesto>`.
  - Le pasa el resultado a los indicadores para el KPI.
- `CortePresupuesto` gana una prop opcional `plegado` para pintarse dentro del `<details>` con el título «Presupuesto original (corte 13-oct)».

## Datos

- **Sin migración de esquema.**
- **Carga** `supabase/cargas/capex_presupuesto_guadalajara1_corte_20261013.sql`:
  - Busca la apertura por la sucursal cuyo nombre empieza con `Guadalajara-1` (la memoria del proyecto dice no buscar por «Dodo-N»). Si encuentra cero o más de una, aborta.
  - Si ya hay presupuesto CAPEX para esa apertura, lanza `raise notice` y no hace nada.
  - Si no, fija `request.jwt.claims` con un admin activo y llama a `aprobar_capex_presupuesto(proyecto, 0, montos, 'Corte del presupuesto del 13-oct-2026 (Dodo2_Presupuesto_Final.xlsx)')`.
  - Al final verifica que la suma de la revisión 1 sea 2,898,381.34.
- **Prueba** `supabase/pruebas/capex_presupuesto_guadalajara1_corte_20261013.sql`: corre la misma lógica, comprueba el total y termina en «PRUEBAS OK», que revierte.

## Pruebas

- **Unitarias de `presupuestoVivo`:**
  - Columnas por categoría y total.
  - Cotizado sin OC: solo `cotizado`/`aprobado`, con cantidad y precio y sin `orden_id`, dividido entre 1.16 y en la categoría por `equivalenciaItem`.
  - «Falta cotizar» nunca negativo y vacío sin presupuesto.
  - Categorías sin presupuesto ni movimiento quedan fuera.
  - Redondeo a centavos.
  - Ejemplo: obra con presupuesto 1,325,236.75 y comprometido 1,327,071.52 da 0 por cotizar.
- **De cableado (lectura de fuente):**
  - La página usa `PresupuestoVivo` con `puedeVerFinanzas` y `CortePresupuesto` sin él.
  - El aviso de documentos sin categoría liga a `/finanzas/capex/`.
- **Carga:** PGlite con stubs mínimos de CAPEX que copian los CHECK reales. Verifica que el reparto suma 2,898,381.34, que no duplica si ya hay presupuesto y que aborta si la apertura es ambigua.

## Fuera de alcance

- Editar los conceptos del corte viejo.
- Asignar categoría CAPEX automáticamente a los documentos. Se sigue haciendo en Finanzas, con sugerencia.
- Presupuesto vivo para quien no tiene acceso a Finanzas.
