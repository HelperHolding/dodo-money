-- Después de la migración 0039. Repetible: conserva los manuales editados en la aplicación.
begin;
insert into public.kb_articulos(slug,titulo,categoria,contenido,roles,publicado) values
('bienvenida','Cómo orientarte en DODO MX','Inicio',$manual$OBJETIVO
Encontrar la pantalla correcta y distinguir los permisos del puesto.

PASOS
1. Entra con tu usuario personal. Si tienes contraseña temporal, cámbiala en Cuenta.
2. El menú muestra las secciones habilitadas para tu puesto. Operación captura checklists; encargados y gerentes trabajan con turnos; oficina administra Compras y Finanzas.
3. Conocimiento contiene manuales y Q&A. Cualquier usuario activo puede preguntar; administración publica respuestas oficiales.
4. El Asistente está disponible para gerentes, administración y corporativo. Un gerente consulta su sucursal; oficina puede elegir otra o consolidar.

VERIFICACIÓN
Revisa siempre el nombre de la sucursal, el periodo y los avisos antes de interpretar una cifra. Si una captura falta, no concluyas que el monto real es cero.$manual$,array['operacion','encargado','gerente','admin','corporativo'],true),
('turnos-cortes','Arqueos, cortes y cierre del día','Efectivo',$manual$OBJETIVO
Registrar el efectivo del turno y distinguir el corte del cierre diario.

PASOS
1. En Arqueo de turno abre o selecciona el turno autorizado para tu puesto.
2. Captura el conteo y la venta en efectivo de Dodo IS. El esperado considera el fondo y los retiros confirmados del turno; diferencia = contado menos esperado.
3. Revisa cualquier diferencia y su explicación antes de cerrar. Guardar el arqueo de cierre cierra el turno.
4. El gerente revisa Cierre del día. No debe haber turnos abiertos ni movimientos pendientes.
5. Consulta Turnos y sus reportes para revisar el origen de cada monto. Los arqueos anulados conservan historial y no cuentan como vigentes.

VERIFICACIÓN
El día de operación cambia a las 4:00 en Ciudad de México. Dodo IS usa su propio periodo de reporte; no confundas la venta importada con el efectivo contado ni sumes diferencias de apertura y cierre como si fueran una sola pérdida.$manual$,array['encargado','gerente','admin','corporativo'],true),
('gastos-sin-cfdi','Registrar un gasto sin CFDI y sustituirlo','Compras',$manual$OBJETIVO
Registrar una prefactura o gasto con cuenta por concepto y sustituirlo cuando llegue el XML.

PASOS
1. Compras → Facturas → Agregar sin CFDI.
2. Elige proveedor y revisa sucursal, cuenta, referencia, fechas y cada renglón. Una referencia identifica el gasto en las listas y en Pagos.
3. Para renta y agua, separa los conceptos y asigna Renta y Servicios a sus respectivos renglones.
4. Revisa subtotal, IVA, retenciones y total. El botón de persona física y arrendamiento calcula la regla disponible; revisa su aplicación al proveedor.
5. Registra el pago en Compras → Pagos.
6. Cuando llegue el CFDI, súbelo y elige qué gasto abierto sustituye. La sustitución pasa los pagos, conserva la sucursal del gasto y cancela el gasto anterior.

VERIFICACIÓN
No registres nuevamente el pago. Revisa las cuentas si la aplicación indica que no pudo trasladarlas con certeza. El periodo que cubre el recibo afecta su reparto en el P&L.$manual$,array['admin','corporativo'],true),
('mermas-pl','Importar mermas y revisar su impacto','Finanzas',$manual$OBJETIVO
Conservar la fuente de Dodo IS y revisar los costos que se incorporan al P&L.

PASOS
1. Descarga el reporte de mermas de Dodo IS para la sucursal y el rango que vas a importar.
2. En Mermas Dodo IS importa el archivo y revisa la cobertura de fechas, días vacíos y los montos.
3. Revisa costos sin IVA y vigencia. Un costo faltante o cero en el archivo requiere revisión; no equivale automáticamente a merma sin valor.
4. El P&L distingue merma de productos terminados y merma de insumos. Los insumos se descuentan como merma adicional al BOM según la regla acordada para esta operación.
5. Las correcciones de costos conservan el historial y la fuente original.

VERIFICACIÓN
Revisa sucursal, periodo, cobertura y avisos. La reimportación del mismo rango no debe sumar los registros dos veces; conserva otros días y los costos capturados conforme a las reglas del importador.$manual$,array['admin','corporativo'],true),
('costeo','Consultar costos y listas de materiales','Ventas',$manual$OBJETIVO
Encontrar el costo vigente y rastrear su receta y los insumos.

PASOS
1. Ventas → Costeo. Usa la vista de lista o la ficha del producto.
2. Revisa fecha de vigencia, costo y avisos. Un costo nuevo no reemplaza el que aplica a los días anteriores.
3. Abre el BOM o lista de materiales para ver cantidades, unidades y costos de cada insumo.
4. La ficha del insumo permite revisar su costo y las recetas relacionadas.
5. Los precios POS y Rappi tienen fuente y fecha: un precio observado en una orden no garantiza que sea el precio actual del menú.

VERIFICACIÓN
Se conserva el 1 % adicional configurado para periféricos. Revisa recetas sin vínculo o insumos sin costo antes de interpretar el margen. El gerente puede consultar ventas y costos mediante el tablero y el asistente dentro de su alcance; la administración del BOM corresponde a oficina.$manual$,array['gerente','admin','corporativo'],true),
('rappi','Importar órdenes de Rappi sin duplicar ventas','Ventas',$manual$OBJETIVO
Incorporar órdenes que todavía no forman parte de los datos de Dodo IS.

PASOS
1. Obtén el archivo de órdenes construido desde el historial de Rappi; el exportador estándar no necesariamente incluye ese detalle.
2. Importa en Ventas → Rappi y revisa sucursal, fechas, estados, productos y descuentos.
3. Reimportar permite actualizar el estado de las mismas órdenes sin agregarlas otra vez.
4. Solo las órdenes finalizadas y habilitadas para sumar entran a los cálculos de ventas.
5. Cuando Dodo IS empiece a incluir Rappi, revisa la opción de sumar y la cobertura antes de seguir importando por separado.

VERIFICACIÓN
No dupliques órdenes entre canales. El historial conserva la fuente importada; revisa los vínculos de productos para obtener su costo.$manual$,array['gerente','admin','corporativo'],true),
('aperturas','Dar seguimiento a una apertura','Aperturas',$manual$OBJETIVO
Coordinar actividades, obra, compras y validaciones hasta la apertura.

PASOS
1. Aperturas → proyecto de la sucursal. Revisa responsable, ventana objetivo y presupuesto.
2. Roadmap muestra las etapas; Actividades y Validaciones técnicas tienen seguimiento individual.
3. Equipo y compras distingue el plano de las referencias de una apertura anterior. Confirma aplicabilidad y cantidades antes de comprar.
4. Cada registro admite responsable, fechas, notas, evidencia, precio estimado y documentos de Compras de la sucursal.
5. Registra recepción parcial o completa con sus cantidades; después instalación y verificación.
6. En Activos registra una ficha por unidad recibida que requiera control individual.

VERIFICACIÓN
Las ventanas propuestas no garantizan apertura. Pedido o recepción no equivalen a equipo verificado. El estimado de compras no equivale a pagos ejecutados. Los cambios conservan historial.$manual$,array['admin','corporativo'],true),
('activos','Inventariar, valuar y mantener un activo','Activos',$manual$OBJETIVO
Controlar el equipo de sucursales activas y nuevas por unidad física.

PASOS
1. Activos → Agregar activo. Un registro representa una unidad: identifica sucursal, ubicación, categoría, estado, responsable, marca, modelo y serie.
2. Para equipo existente, deja el costo de compra vacío si se desconoce. Vincula proveedor y factura cuando estén disponibles.
3. Registra una valuación estimada con fecha, criterio y evidencia. Las nuevas estimaciones conservan el historial y no cambian el costo de adquisición.
4. Programa un mantenimiento preventivo o correctivo con fecha y técnico. El calendario señala próximos servicios y vencidos.
5. Para completar el servicio registra fecha realizada, costo y evidencia; usa costo cero si efectivamente no tuvo costo. Programa el siguiente servicio por separado.
6. Para trasladar el activo, edita su sucursal. Para una baja, registra su motivo y evidencia.

VERIFICACIÓN
Desde Aperturas no puedes registrar más unidades que las recibidas. Una valuación estimada no representa valor contable ni depreciación. Las fotos y documentos se referencian mediante enlaces en Evidencia.$manual$,array['admin','corporativo'],true)
on conflict(slug) do nothing;
commit;
select 'CARGA OK' as resultado,count(*) as manuales_iniciales from public.kb_articulos where slug in ('bienvenida','turnos-cortes','gastos-sin-cfdi','mermas-pl','costeo','rappi','aperturas','activos');
