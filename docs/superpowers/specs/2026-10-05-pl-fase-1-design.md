# P&L mensual — Fase 1 (diseño)

**Fecha:** 2026-10-05 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Un estado de resultados (P&L) **mensual, por sucursal y consolidado**, con los **renglones del modelo de Dodo
(IMF Model Tool)** para comparar uno a uno el real contra la meta. Se arma con lo que la app ya captura
(ventas de Dodo IS, costos de producto, facturas de Compras, caja chica, efectivo) y una captura mínima de lo que
falta (plantilla de nómina, ajustes y gastos sin factura).

**Éxito:** al cerrar un mes, el admin abre el P&L de cada sucursal y del consolidado, ve cada renglón en pesos y
como % de la venta neta contra la meta del PL Base, sabe de dónde sale cada número (puede abrir el detalle) y lo
exporta a PDF y Excel para corporativo.

## 2. Alcance

**Entra (fase 1):** estructura de renglones Dodo; cálculo automático de ventas, alimento y empaque teórico,
regalías, comisiones de Rappi y de cobro, caja chica y faltantes; gastos por factura asignados a una cuenta del P&L;
plantilla de nómina por sucursal con ajustes del mes; gastos del mes sin factura; prorrateo de oficina central;
metas (PL Base) editables por sucursal; pantalla del P&L con detalle por renglón; export PDF/Excel.

**No entra (fases siguientes):**
- Fase 2: costo real de insumos contra teórico (merma real), P&L por canal.
- Fase 3: presupuesto mensual detallado, punto de equilibrio, depreciación e impuestos, importación por API de Dodo IS.

## 3. Renglones del P&L (estructura Dodo)

Todos los montos van **sin IVA** y como **% de la venta neta**. Criterio **devengado**: cada cosa cuenta en el mes
de su fecha (fecha de la venta, fecha de emisión de la factura, fecha del gasto, mes de la nómina).

