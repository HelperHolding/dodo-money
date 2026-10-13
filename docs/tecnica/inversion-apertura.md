# Inversión de apertura

Ruta `/aperturas/inversion`, accesible desde Aperturas para administración y corporativo. Administración añade vínculos; corporativo consulta.

La migración 0055 conserva la fuente histórica como JSON con huella SHA-256. Su carga inicial contiene 66 movimientos del mayor y 126 detalles por $2,980,978.33. Se verificó cada detalle contra su movimiento de origen. El total se calcula exclusivamente desde detalles; no suma el mayor ni los activos otra vez.

La fuente pertenece a Zapopan-1. `pagador_fuente` conserva Comercializadora Master Sitru según el mayor: no crea una transferencia interempresa ni determina propiedad fiscal. Los importes mezclan bases de facturas y transferencias según el Excel; no se presentan como total sin IVA.

Los vínculos a proveedor, factura y activo se añaden con motivo, autor y fecha, sin modificar datos fuente, crear pagos ni afectar P&L. Las facturas y activos deben pertenecer a la misma sucursal. Los vínculos duplicados devuelven el existente. No hay escritura directa para authenticated o anon.

Conservar los repartos de obra como estimaciones: el total pagado a César no establece el costo individual de cada equipo. El JSON también conserva partidas estimadas, pendientes y mayor para posteriores vistas.

Aplicación: migración 0055, prueba 0055 (reversible, termina en PRUEBAS OK), carga `supabase/cargas/inversion_zapopan_1.sql`. La carga es repetible por huella y no reemplaza fuentes anteriores. Ejecutar la carga desde SQL Editor como las cargas históricas anteriores.
