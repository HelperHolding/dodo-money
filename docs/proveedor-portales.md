# Accesos de portal de proveedores

En Compras → Proveedores → ficha del proveedor, administración tiene una sección independiente con enlace HTTPS, usuario, contraseña y notas. Se captura después de dar de alta al proveedor. Un acceso por proveedor. Corporativo y sucursales no consultan esta sección ni sus datos.

Contraseñas en Supabase Vault, cifradas en reposo. La ficha inicial solo recibe los datos del portal y un indicador de contraseña; el botón Mostrar la solicita mediante una acción de servidor y un RPC que verifica el rol admin activo. Se oculta después de un minuto, al ocultar la pestaña y al guardar. No se almacena en localStorage. Guardados y revelados quedan auditados sin copiar la contraseña al historial. Vacío conserva; quitar elimina el secreto; actualizar reutiliza el secreto existente. La edición normal y las importaciones del proveedor no cambian el portal.

Aplicar `supabase/migrations/0036_proveedor_portales.sql` y después `supabase/pruebas/0036_proveedor_portales.sql`. La prueba requiere admin activo, corporativo activo y un proveedor, y revierte todos sus cambios mediante la excepción PRUEBAS OK. La migración requiere Supabase Vault y revoca acceso de PUBLIC/anon/authenticated al esquema, tablas y funciones de Vault; el acceso de la app pasa exclusivamente por funciones SECURITY DEFINER con search_path vacío. El propietario de la base y administradores del proyecto Supabase mantienen sus privilegios de infraestructura.

Referencia técnica: https://supabase.com/docs/guides/database/vault
