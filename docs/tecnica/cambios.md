# Registro de cambios

## 2026-11-10 · Rappi financiero: ajustes retroactivos · 20261110120000 · pendiente de Supabase

El reporte financiero de octubre 2026 trae la columna «Retroactivo»: 103 renglones donde Rappi, en un paidlot nuevo, revierte lo que cobró en el lote original de la misma orden (columna «ID Paidlot retroactivo»). Devuelve la comisión y su IVA ($3,711.87 + $593.90 en La Calma), deshace el DAR y sus créditos y retiene IVA e ISR sobre el DAR. Antes la importación los rechazaba («Signos o créditos DAR no cuadran»). Ahora `leerFinancieroRappi` los marca `retroactivo` (con `loteOriginal`), exige que no traigan venta, descuento del aliado, compensación ni cancelación y que los signos vayan al revés del cargo, y los deja convivir con el renglón original (clave `ORDEN|orden|R`). No cuentan como pedido (`esPedidoRappi`): el resumen, el P&L, la revisión y el aviso de órdenes sin detalle los muestran como ajustes. La comisión devuelta queda dentro de la comisión del lote donde Rappi la paga y en la comisión real por orden de Rentabilidad Rappi. La migración repite `importar_rappi_financiero` con las mismas reglas del lado de la base. Pruebas: `lib/banca/rappi.test.ts` con los renglones reales de la orden 2477532152 y `supabase/pruebas/20261110120000_rappi_fin_retroactivos.sql` en PGlite. Sigue pendiente: el reporte de varias tiendas (La Calma + Turbo) se rechaza porque una sucursal tiene una sola tienda financiera.

## 2026-11-10 · P&L: venta bruta sin IVA en Contra meta y Rappi en Formato asesores · sin migración

Contra meta, Comparativo, PDF y Excel vuelven a mostrar la venta bruta (retirada el 2026-10-07 cuando llevaba IVA), ahora sin IVA para compararla con la neta: «Venta bruta (sin IVA)», su detalle Dodo IS / POS y Rappi, y «Descuentos (sin IVA)» = bruta − venta neta de los canales. Son informativos: el % sigue sobre la venta neta y márgenes, metas y EBITDA no cambian. Sustituyen a «Descuentos (informativo)», que llevaba IVA. Con reporte financiero de Rappi la bruta sin IVA ya no queda Pendiente: es su Venta Bruta (más el importe de productos de los días sin reporte) ÷ 1.16, y llena Formato asesores. La de Dodo IS sigue exigiendo que el detalle por producto cuadre (o esté conciliado) cada día; un día sin revisar deja la bruta en Sin dato.

## 2026-11-09 · Rappi: Turbo ya no sale «ocupado» · sin migración

En la primera vuelta del flujo con dos tiendas, Turbo siempre respondía «ocupado»: el batching del nodo HTTP de n8n solo espacia el inicio de las peticiones y no espera la respuesta, así que La Calma y Turbo llegaban juntas al extractor. Ahora el extractor pone las tiendas en turno (`crearTurnos` en `scripts/rappi/api.mjs`): otra tienda espera a que termine la que corre, y solo se salta con «ocupado» la misma tienda empalmada (vueltas de 15 min que se cruzan). Prueba en `scripts/rappi/api.test.mjs`.

## 2026-11-09 · Rappi: pedidos de Rappi Turbo · sin migración

Rappi Turbo es otra tienda del Portal Aliados («Dodo Pizza - Turbo», `MX1930494033`, misma dirección y cocina que La Calma) y sus pedidos no entraban: el extractor solo leía `MX1930486109`. Ahora el extractor acepta `tienda` en `/sincronizar` (lista permitida: `RAPPI_TIENDA` más `RAPPI_TIENDAS`) y guarda su caché por tienda; la principal conserva el nombre de archivo de antes. El flujo `Rappi_Ventas_Diarias` arma una vuelta por tienda en «Por tienda», llama al extractor de una en una (lote de 1, para que la segunda no salga «ocupado») y resume y avisa por tienda; el webhook «Probar» acepta `{"tienda": "MX…"}`. La app ya admitía varias tiendas por sucursal (`rappi_tiendas`): la primera importación de Turbo la liga a Dodo La Calma (Dodo-1). La cuenta del extractor (`RAPPI_USUARIO`) debe tener acceso a la tienda Turbo en el portal. Pruebas en `scripts/rappi/api.test.mjs` y `tests/n8nRappi.test.mjs`.

