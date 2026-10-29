# Calendario de cumplimiento

`/cumplimiento` muestra en un calendario mensual obligaciones (permisos, licencias, protección civil, extintores, trámites fiscales y seguros), compromisos fijos que comprueban servicio y mantenimientos de activos. Todo sale de `cumplimiento_en_rango(desde, hasta, hoy)`: las cumplidas se pintan en su fecha real y lo demás en su vencimiento. Filtros por origen, estado y sucursal o razón social; Activos enlaza con el origen `mantenimiento` ya elegido.

Las obligaciones se cierran en su detalle con al menos una foto y un PDF; si llevan pago, quedan *cumplidas sin factura* hasta ligarla. Compromisos y mantenimientos se cierran en sus pantallas. La franja de alertas del inicio y del calendario usa la misma ventana que los avisos de n8n (`docs/n8n-cumplimiento.md`). Migración: `20261029150000_calendario_cumplimiento.sql`.
