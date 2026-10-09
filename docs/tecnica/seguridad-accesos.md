# Refuerzo de accesos (0048)

Independiente de la precisión 0047. No cambia roles ni asignaciones existentes.

`mi_rol` y `mi_sucursal` no conceden permisos a perfiles con contraseña temporal. El propio perfil sigue siendo visible para el flujo de Mi contraseña. Un disparador en Auth libera la marca cuando cambia `encrypted_password`; `contrasena_cambiada` solo comprueba el resultado y mantiene compatibilidad con clientes anteriores. No permite quitar la marca mediante RPC. El trigger no devuelve ni registra contraseñas. También aplica al restablecimiento de contraseña gestionado por Auth.

Los cálculos de órdenes/facturación y complementos exigen `ve_compras`. Las recepciones admiten admin/corporativo y gerente/encargado de la misma sucursal. Operación, perfiles inactivos y temporales reciben NULL; anon no tiene EXECUTE. Las funciones internas conservan firmas y resultados para los usuarios autorizados.

Ejecutar migración 0048 y prueba 0048 en SQL Editor. La prueba termina mediante PRUEBAS OK para revertir todas las modificaciones, incluido el ensayo del trigger de Auth. No se ha ejecutado en Supabase desde este entorno. La prueba SQL del trigger no sustituye comprobar un cambio de contraseña real desde Mi contraseña en la aplicación y luego iniciar sesión de nuevo.

La prueba histórica 0009 deja de ser válida: antes esperaba que una RPC quitara la marca sin cambiar contraseña. Usar 0048 para el comportamiento actual.