## 2026-11-06 · Compras: sustituir el CFDI de una factura · 20261106120000 · pendiente de Supabase

Administración puede reemplazar el CFDI de una factura vigente con el XML que el proveedor volvió a timbrar, y opcionalmente con su PDF. Se conserva el mismo registro con pagos, órdenes y recepciones; cambian UUID, folio, fecha, datos fiscales y archivos. Si el total cambia, se acepta explícitamente como en 0067. El CFDI anterior queda completo en `cfdi_sustituciones` y en la sección «CFDI anteriores». Las notas de crédito ligadas bloquean la sustitución. Los REP del UUID anterior se conservan y la app avisa que hace falta uno del UUID nuevo. Un trigger impide volver a registrar un UUID sustituido. Detalle en [sustitucion-cfdi.md](sustitucion-cfdi.md). Prueba SQL en PGlite, con las funciones reales de registro de factura, estado y UUID manual.

## 2026-11-03 · Aperturas: actividades dentro de una categoría · 20261103120000 · pendiente de Supabase

Actividades y validaciones técnicas pueden llevar categoría del plano (por ejemplo, "Instalar luminarias" en Iluminación), al darlas de alta o desde su detalle. La migración quita la restricción `apertura_items_categoria_compra` y el candado de `actualizar_apertura_item` y `agregar_apertura_item`; el resto de las funciones queda igual. En el Checklist, lo que tiene categoría aparece y cuenta dentro del grupo de su categoría, no suelto en su etapa; las tarjetas de Equipo y compras y su lista filtrada por categoría también lo incluyen (listo = actividad completada o equipo instalado o verificado). Prueba SQL en PGlite.

## 2026-11-02 · Aperturas: Checklist en vivo · 20261102180000 · pendiente de Supabase

El Checklist se actualiza sin recargar. Al guardar, `cambiarEstadoApertura` devuelve el registro y la casilla y los porcentajes cambian al momento. Los cambios de otras personas o pestañas llegan por Supabase Realtime (websocket) filtrados por proyecto y por la política de lectura `ver_apertura_items`; ganan siempre la revisión más nueva (`fusionarItems`). Los indicadores de arriba se refrescan una vez que dejan de llegar cambios. Un aviso muestra si la conexión en vivo está activa. La migración agrega `apertura_items` a la publicación `supabase_realtime` y se puede repetir; prueba SQL en PGlite.

## 2026-11-02 · Aperturas: Checklist editable y vista predeterminada

El proyecto de apertura abre en el Checklist. Administración cambia el estado desde la casilla de cada concepto en una ventana emergente, sin salir de la página. Si el estado pide evidencia (completado, verificado, no aplica) o cantidades (recibido parcial, recibido, instalado, verificado), la ventana las solicita; al recibir completo propone la cantidad completa. Las categorías y las validaciones técnicas se abren para marcar cada concepto. `cambiarEstadoApertura` conserva responsable, fechas, precio, orden y factura del registro y llama a `actualizar_apertura_item` con su revisión, así que el historial y las reglas de la base no cambian. Sin migración.

## 2026-11-02 · Aperturas: vista Checklist

Nueva vista `?vista=checklist` en el proyecto de apertura, con el formato del checklist de The Coffee (602): avance general y una tarjeta por módulo con su porcentaje y casillas. Módulos: Proyecto y permisos (P1–P3), Equipo y compras (P4 y categorías de equipo), Obra (P5 y categorías de obra) y Preparación y apertura (P6–P7). Las categorías y las validaciones técnicas se resumen en una línea ("30 de 94") que abre su lista; las actividades van una por línea. Listo es actividad completada o equipo instalado o verificado; no aplica y equipo por validar quedan fuera. El general promedia los módulos. Sin migración; prueba en `lib/aperturas.test.ts` y revisión visual local con los datos de las cargas de dodo-2 en escritorio y celular.

## 2026-11-02 · Aperturas: equipo por categoría del plano · 20261102120000 · pendiente de Supabase

