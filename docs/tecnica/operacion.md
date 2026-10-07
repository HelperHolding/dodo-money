# Operación y cambios

## Validación de un cambio

1. Implementar en rama y revisar permisos del servidor y SQL además de la pantalla.
2. Ejecutar `npm test`, `npm run typecheck` y `npm run build`. Revisar el flujo afectado con datos de ejemplo y el alcance de corporativo/gerente.
3. Para cambios de base: entregar migración, carga si aplica y prueba SQL en ese orden. Ejecutar en el proyecto Supabase correcto. Las pruebas terminan intencionalmente con `P0001: PRUEBAS OK` para revertir los datos de prueba; las secuencias pueden dejar huecos sin datos persistentes.
4. Confirmar el resultado antes de fusionar. Registrar qué se comprobó y qué queda pendiente.
5. Subir main, comprobar despliegue y probar con sesión real. Un push exitoso no demuestra que Vercel terminó ni que el flujo completo funciona.

## Nuevos módulos

| Número | Migración | Carga | Prueba |
|---|---|---|---|
| 0037 | `0037_aperturas.sql` | `0037_dodo_2.sql`; antes requiere alta de la sucursal | `0037_aperturas.sql` |
| 0038 | `0038_activos.sql` | Inventario manual; no inventar activos o valuaciones | `0038_activos.sql` |
| 0039 | `0039_conocimiento_ia.sql` | `0039_manuales.sql`, repetible sin pisar ediciones | `0039_conocimiento_ia.sql` |

Las migraciones se ejecutan una vez. No volver a correr una migración con `create table` para corregir un error de carga: comprobar primero si la migración terminó y corregir la carga. Las futuras correcciones requieren una migración nueva para mantener el historial.

## Documentación por cambio

Actualizar el mapa de módulos si se añade una ruta, este catálogo si se añade una migración, datos/permisos si cambia alcance y el registro de cambios con resultado de validación. Si cambia el flujo del usuario, actualizar su manual desde administración y anotar la nueva versión en la revisión del cambio.

## Dependencias

AI SDK y su proveedor Anthropic se incorporan para `0039`; sus APIs se verifican contra la documentación instalada en `node_modules`. La auditoría npm observó avisos preexistentes en Next/PostCSS, Sharp y source-map-js durante este trabajo. No se hizo una actualización mayor de Next como parte del chat; revisar esas dependencias en un cambio separado y validar imágenes/build. No usar `npm audit fix --force` sin evaluar compatibilidad.

## Pendientes de verificación

0039 debe probarse en Supabase. El chat necesita una clave y un modelo habilitado en la cuenta Anthropic. La validación sin credenciales cubre permisos, validación de entradas y consultas de fuentes con mocks; no demuestra calidad de respuesta, latencia ni consumo real del proveedor.
