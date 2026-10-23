# Fotos en manuales de Conocimiento

Aplicar la migración 20261023120000_kb_fotos y ejecutar supabase/pruebas/20261023120000_kb_fotos.sql antes de publicar. La excepción PRUEBAS OK revierte la prueba completa.

Administración agrega fotos desde el manual (sección Fotos → Agregar foto), con descripción opcional. Se numeran por orden de carga («Foto 1», «Foto 2»…), así el texto puede citarlas como «ver foto 2». Máximo 30 fotos activas por manual.

Formatos: JPG, PNG o WebP de hasta 4 MB; el contenido se valida por firma, no por la extensión. En el navegador, las fotos de más de 1.5 MB o en HEIC se reducen a JPG de 1600 px antes de enviarse.

Bucket privado `manuales`. La política de kb_fotos repite la audiencia del manual: quien no ve el manual (borrador o puesto excluido) no ve sus fotos ni puede descargarlas de Storage. Las fotos se sirven por /conocimiento/fotos/[id] con la sesión del usuario.

Retirar una foto la oculta y conserva el archivo. Agregar y retirar quedan en kb_historial. Corporativo y demás puestos solo consultan.