El equipo de apertura lleva `categoria`, una por pestaña de especificaciones del plano (`equipo.xlsx`, 01 a 17). La migración categoriza lo ya cargado de dodo-2 desde `original.grupo` (equipo de cocina 88, mobiliario 11, cámara fría 1) y deja `actualizar_apertura_item` y `agregar_apertura_item` aceptar categoría solo en equipo y compras, con historial. `supabase/cargas/equipo_categorias_dodo_2.sql` agrega 67 conceptos de las pestañas 04 a 17 (`ESP-*`, por cotizar) y categoriza el equipo del presupuesto del 13/10 por su pestaña de origen. Los contactos salen del resumen de la pestaña 11 (37 piezas), no del detalle de la 09; de la 12 solo entra la bocina del salón, porque amplificadores, bocina de notificaciones y router ya vienen del presupuesto (PRE26-HQ-086 a 090). Busca la apertura por "dodo-2" dentro del nombre de la sucursal (hoy "Dodo Lopez Mateos (Dodo-2)"). Repetible: no toca lo ya cargado.

En Equipo y compras hay tarjetas de avance por categoría (instalado o verificado entre aplicables) y filtro por categoría. Las categorías de obra (04 a 15) no cuentan en «Equipo recibido». Orden: migración → carga → prueba `supabase/pruebas/20261102120000_aperturas_categorias.sql` (PRUEBAS OK) → publicar. Pruebas SQL en PGlite, incluida la de 0037.

## 2026-10-30 · Productos Rappi con varias piezas · 20261030150000 · pendiente de Supabase

Ventas → Rappi permite ligar un producto de Rappi a varias piezas del catálogo con su cantidad (pizza + dip, refresco o rolls, o combos como Plan Dúo, Solo Dodo y Completo y Dulce) mediante `guardar_piezas_rappi` (solo admin); las piezas mandan sobre el vínculo simple, que se limpia. Rentabilidad Rappi suma el costo y el precio POS de las piezas. El P&L sigue costeando Rappi con el vínculo simple: las piezas aún no entran a su costo de venta. Prueba SQL en PGlite.

## 2026-10-30 · Corrección: cierre Rappi del 2 al 21/10 con HELPER · corrida en Supabase

`supabase/correcciones/2026-10-30_rappi_fin_razon_helper.sql`: el cierre `Rappi_DODO_Cierre_Octubre_2026.xlsx` de Dodo La Calma quedó con COMERCIALIZADORA MASTER SITRU; sus dos CFDI de comisión (GDL-20-1160226 y GDL-20-1162552) y el aliado del reporte son HELPER COMERCIALIZADORA MASTER (HCM260306B93). Se cambió solo la razón social de esa importación, anotada en su motivo, para que el reporte del 2 al 29/10 la sustituya con HELPER. Ensayo LISTO PARA GUARDAR y COMMIT confirmados por Sebastián.

## 2026-10-30 · Reporte financiero de Rappi con la razón principal · 20261030120000 · corrida en Supabase

La importación del reporte financiero de Rappi acepta la razón social principal ("Todas / Oficina") para cualquier sucursal, igual que Compras (`razon_admite_sucursal`). Antes exigía una liga explícita en `razon_social_sucursales`, que la principal no tiene, y rechazaba HELPER COMERCIALIZADORA MASTER con Dodo La Calma. Otras razones siguen requiriendo su sucursal ligada. La función solo cambia esa validación; la app aplica la misma regla. Prueba SQL en PGlite.

## 2026-10-30 · Reporte financiero de Rappi sin recalcular

Banca → Rappi acepta el Excel tal como lo exporta Rappi: si toda la columna Valor Neto (BL) viene en 0 porque sus fórmulas no se han calculado, usa el neto calculado por concepto; si alguna fila trae su valor, todas deben cuadrar. Varias compensaciones de una misma orden (un renglón por producto compensado) se suman en un movimiento; deben compartir fecha y paidlot. Las órdenes repetidas se siguen rechazando. Sin migración.

## 2026-10-30 · Rentabilidad Rappi

Reporte mensual del canal Rappi por producto: descuento que paga la tienda, comisión real del reporte financiero (o `rappi_pct`), regalías, costo, utilidad y margen contra un mínimo de 45 % editable; precio mínimo de lista con el descuento real, comparación con mostrador y descuentos por orden. El canal resta compensaciones y cancelaciones. Detalle en rentabilidad-rappi.md. Sin migración.

## 2026-10-29 · Precio POS sin comida de personal

