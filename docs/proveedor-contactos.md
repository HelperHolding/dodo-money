# Contactos adicionales de proveedores

En Compras → Proveedores → ficha, «Agregar contacto» guarda nombre, puesto o área, teléfono y correo. Requiere nombre y al menos teléfono o correo. Administración puede editar, desactivar y reactivar; corporativo consulta. El contacto original sigue en los datos del proveedor y su edición/importación conserva el comportamiento anterior.

Aplicar `supabase/migrations/0043_proveedor_contactos.sql` y después `supabase/pruebas/0043_proveedor_contactos.sql`. La prueba requiere un admin activo, corporativo activo y un proveedor. Termina con la excepción intencional «PRUEBAS OK», que revierte sus cambios.

La tabla `proveedor_contactos` tiene RLS de lectura con `ve_compras()`, sin escritura directa para clientes. El RPC `guardar_contacto_proveedor` exige `edita_compras()`, vincula el contacto al proveedor y registra quién creó y actualizó cada fila. Desactivar conserva el registro. No cambia las funciones de portales, Vault ni compras existentes.