| # | Renglón | Cómo se calcula el real |
|---|---|---|
| 1 | **Venta neta** (Sales excl VAT) | Σ ventas_dia.total − iva del mes (Dodo IS) |
| 1a | Descuentos (informativo) | Σ (importe sin descuento − importe) de ventas_producto |
| 2 | **Alimento y empaque** (Food+Package) | Costo teórico: Σ piezas × costo vigente (receta + periférico) |
| 3 | **Merma** (Net losses and waste) | Fase 1: vacío (sin dato). Fase 2: costo real − teórico |
| 4 | **Nómina cocina** (Kitchen personnel) | Plantilla de puestos de cocina del mes + ajustes de cocina |
| 5 | **Nómina gerencia** (Store management) | Plantilla de gerencia + ajustes de gerencia |
| 6 | **Repartidores propios / de terceros** | Gastos con esa cuenta (hoy en 0) |
| 7 | **Comisión de agregadores** (Aggregators' commissions) | Venta Rappi **con IVA** del mes × tasa vigente (0 % oct–dic 2026; 18 % desde 2027-01-01) |
| 8 | **Marketing de agregadores** | Gastos con esa cuenta |
| 9 | **Marketing** | Facturas y gastos con cuenta Marketing (gasto propio) |
| 10 | **Renta** | Facturas y gastos con cuenta Renta |
| 11 | **Servicios** (Utilities: luz, gas, agua, internet) | Facturas y gastos con cuenta Servicios |
| 12 | **Mantenimiento** | Facturas y gastos con cuenta Mantenimiento |
| 13 | **Consumibles y equipo menor** | Facturas y gastos con esa cuenta |
| 14 | **Regalías** (Royalties) | Venta neta × **5 %** |
| 15 | **Otros gastos de operación** | Comisiones de cobro + faltantes de efectivo + caja chica y facturas sin cuenta + cuenta "Otros" |
| | **= EBITDA de tienda** (Store-level EBITDA) | 1 − (2 … 15) |
| 16 | **Oficina central** (Management) | Gastos de oficina (facturas sin sucursal, nómina de oficina, gastos del mes de oficina), prorrateados |
| | **= EBITDA** | EBITDA de tienda − 16 |
| memo | Compras de insumos del mes | Facturas de consumibles (no entran al EBITDA en fase 1: el alimento se toma del teórico) |
| memo | Inversiones del mes | Facturas de activo fijo (no son gasto) |

### 3.1 Comisiones de cobro (dentro de "Otros gastos")

| Medio (de ventas_dia) | Tasa |
|---|---|
| **En línea** (app, dLocal) | 3.5 %; la parte pagada en Oxxo, 5 % |
| **Tarjeta** (terminal NetPay) | 1.8 % débito/crédito; la parte Amex e internacionales, 3.6 % |

Dodo IS no dice qué parte fue Oxxo ni Amex: son **parámetros** ("% de en línea pagado en Oxxo", "% de tarjeta
Amex/internacional"), en 0 % de inicio. Las comisiones se calculan sobre la venta **con IVA** del medio.

### 3.2 Rappi

Venta Rappi del mes = desglose tipo "agregador" de Dodo IS (con IVA). Tasa por periodos con fecha de vigencia:
0 % desde 2026-10-01 (3 meses sin comisión), 18 % desde 2027-01-01. El cálculo usa la tasa vigente en cada día.

## 4. Fuentes y captura

### 4.1 Cuentas del P&L
Catálogo fijo con los renglones 6, 8–13, 15 ("Otros") y 16 que se alimentan de gastos. Se asigna así:
- **Proveedor:** cuenta por omisión (p. ej. CFE → Servicios, la gasera → Servicios, el arrendador → Renta).
- **Factura:** hereda la cuenta del proveedor al subirse; el admin la puede cambiar. Su sucursal ya existe
  (sin sucursal = oficina central). Las **notas de crédito restan** en la cuenta y mes de su emisión.
- **Caja chica:** cada gasto se registra con su cuenta (los anteriores quedan en "Otros").
- Factura de **consumibles** → memo "Compras de insumos"; de **activo fijo** → memo "Inversiones" (salvo que se
  le asigne una cuenta de gasto a mano).
- Monto de la factura en el P&L: **subtotal − descuento** (sin IVA; las retenciones no cambian el gasto).

### 4.2 Nómina: plantilla + ajustes
- **Plantilla por sucursal** (y una para oficina central): puesto, renglón (cocina o gerencia), número de personas,
  sueldo mensual por persona, % de cargas sociales, bono mensual estimado; con fecha de vigencia. Se precarga con
  la de LC Inputs: gerente $22,000 + 20 %; 2 jefes de turno $12,223.20 + 12.9 %; 4 pizzeros/cajeros $10,741.20 + 11.71 %.
- **Nómina del mes** = Σ personas × sueldo × (1 + cargas) + bonos, con la plantilla vigente ese mes.
- **Ajustes del mes**: monto (+/−), renglón y concepto (bonos pagados, altas/bajas a medio mes, horas extra, finiquitos).

### 4.3 Gastos del mes sin factura
Captura de sucursal (u oficina), mes, cuenta, monto y concepto (renta sin CFDI, pagos en efectivo, etc.).

### 4.4 Parámetros
Con fecha de vigencia (un cambio no altera meses anteriores): regalías 5 %; tasas de Rappi; comisiones de cobro y
sus % de Oxxo / Amex; criterio de prorrateo de oficina central (de inicio: **proporcional a la venta neta** del mes).

### 4.5 Metas
Por sucursal y renglón, como **% de la venta neta** o como **monto fijo mensual**. Se precargan del **PL Base**
(total de tienda): alimento 30 %, merma 2 %, nómina según plantilla, comisión de agregadores = tasa × venta Rappi
real (sigue la mezcla del mes), marketing 4 %, renta $30,000, servicios $20,000, mantenimiento $3,000,
consumibles $5,000, regalías 5 %, otros 3 %, oficina central 5 %. Editables por sucursal.

## 5. Pantallas

Menú lateral, grupo nuevo **"Finanzas"** (admin y corporativo):
- **P&L** — mes y sucursal (o consolidado). Tabla con renglón · real $ · % · meta % · diferencia (rojo si se pasa) ·
  mes anterior % · acumulado del año. Cada renglón se abre y muestra de dónde sale (facturas, gastos, ajustes,
  cálculo). Botones PDF y Excel (mismo motor que el reporte de ventas). Aviso visible de lo que falta: días sin
  ventas importadas, productos sin costo, facturas sin cuenta, mes sin plantilla.
- **Nómina** — plantilla por sucursal (editar con fecha de vigencia) y ajustes del mes.
- **Gastos del mes** — captura y lista.
- **Parámetros y metas** — regalías, comisiones, Rappi, prorrateo; metas por sucursal.
- En **Compras**: la cuenta del P&L en la ficha del proveedor y en la factura; en **Caja chica**: la cuenta al
  registrar el gasto.

**Permisos:** el admin captura y edita; corporativo consulta todo; gerente y encargado no ven el P&L (incluye nómina).

## 6. Datos (resumen para el plan)

Tablas nuevas: `cuentas_pl` (catálogo fijo), `pl_parametros` (clave, valor, vigente_desde), `nomina_plantilla`
(sucursal o oficina, puesto, renglón, personas, sueldo, % cargas, bono, vigente_desde), `nomina_ajustes`
(sucursal/oficina, mes, renglón, monto, concepto), `gastos_mes` (sucursal/oficina, mes, cuenta, monto, concepto),
`pl_metas` (sucursal, renglón, tipo %/monto, valor). Columnas nuevas: `proveedores.cuenta_pl`,
`facturas.cuenta_pl`, `gastos_caja_chica.cuenta_pl`. Todo con RLS (admin escribe, admin/corporativo leen) y
funciones `security definer` donde haya reglas. El cálculo del P&L vive en `lib/finanzas/` (funciones puras, con
pruebas) y la pantalla solo lee y muestra.

## 7. Reglas y casos borde

- Mes sin ventas importadas completas: el P&L se muestra con aviso "faltan N días" y los % se calculan sobre lo importado.
- Producto vendido sin costo: queda fuera del alimento teórico y se avisa (igual que hoy en Ventas).
- Factura cancelada: no cuenta. Nota de crédito: resta en su mes y cuenta.
- Cambio de parámetro o plantilla: solo afecta desde su fecha de vigencia.
- Prorrateo de oficina: con una sola sucursal con venta, se le carga todo; sucursal sin venta en el mes no recibe prorrateo.
- Redondeo: cálculos en centavos; los % con un decimal en pantalla.

## 8. Pruebas

- **Node (lib/finanzas):** cada renglón con datos de ejemplo; Rappi con cambio de tasa a mitad de periodo;
  comisiones con % de Oxxo/Amex; nómina con plantilla que cambia de vigencia y ajustes; notas de crédito;
  prorrateo con 1, 2 y 0 sucursales con venta; mes incompleto; metas % y monto fijo.
- **SQL:** permisos por puesto (admin escribe, corporativo lee, gerente no ve), vigencias, cuentas válidas,
  herencia de cuenta proveedor → factura.
- **Vista previa:** P&L en computadora y celular sin scroll horizontal; export PDF y Excel (Excel abierto en el
  Excel real, como el de ventas).

## 9. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Estructura | Renglones del modelo de Dodo |
| Meta | PL Base, total de tienda, editable por sucursal; regalías 5 % (no 6 %) |
| Agregadores | Rappi 18 % sobre venta con IVA; 0 % de 2026-10-01 a 2026-12-31 |
| Cobro | dLocal 3.5 % (Oxxo 5 %); NetPay 1.8 % (Amex/internacional 3.6 %) |
| Marketing | Gasto propio, de facturas |
| Nómina | Plantilla por sucursal + ajustes del mes |
| Oficina central | Renglón "Management"; prorrateo por venta de inicio, configurable |
| Criterio | Devengado |
| Alimento | Teórico en fase 1; real contra teórico en fase 2 |