El precio POS de costeo solo toma cobros de mostrador, kiosco, app y sitio. Protege contra precios internos de la comida de personal (origen Pizzeria), como Alitas Buffalo a $139 en lugar de $185. Corrección: la API de ventas no trae comida de personal (verificado del 20 al 29/10), así que la venta y el P&L de los días sincronizados no la incluyen; esos días tampoco la reportan aparte. Sin migración.

## 2026-10-29 · Calculadora de promociones y combos como The Coffee

Calculadoras → Promociones y combos reúne en una pestaña los modos Precio Rappi, Un producto y Combo de varios productos, igual que la calculadora de The Coffee (HelperHolding/theCoffeeCosteo). Cada escenario compara POS y Rappi al mismo precio y descuento: margen bruto y margen con comisión con su importe por venta. El canal de referencia usa la comisión y base capturadas; el otro, su comisión vigente sobre el cobro con IVA. El combo suma costos y precios del canal de referencia y muestra el ahorro del cliente. La pestaña Combo anterior se retira; `?calculadora=combo` abre el modo combo. Sin migración.

## 2026-10-29 · Precio POS desde Dodo IS

El precio POS de costeo, ficha y calculadoras sale del último cobro en tienda registrado por Dodo IS (precio de lista sin descuento, últimos 60 días); el Excel del BOM queda solo como respaldo para productos sin ventas y para el periférico. Productos sin receta, como bebidas y dips, ya tienen precio POS. Sin migración.

## 2026-10-29 · Costeo con comisiones por canal

Costeo con el formato de The Coffee: margen bruto, comisión, margen con comisión y utilidad por canal en la ficha; la lista y las calculadoras muestran POS después de la comisión de terminal. POS = tasa NetPay (Amex/internacional en su parte) × parte de la venta fuera de Rappi cobrada con tarjeta en los últimos 30 días. Rappi sigue con `rappi_pct` sobre el precio con IVA; la gracia de tres meses se quita registrando 18 % desde la fecha real en Finanzas → Parámetros, lo que también aplica al P&L. La ficha usa la lista oficial Rappi vigente. Sin migración.

## 2026-10-29 · Lista oficial de precios Rappi · 20261029130000 · corrida en Supabase

Tabla `precios_rappi` con vigencia por producto y función `cargar_precios_rappi` (solo admin), que liga cada renglón del menú a productos del catálogo por nombre exacto normalizado y devuelve los que no encontró. Costeo y calculadoras usan la lista vigente y, sin ella, el último precio observado; el título del precio dice cuál es. Carga inicial `supabase/cargas/precios_rappi_menu_final_3.sql` desde "MENU DODO FINAL (3).xlsx" (hoja Sheet3): pizzas 30/35 cm a Mediano/Grande en masa tradicional y delgada, snacks, postres, bebidas y dips. No carga los siete combos propios de Rappi. Los costos siguen saliendo del BOM.

## 2026-10-23 · Fotos en manuales · 20261023120000 · pendiente de Supabase

Administración agrega y retira fotos numeradas en cada manual de Conocimiento. Bucket privado con la misma audiencia que el manual; borradores y puestos excluidos no ven las fotos. Reducción a JPG en el navegador para fotos del celular. Retiro lógico con historial. Detalle en fotos-manuales.md.

## 2026-10-07 · Reporte de ventas por canal

Tablero y PDF con ventas, pedidos, ticket y costo teórico separados POS/Dodo IS y Rappi. PDF añade detalle diario por fuente; Excel conserva hojas combinadas y agrega Resumen/Por día de POS y Rappi. Se separan las fuentes antes de combinarlas, conservando conciliaciones manuales de POS y las reglas existentes de inclusión de Rappi (Finalizado y sumar). La separación identifica la fuente importada, no el método de cobro ni el depósito bancario. No cambia P&L ni importaciones. Sin migración.

## 2026-10-07 · Pagos extraordinarios y reserva de bóveda · 0042 · pendiente de Supabase

Origen explícito transferencia o bóveda, motivo fuera de calendario y reserva de efectivo adicional al fondo para una factura. Salidas a corporativo conservan reserva y fondo; el pago parcial consume la reserva y afecta bóveda y corte sin doble gasto. Anulación con devolución actual e historial, y reintento del formulario sin duplicados. Administración gestiona y corporativo consulta. 422 pruebas locales y TypeScript; ensayo Supabase preparado. Flujo y límites documentados en pagos-boveda.md.

