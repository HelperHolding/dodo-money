# Documentación técnica de DODO MX

Punto de entrada para quien desarrolla, mantiene o revisa la aplicación. Estado de referencia: funcionalidades fusionadas hasta Activos (`0038`); Conocimiento y Asistente (`0039`) requieren migración, pruebas y publicación.

## Documentos

- [Arquitectura y módulos](arquitectura.md): rutas, fuentes y cálculos.
- [Datos y permisos](datos-permisos.md): alcance por puesto, RLS y funciones.
- [Operación y cambios](operacion.md): pruebas, migraciones, publicación y actualización de documentos.
- [Asistente Anthropic](asistente.md): configuración, herramientas, límites y verificación.
- [Registro de cambios](cambios.md): cambios funcionales con su impacto y comprobación.

Los manuales para usuarios viven en Conocimiento. La carga inicial está en `supabase/cargas/0039_manuales.sql`; los cambios posteriores de administración viven en Postgres y conservan historial. Este directorio es documentación técnica versionada con el código; no reemplaza esos manuales.

Cada cambio de comportamiento debe actualizar el documento del módulo afectado, el registro de cambios y, cuando cambien pasos de operación, el manual correspondiente. Describe lo que el código realmente hace y anota explícitamente lo que aún está pendiente de verificar.
