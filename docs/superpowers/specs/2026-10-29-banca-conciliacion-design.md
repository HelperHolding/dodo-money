# Conciliación bancaria Banregio (diseño)

**Fecha:** 2026-10-29 · **Autor:** Claude con Sebastián · **Estado:** en revisión
**Contexto:** subproyecto 2 de 3 (1: P&L formato asesores, ya en main; 3: Flujo de Efectivo, depende de este).

## 1. Objetivo

Que cada movimiento de Banregio quede **conciliado**: asociado a su documento cuando existe (pago a proveedor,
venta con tarjeta, lote de Rappi, nómina) o clasificado sin documento, y siempre con un **concepto de flujo** que el
Flujo de Efectivo (subproyecto 3) solo tendrá que sumar.

**Éxito:** al cerrar un mes, admin abre Banca → Conciliación, confirma en lote las sugerencias exactas, revisa las que
tienen diferencia, clasifica lo que no tiene documento, y el indicador "Por conciliar" llega a 0. Nada cambia en
facturas, ventas, caja ni saldos.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Fuente del concepto | La conciliación. Con documento, el concepto se **sugiere** desde el documento; sin documento, se elige con nota |
| Pagos a proveedores | Ya se registran casi todos en Compras → Pagos: se **busca y vincula** el pago existente; no se crean pagos |
| NetPay | Contra la **venta con tarjeta** de Dodo IS (`ventas_dia.tarjeta`) de los días que liquida; la comisión e IVA del mismo día van en la misma conciliación. Supuesto confirmado: esa venta con tarjeta es solo la terminal NetPay |
| Rappi | Contra el **paidlot** del reporte financiero (`rappi_fin_importaciones`, no sustituido) |
| Nómina | Se clasifica como nómina por lote (mismo día, concepto NOMINA/Q##); sin cruce por empleado |
| Sucursal | No obligatoria. El flujo será por razón social/cuenta; la sucursal se hereda del documento cuando lo hay |
| Automatización | La app **sugiere**; admin **confirma** (en lote las exactas). Nada queda conciliado sin una persona |
| Efecto | Documental: no marca facturas pagadas, no crea ventas, no toca saldos ni caja/bóveda |
| Entrega | Un PR; se integra solo después de que Sebastián ejecute la migración y sus pruebas en Supabase (`PRUEBAS OK`) |

## 3. Modelo

### Tablas (migración `supabase/migrations/<ts>_banca_conciliacion.sql`)

- `banca_conciliaciones`: `id uuid` (= id de solicitud, idempotente), `cuenta_id`, `tipo`, `concepto`, `nota`,
  `monto_movimientos numeric(16,2)` (abonos − cargos de sus movimientos), `monto_documentos numeric(16,2) null`,
  `diferencia numeric(16,2) null`, `solicitud jsonb`, `creado_por`, `creado_en`, `anulada_por`, `anulada_en`,
  `motivo_anulacion` (obligatorio al anular).
- `banca_conciliacion_movimientos`: (`conciliacion_id`, `movimiento_id`); índice único parcial: un movimiento en a lo
  más **una conciliación activa**.
- `banca_conciliacion_documentos`: `conciliacion_id`, `tipo_documento` (`pago` | `venta_dia` | `rappi_lote` |
  `nomina_mes`), `pago_id`, `ventas_dia_id`, `rappi_importacion_id` + `lote`, `nomina_real_id`, `monto`
  (calculado en el servidor). Índice único parcial: un pago en a lo más una conciliación activa; igual para un día de
  venta y un paidlot.

### Tipos y coherencia (validado en la base)

| `tipo` | Movimientos | Documentos |
|---|---|---|
| `pago_proveedor` | cargos | 1+ `pago` (no anulados, forma transferencia) |
| `cobro_tarjeta` | 1 abono NetPay + sus cargos de comisión/IVA del mismo día | `venta_dia` de hasta 7 días distintos, en un lapso de hasta 7 días, anteriores al depósito |
| `cobro_rappi` | abonos | 1+ `rappi_lote` de reportes no sustituidos |
| `nomina` | cargos | opcional `nomina_mes` |
| `sin_documento` | cualquiera | ninguno; `nota` obligatoria |

Todos los movimientos de una conciliación son de la misma cuenta.

### Conceptos de flujo (catálogo fijo en código y `check` en la tabla)

- **Operación:** `cobranza_tarjeta`, `cobranza_rappi`, `deposito_efectivo`, `proveedores`, `nomina`,
  `imss_impuestos`, `renta`, `servicios`, `marketing`, `regalias`, `comisiones_bancarias`, `comisiones_cobro`,
  `otros_operacion`.
- **Inversión:** `capex`, `apertura`.
- **Financiamiento:** `prestamo_recibido`, `pago_capital`, `intereses`.
- **Excluido del flujo:** `traspaso_interno`.

Una conciliación lleva un solo concepto. La comisión NetPay se concilia junto con su depósito (`cobro_tarjeta`) y el
flujo la separa como `comisiones_cobro` a partir de los movimientos de cargo de esa conciliación (regla del
subproyecto 3, documentada aquí).

### Montos (calculados en el servidor)

- `monto_movimientos` = Σ abonos − Σ cargos de los movimientos.
- `monto_documentos`: pagos → Σ `pagos.monto` (negativo); `cobro_tarjeta` → Σ `ventas_dia.tarjeta`; Rappi → Σ neto
  del paidlot desde `reporte.movimientos` del reporte; nómina y sin documento → null.
- `cobro_tarjeta` compara `monto_documentos` contra **el abono** (NetPay deposita la venta bruta y cobra comisión e IVA aparte el mismo día).
- `diferencia` = movimientos (o bruto) − documentos; distinta de 0 exige `nota`.

## 4. Sugerencias

Función pura `lib/banca/conciliacion.ts`: `sugerirConciliaciones(movimientos, documentos) → Sugerencia[]`, donde cada
sugerencia trae movimientos, tipo, documentos propuestos, concepto sugerido, diferencia y `exacta` (diferencia 0).

| Movimiento | Regla | Concepto sugerido |
|---|---|---|
| Abono "NET PAY … VTAS" | Agrupa los cargos "DOMI: COM VTAS" e "IVA COM VTAS" del mismo día. Se compara el abono (venta bruta) contra Σ `tarjeta`. Días candidatos: no usados por otro depósito, de 1 a 4 días antes del depósito; elige la ventana (1–4 días, que termina en D−1) con menor diferencia contra Σ `tarjeta` | `cobranza_tarjeta` |
| Abono "TECNOLOGIAS RAPPI" | Paidlot no conciliado cuyo neto = monto (±0.01). Abono ≤ $1 de validación → `sin_documento` | `cobranza_rappi` / `otros_operacion` |
| Cargo SPEI a CLABE de proveedor | Pago no anulado, transferencia, no vinculado, mismo monto, fecha ±5 días, `proveedores.clabe` = CLABE del concepto | Desde `cuenta_pl` de las facturas del pago (por monto mayor): insumos/alimento → `proveedores`; renta → `renta`; servicios → `servicios`; marketing → `marketing`; inversiones → `capex`; otro → `proveedores` |
| Cargos SPEI con NOMINA o Q## | Lote del mismo día | `nomina` |
| "*Com." / "IVA de Com." / "Comisión Administración" | Sin documento | `comisiones_bancarias` |
| "PAGO SUA/SIPARE" | Sin documento | `imss_impuestos` |
| "Traspaso a cuenta" | Sin documento | `traspaso_interno` |
| Abono "PRESTAMO" | Sin documento | `prestamo_recibido` |

Las reglas leen la descripción original conservada por la importación. Un movimiento ya conciliado no se sugiere.

## 5. Pantalla (Banca → Conciliación)

Tarjetas, no tablas anchas; filtros de cuenta y periodo.

1. **Sugerencias**, agrupadas por tipo: movimientos, documento propuesto, diferencia, selector de concepto y nota.
   Botón **"Confirmar N exactas"** (solo diferencia 0).
2. **Sin sugerencia**: elegir tipo; buscar documento por monto y fecha; o "Sin documento" con concepto y nota.
3. **Conciliados** del periodo, con anulación con motivo.

El indicador "Por conciliar" del resumen de Banca cuenta movimientos **sin conciliación activa**.

## 6. Permisos y escritura

- Admin concilia y anula; quien hoy consulta Banca (`ve_compras()`) consulta conciliaciones.
- RLS de solo lectura; sin escritura directa. Escritura solo por RPC `security definer`:
  `conciliar_banca(p_solicitud uuid, p_movimientos uuid[], p_tipo text, p_concepto text, p_documentos jsonb, p_nota text)`
  (idempotente: misma solicitud y mismos datos devuelven el mismo id; otros datos se rechazan) y
  `anular_conciliacion(p_id uuid, p_motivo text)`.

## 7. Pruebas

- `lib/banca/conciliacion.test.ts` con movimientos sintéticos que copian los patrones de los estados de cuenta, sin
  nombres ni CLABEs reales: NetPay con comisión e IVA; ventana de varios días (viernes–domingo); Rappi por paidlot y
  depósito de $0.01; SPEI a proveedor por CLABE; pago ya vinculado no se vuelve a sugerir; lote de nómina; textos sin
  documento; movimiento ya conciliado excluido.
- `supabase/pruebas/<ts>_banca_conciliacion.sql` (reversible, termina en `RAISE 'PRUEBAS OK'`): permisos por rol,
  idempotencia, doble vínculo de movimiento/pago/día/paidlot rechazado, coherencia tipo-documento, nota obligatoria,
  montos y diferencia calculados en servidor, anulación con motivo libera los vínculos, escritura directa bloqueada.
  Se corre primero en PGlite.
- `docs/banca-conciliacion.md`: alcance y pasos de activación.

## 8. Fuera de alcance

Vista de Flujo de Efectivo (subproyecto 3); importar reportes de NetPay; marcar facturas como pagadas; repartir gastos
entre sucursales; otros bancos.
