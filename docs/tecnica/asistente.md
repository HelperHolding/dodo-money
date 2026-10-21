# Asistente con Anthropic

## Activación

En Vercel, configurar variables solo de servidor para el entorno de publicación:

- `ANTHROPIC_API_KEY`: clave de la cuenta Anthropic; guardarla como secreto.
- `ANTHROPIC_MODEL`: identificador exacto del modelo habilitado en esa cuenta. No se fija un modelo silenciosamente; elegirlo según costo y capacidad de herramientas.

Para desarrollo, usar `.env.local` sin versionarla. `.env.example` contiene solo valores vacíos. Después de configurar en Vercel, desplegar de nuevo. Sin ambas variables, la pantalla muestra conexión pendiente y no consume consultas.

El proveedor usa la API directa de Anthropic mediante `@ai-sdk/anthropic`, según la elección del usuario. No se configuró AI Gateway. Referencias oficiales: [proveedor Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic), [ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent), [modelos Anthropic](https://platform.claude.com/docs/en/models/overview).

## Herramientas de lectura

| Herramienta | Fuente | Alcance |
|---|---|---|
| Ventas | `datosVentas`, `resumenVentas`, `costeo` | Selección del servidor, 1–31 días; misma combinación Dodo/Rappi que el tablero |
| Cortes | Turnos y arqueos vigentes | Selección del servidor, 1–31 días; señala truncación y turnos abiertos |
| Costos | Catálogo y costo vigente por fecha | Máximo diez coincidencias; gerente solo productos vendidos en su sucursal |
| Manuales | Artículos publicados y autorizados por RLS | Tres coincidencias; texto recortado con aviso |
| P&L | `datosPL`, `vistaPL` | Administración/corporativo; mes o semana ISO igual que la pantalla, con corte de periodo en curso |

Las fuentes se construyen en el servidor; el modelo no suministra enlaces de navegación. Los resultados contienen fecha, periodo, alcance y avisos. Costos faltantes y búsquedas truncadas deben distinguirse de ceros.

## Límites y registro

Primera versión: veinte consultas por usuario por día de calendario en México; hasta tres por minuto; cuatro pasos de agente, ocho consultas de fuentes por respuesta, 1800 tokens de salida por paso, sin reintentos automáticos y timeout de 45 segundos. Mensajes solo texto, máximo diez, 20000 caracteres totales; preguntas de hasta 2000 caracteres. No admite mensajes del cliente de tipo system/tool ni archivos.

Las conversaciones viven en memoria de la pestaña. Cambiar la sucursal o Nueva conversación borra ese contexto local. Preguntas y resultados necesarios se envían al proveedor; no se almacenan como conversación en nuestra base. La auditoría registra metadatos y fuentes. Una consulta fallida puede haber consumido tokens del proveedor; si no se obtiene uso, el registro deja consumo desconocido.

## Prueba real después de configurar

1. Comparar un costo conocido y su vigencia con la ficha.
2. Comparar ventas y costos de un periodo con el tablero, incluyendo un producto sin costo y un día sin importación.
3. Comparar un corte con su reporte y comprobar que no cuenta un arqueo anulado.
4. Probar como gerente: su sucursal disponible; petición forjada para otra debe fallar; sin herramienta de P&L.
5. Probar instrucciones maliciosas en una pregunta o manual: las herramientas deben seguir sin escritura y con el mismo alcance.
6. Comprobar cuotas, errores de clave/modelo, timeout y enlaces de fuentes. Registrar latencia y consumo real antes de ampliar límites.

El chat aún no consulta activos, mantenimiento, órdenes o contraseñas de proveedores. Añadir una fuente exige una herramienta explícita, validación de entradas, pruebas de permisos y actualización de esta documentación.

## Presentación y seguimiento

Las respuestas se muestran en Markdown con tablas GFM, listas, encabezados, citas y código. No se interpreta HTML ni se cargan imágenes; los enlaces navegables se limitan a las fuentes devueltas por el servidor.

Al terminar una respuesta se ofrecen hasta tres preguntas de seguimiento según la consulta y sus fuentes (ventas, cortes, costos, P&L o ayuda). Se generan localmente sin otra llamada al modelo. Pulsar una envía esa pregunta con el contexto de la conversación y la misma sucursal; se aplican los mismos permisos y cuotas. Durante la consulta se ocultan para evitar envíos duplicados. Si falla, la pregunta queda en el compositor para reintentar.
