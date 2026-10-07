# Datos y permisos

`lib/contexto.ts` valida sesión, perfil activo y cambio pendiente de contraseña. `lib/roles.ts` organiza el menú; ocultar un enlace no sustituye la validación del servidor ni RLS.

| Puesto | Conocimiento | Asistente | Operación / oficina |
|---|---|---|---|
| Operación | Manuales autorizados, leer Q&A y preguntar | Sin acceso | Checklists según función |
| Encargado | Manuales autorizados, leer Q&A y preguntar | Sin acceso | Turnos y operación según permisos actuales |
| Gerente | Manuales autorizados, leer Q&A y preguntar | Ventas, costos y cortes de su sucursal | Gestión de su sucursal; sin P&L central |
| Administración | Publicar manuales y respuestas oficiales | Todas las sucursales y P&L | Administra oficina |
| Corporativo | Manuales autorizados, leer Q&A y preguntar | Todas las sucursales y P&L | Consulta; conserva las excepciones existentes de recepción de efectivo |

Preguntar en Q&A es una autorización específica para todos los usuarios activos, incluyendo corporativo; no amplía sus permisos de escritura en Finanzas, Compras o Activos. El foro es visible para todos los usuarios activos: no usarlo para cifras privadas de una sucursal o credenciales.

## Conocimiento

`kb_articulos` conserva audiencia (`roles`), borrador/publicación y revisión. Solo administración modifica; la audiencia se valida en RLS. `kb_preguntas` permite publicación por usuarios activos y respuesta oficial por administración. `kb_historial` conserva versiones previas; solo administración lo consulta.

Funciones de escritura con `SECURITY DEFINER`, `search_path=''`, permisos de ejecución limitados y comprobación explícita del perfil. Las tablas no permiten escritura directa de `authenticated` ni `anon`.

## Asistente

La ruta autentica de nuevo, valida el origen y verifica el perfil antes de consultar. El gerente queda fijado a su sucursal y no puede pedir otra modificando el cuerpo HTTP. Las herramientas reciben ese alcance desde el servidor, no desde el modelo. Costos para gerentes: solo productos que aparecen en ventas de su sucursal. P&L no se ofrece al gerente.

Las herramientas usan el mismo cliente Supabase autenticado, por lo que RLS se conserva. No hay herramienta de SQL libre, claves de portales, escritura, pagos, navegación externa ni ejecución de comandos.

`ia_consultas` conserva usuario, sucursal del gerente, fechas, estado, modelo, consumo y enlaces consultados. No guarda preguntas ni respuestas. El usuario ve sus registros y administración puede consultarlos para revisión de uso. Las funciones de reserva/fin impiden cerrar consultas ajenas o cerrarlas dos veces.

## Secretos

La clave Anthropic vive en `ANTHROPIC_API_KEY`, solo servidor. Nunca publicarla en variables `NEXT_PUBLIC_*`, manuales, foro, Git, logs o mensajes de error. Los portales de proveedores mantienen su mecanismo separado con Vault y revelado auditado; no se conectan al chat.
