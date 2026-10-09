# Recepciones completas y etiquetas

Recepciones de Compras muestra órdenes confirmadas y cerradas con cantidades recibidas completas en un acordeón. Cerradas no vuelven al calendario ni a la selección de clasificación. La vista de sucursal consulta renglones completos de su sucursal, incluyendo órdenes cerradas, bajo RLS; no permite repetir recepción desde el historial.

La lista unificada muestra Sin recibir, Recepción parcial y Ya recibido calculados con avanceOrden y renglones_recibido, que conserva las reglas de anulación y conciliación existentes. Facturas heredan avance de todas sus órdenes vinculadas: todas completas para Ya recibido. Sin vínculo o nota de crédito: sin etiqueta. Pago y programación no acreditan entrega.

No modifica permisos ni tablas; sin migración. Prueba cubre varias órdenes, parcial y factura pagada sin recepción.
