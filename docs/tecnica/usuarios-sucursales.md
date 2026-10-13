# Usuarios y sucursales

Ruta: `/administracion/usuarios`, exclusiva de administración. Admin y corporativo se muestran fuera de los acordeones por su alcance general; operación, encargado y gerente se agrupan por sucursal. La sucursal del administrador es su selección operativa, no un límite de acceso. Buscar, rol y estado filtran al escribir. Abrir sucursal reutiliza el cambio de contexto existente, sin suplantar usuarios.

La migración 0057 permite modificar perfiles existentes mediante `administrar_usuario`: nombre, rol, sucursal y estado. Exige motivo, registra antes/después y autor, evita cambios sobre una versión obsoleta y repeticiones, protege el acceso propio y el último administrador. Contraseñas y altas de cuentas siguen en Supabase Auth. El historial es privado de administración y muestra los últimos 100 cambios. Una cuenta desactivada pierde los permisos mediante los helpers existentes de RLS. No se libera el cambio de contraseña pendiente.

Aplicar migración y ensayo 0057 antes de publicar. El ensayo revierte con `PRUEBAS OK`. La interfaz consulta perfiles sin exigir la migración; si falta el historial, deshabilita edición y muestra el pendiente. «Operación» queda fuera del menú; ruta, tablas e importaciones se conservan para retomar después.
