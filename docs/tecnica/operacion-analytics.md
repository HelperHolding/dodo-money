# Operación de Analytics

Ruta `/ventas/operacion`. Exportar Operational metrics > Unit Summary > Export to .CSV, una sucursal, moneda Local, Time Grain Day. El CSV real contiene encabezados ingleses y separador punto y coma. No incluye nombre de sucursal: el administrador selecciona y confirma la sucursal de origen. La fecha de disponibilidad se captura desde el aviso de Analytics.

Las duraciones numéricas del export están en milisegundos y se conservan así. Los porcentajes del export son fracciones. No se agregan días sin datos como ceros. Horas cero o faltantes dejan productividad sin datos suficientes. Preparación se pondera por pedidos con tiempo de cocina; cola por pedidos totales. La cuota de demorados usa el conteo >=15 minutos dividido por pedidos totales del CSV. Las paradas importadas son eventos; no equivalen a ventas perdidas.

Los datos no modifican ventas, costos o P&L. La migración 0056 crea importaciones y versiones diarias: la huella hace repetible un mismo archivo, el reemplazo requiere confirmación y conserva versión original con referencia a la importación que la reemplazó. Administración importa, corporativo consulta todas las sucursales y gerentes solo la propia mediante `ve_ventas`. Sin escritura directa para usuarios o anónimo.

Pruebas: parser con muestra real, promedios ponderados, duplicados, valores faltantes y cobertura; ensayo SQL reversible de RPC, permisos e historial. La carga inicial SQL conserva la muestra del 22 de septiembre al 11 de octubre, fecha de disponibilidad 11 de octubre. No se afirma sincronización automática ni acceso API.
