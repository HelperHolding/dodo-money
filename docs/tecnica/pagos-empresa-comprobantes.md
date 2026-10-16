# Razón social y comprobantes en Pagos

La primera columna muestra razón social y RFC receptor desde razones_sociales, incluyendo históricos inactivos. No se infiere empresa por sucursal. Aplica a hoy, rango y calendario.

Comprobante reúne el archivo original de facturas.pdf_ruta si es PDF/JPEG/PNG/WebP y todos los adjuntos confirmados vigentes con esos MIME. Cada archivo tiene botón, formato y nombre al pasar el cursor. No se requiere reclasificar archivos existentes. XML y PDF interno conservan sus botones separados.

Adjuntos permite vista inline solo para PDF e imágenes admitidas; los demás siguen descargándose. Se mantienen sesión, permisos, RLS y exclusión de retirados. No requiere SQL.
