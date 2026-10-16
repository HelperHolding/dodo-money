# Última factura por artículo

Compras y facturas permite buscar conceptos registrados, con coincidencias aproximadas de nombres y búsqueda inmediata. «Buscar solo por artículo / concepto» limita la búsqueda a esos textos; «Solo la última factura del artículo» devuelve un documento de ingreso vigente, incluida una factura pagada, por fecha de emisión descendente. Empates de fecha usan la fecha de registro y después una clave estable. Las coincidencias literales tienen prioridad; las aproximadas se usan si no hay una literal dentro de los filtros.

Se excluyen canceladas, sustituidas y notas de crédito aunque esté activada la visualización de canceladas. Se conservan los filtros de razón social, proveedor, sucursal, estado y periodo. Sin consulta escrita se pide el artículo en vez de mostrar arbitrariamente la última factura de todo el sistema.

Los conceptos se consultan desde factura_conceptos mediante la sesión y RLS existentes. No se infiere que una factura contiene todos los artículos de sus órdenes ligadas, ni se confunde un nombre de proveedor con un concepto en el modo artículo. Si la factura tiene conceptos genéricos y no identifica «alitas», es necesario ajustar la consulta o revisar el documento; no se crea una asociación automática.

Hay accesos desde Artículos (lista y tarjetas) y desde Pagos. No requiere migración y no cambia documentos, precios ni cuentas.