## 2026-10-07 · P&L sin venta bruta

Se retiran venta bruta total y sus desgloses POS/Rappi del P&L, comparativo, PDF y Excel. Venta neta y costos por fuente permanecen; margen y EBITDA no cambian. Las consultas y fuentes originales de Ventas se conservan. Sin migración. Validación: 421 pruebas y TypeScript. Banco (Excel Banregio) y Balance general (balance existente) pendientes de recibir los archivos; alcance preparado en banco-balance.md.

## 2026-10-07 · Activos · 0038

Inventario por unidad para sucursales existentes y aperturas. Costo de adquisición separado de valuaciones; historial de traslados, revisiones y servicios. Recepción de Aperturas limita unidades registrables. Administración captura; corporativo consulta. Validación reportada: 410 pruebas locales, TypeScript, build y PRUEBAS OK de Supabase. Main `4318228`; despliegue en producción no verificado en este registro.

## 2026-10-07 · Conocimiento y Asistente · 0039 · validado

Manuales con audiencia, borradores, versiones y edición de administración. Q&A visible a usuarios activos; todos preguntan y administración responde oficialmente. Ocho manuales iniciales sin reemplazar ediciones existentes. Documentación técnica en `docs/tecnica`.

Chat con Anthropic preparado para ventas, costos, cortes, manuales y P&L de oficina. Gerentes quedan fijados a su sucursal. Clave solo servidor, herramientas de lectura, fuentes verificables, cuotas y registro de consumo. Validación: 418 pruebas locales, TypeScript, build y PRUEBAS OK de Supabase reportado por el usuario. Pendiente: configuración Anthropic, validación real con proveedor y prueba de producción.

## 2026-10-07 · Diseño del chat

Vista de conversación con burbujas, sugerencias, fuentes por respuesta, indicador de consulta y compositor integrado. Enter envía; Shift + Enter agrega una línea. Las consultas fallidas conservan el borrador. Selector de sucursal y aviso de conexión compactos; privacidad desplegable. Sin cambio de permisos ni migración. Validación: escritorio y celular con datos ficticios, 418 pruebas, TypeScript y build. La conexión real con Anthropic sigue pendiente.

## 2026-10-07 · Márgenes de productos

Ficha de producto con margen bruto porcentual y en pesos por POS y Rappi, calculado sobre precio sin IVA (16 %) y costo vigente. Precio POS proviene de la versión BOM seleccionada; Rappi usa la última orden observada y conserva fecha, tienda y opciones. Referencias comparadas con costo de hoy, no utilidad histórica ni neta. Simulador de precio para un margen sobre venta, sin guardar objetivos ni modificar precios. Costos ausentes permanecen pendientes; pérdidas admitidas. Sin migración. Validación: 420 pruebas, TypeScript, build y vista con datos ficticios.

## 2026-10-07 · Orden a factura y pago · 0041 · pendiente de Supabase

Corrección de la prueba SQL: el pago de un anticipo sin recepción exige revisión documentada de la factura. La prueba original omitía ese paso y fue rechazada por registrar_pago. Ahora comprueba primero el rechazo y luego la revisión y el pago parcial. La ficha aclara cómo autorizar un anticipo sin registrar recepción ni cerrar la orden. Las validaciones financieras y la migración permanecen iguales. TypeScript y las 420 pruebas locales pasan; prueba SQL corregida pendiente de Supabase.

La orden confirmada ofrece Crear factura para pagar. Crea un documento Sin CFDI con referencia Prefactura OC, fecha de hoy, proveedor/sucursal de la orden, cantidades, unidades, precios e IVA sumado por renglón. Retenciones en cero: la orden solo contiene IVA. Conserva Oficina y usa cuentas por concepto heredadas del proveedor. Factura y vínculo se crean en una transacción. Si existe una factura vigente la devuelve; varias facturas requieren elegir. Abre la ficha con Registrar pago existente. El vínculo mantiene las reglas de cierre por recepción y facturación y su historial. Validación local: 420 pruebas, TypeScript, build y render de orden de ejemplo. Prueba SQL de copia, IVA mixto, Oficina, repetición, historial, pago parcial y corporativo preparada; ejecución en Supabase pendiente. Independiente de 0040.
