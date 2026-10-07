# Arquitectura y módulos

Next.js App Router, React y TypeScript; Supabase aporta sesión, Postgres, RLS, RPC y almacenamiento. Vercel publica el repositorio. La aplicación usa la sesión del usuario y la clave pública de Supabase; no requiere una service-role key para consultas o capturas.

## Mapa

| Módulo | Ruta | Fuente / reglas principales |
|---|---|---|
| Inicio, turnos y efectivo | `app/(app)` | `turnos`, `arqueos`, `movimientos`, `cierres_dia`, `gastos_caja_chica`; reglas SQL y `lib/arqueo`, `lib/turnos` |
| Checklists | `app/(app)/checklists` | Capturas de masa, amasado, limpieza, rondas y zonas; ventanas horarias y controles SQL |
| Ventas | `app/ventas` | `ventas_dia`, `ventas_producto`, datos brutos, Rappi y conciliaciones; `app/ventas/datos.ts` combina las fuentes |
| Costeo y BOM | `app/ventas/costos` | `costos_producto`, `bom_versiones`, `bom_recetas`; costos con vigencia y vínculos de productos/insumos |
| Compras | `app/compras` | Proveedores, artículos, órdenes, recepciones, facturas, conceptos y pagos; escrituras mediante RPC |
| P&L | `app/finanzas` | `datosPL` reúne datos; `vistaPL` y `lib/finanzas/pl.ts` calculan renglones, metas y avisos |
| Retenciones y mermas | `app/finanzas/retenciones`, `mermas` | Pagos con retenciones, enteros, importaciones de merma y costos con historial |
| Aperturas | `app/aperturas` | Proyecto, registros, estados, cantidades, evidencia y auditoría (`0037`) |
| Activos | `app/activos` | Inventario individual, valuaciones, mantenimiento y traslados (`0038`) |
| Conocimiento | `app/conocimiento` | Manuales publicados según puesto, preguntas y respuesta oficial (`0039`) |
| Asistente | `app/asistente`, `app/api/asistente` | Anthropic mediante AI SDK; herramientas de lectura reutilizan los cálculos existentes (`0039`) |

## Cálculos que deben mantenerse únicos

- Ventas y costo teórico: `app/ventas/datos.ts` y `lib/ventas/calculos.ts`; combinan Rappi habilitado y finalizado, conciliaciones y costos vigentes.
- P&L: `app/finanzas/datos.ts` y `lib/finanzas/pl.ts`; distingue canales, prorrateo de recibos, merma de insumos/productos y capturas faltantes.
- Efectivo: arqueos vigentes y movimientos confirmados. Un corte de turno no equivale al reporte de ventas importado.
- Activos: `lib/activos.ts` selecciona valuación por fecha efectiva y orden de registro; el costo de compra es otro campo. Los servicios cerrados conservan su registro.

Las lecturas extensas usan paginación. Supabase limita resultados por consulta: no reemplazar una lectura completa por una sola consulta de 1000 filas. Los resultados parciales de búsquedas deben identificarse como tales.

## Fechas

El día de operación cambia a las 4:00 de Ciudad de México (`hoyMX`, `rangoDiaMX`). Compras, vigencias y valuaciones usan día de calendario (`hoyCalendarioMX`). Los reportes importados de Dodo IS tienen su propio límite de día. No aplicar un mismo corte temporal a todos los módulos sin revisar su definición.

## Documentación existente por tema

Consultar también `docs/importar-rappi.md`, `importar-mermas-dodo.md`, `mermas-pl.md`, `conciliacion-ventas.md`, `costeo-bom.md`, `costeo-trazabilidad.md` y `proveedor-portales.md`. Los planes históricos en `docs/superpowers` explican decisiones de diseño; contrastarlos con el código actual antes de usarlos como instrucciones de operación.
