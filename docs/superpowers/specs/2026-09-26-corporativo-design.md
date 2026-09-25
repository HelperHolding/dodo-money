# Usuario corporativo: vista general de todas las sucursales, solo lectura

Fecha: 2026-09-26 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

Corporativo necesita ver la operación de **todas las sucursales** en un solo lugar, sin poder alterar nada. Hoy cada pantalla muestra solo la sucursal del usuario, y el `admin` opera igual que un gerente.

**Éxito:** un usuario corporativo entra, ve en una tabla qué sucursales tienen problemas en el día elegido (diferencias, pendientes, checklists incompletos, gastos sin comprobante), abre cualquier sucursal para ver el detalle y no puede registrar, confirmar ni cerrar nada, ni desde la app ni directo contra la base de datos.

**Fuera de alcance:** rangos de fechas y acumulados, gráficas, administración de usuarios o catálogos desde la app, ver días pasados en las pantallas de detalle (salvo el resumen de Checklists, que ya tiene selector).

## Decisiones tomadas

1. **Solo ver.** Corporativo no registra ni confirma nada en ninguna sucursal.
2. **Datos:** efectivo, cierres del día, checklists, mermas y caja chica (todas).
3. **Forma:** vista general (tabla de sucursales) con entrada al detalle de cada una en modo solo lectura.
4. **Periodo:** un día a la vez, hoy por defecto, con selector de fecha.
5. **Implementación:** rol nuevo `corporativo`, sin sucursal. El `admin` no cambia.

## Base de datos (migración `0004_corporativo.sql`)

### Rol

- `alter type rol_usuario add value 'corporativo'`.
- Postgres no deja **usar** un valor de enum en la misma transacción en que se agrega, y el SQL Editor corre cada script en una sola transacción. Por eso las funciones, políticas y la restricción de esta migración comparan con texto (`mi_rol()::text = 'corporativo'`) y nunca con `'corporativo'::rol_usuario`.
- Restricción en `perfiles`: `check ((rol::text = 'corporativo') = (sucursal_id is null))`. Corporativo nunca tiene sucursal; los demás roles siempre la tienen. Si hoy existe un perfil no corporativo sin sucursal, la migración falla con un mensaje que lo indica (se revisa antes con una consulta en el README).

### Lectura de todas las sucursales

- Función nueva `ve_todas_las_sucursales() returns boolean` = `mi_rol()::text in ('admin', 'corporativo')` (`stable`, `security definer`, `search_path = public`).
- Se recrean (drop + create, mismo nombre) las políticas de lectura que hoy dicen `… or mi_rol() = 'admin'`, cambiando esa parte por `… or ve_todas_las_sucursales()`:
  - 0001: `ver_sucursal`, `ver_perfiles`, `ver_cajas`, `ver_turnos`, `ver_arqueos`, `ver_movimientos`, `ver_gastos`, `ver_cierres`.
  - 0002: `ver_mermas`, `ver_cierres_merma`, `ver_lecturas_masa`, `ver_recorridos`, `ver_recorrido_respuestas`.
  - 0003: `ver_comprobante` (fotos de tickets en `storage.objects`).
- Los catálogos de 0002 ya son legibles por todos. La vista `saldos_cajas` es `security_invoker`, así que hereda las políticas.

### Nada de escritura

- Las políticas de inserción existentes exigen `sucursal_id = mi_sucursal()`. Con `mi_sucursal()` nulo, la comparación nunca es verdadera: corporativo no inserta en ninguna tabla.
- `registrar_recorrido` ya rechaza a usuarios sin sucursal.
- `confirmar_movimiento` y `recibir_arqueo` (0001) comparan `sucursal <> mi_sucursal() and mi_rol() <> 'admin'`; con `mi_sucursal()` nulo esa condición es nula y **no** rechaza. Se reemplazan (`create or replace`, mismo cuerpo) agregando al inicio: `if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;`.

### Pruebas (`supabase/pruebas/0004_corporativo.sql`)

Mismo formato que las anteriores (termina en `PRUEBAS OK — …` para deshacer todo). Usa un perfil existente convertido temporalmente en corporativo (sin sucursal) y comprueba:

- Lee turnos/movimientos/cajas de **dos sucursales distintas** (si solo existe una sucursal, crea una segunda dentro de la transacción).
- Rechaza: abrir turno, registrar movimiento, `confirmar_movimiento`, `recibir_arqueo`, gasto de caja chica, subir foto, merma, cierre de mermas, lectura de masa, `registrar_recorrido`, cierre del día.
- La restricción rechaza un corporativo con sucursal y un gerente sin sucursal.

## App

### Contexto y sucursal elegida

- `lib/contexto.ts`:
  - `obtenerContexto()` sigue devolviendo `{ supabase, user, perfil, sucursal, cajas, cajaPorTipo, turno }` y agrega `soloLectura: boolean`.
  - Para `corporativo`, la sucursal sale de la cookie `sucursal_vista` (httpOnly, `sameSite=lax`, ruta `/`). Si no hay cookie o la sucursal no existe → `redirect("/corporativo")`. Para los demás roles no cambia nada y `soloLectura` es `false`.
  - `obtenerContextoParaEscribir()`: igual que `obtenerContexto()`, pero si `soloLectura` redirige a la página de origen con `?error=Corporativo solo puede consultar.`. Todas las server actions que escriben la usan en lugar de `obtenerContexto()`.
  - `obtenerPerfil()`: sesión y perfil sin sucursal (para la vista general).
- `tipos.ts`: `Rol` agrega `"corporativo"`.

### Vista general (`app/corporativo/`)

- Fuera del grupo `(app)` porque no depende de una sucursal; layout propio con la misma barra (nombre del usuario, "Corporativo", Salir). Solo accesible con rol `corporativo` (los demás → `/`).
- Selector de día (`?fecha=`, hoy por defecto en día operativo de Ciudad de México, igual que Checklists).
- Resumen: número de sucursales, cuántas con alertas, venta total del día (suma de cierres).
- Tabla, una fila por sucursal, ordenada con las que tienen alertas primero y luego por nombre:

| Grupo | Columna | Fuente | Alerta (rojo) |
|---|---|---|---|
| Efectivo | Turnos | `turnos` del día: abiertos / cerrados | — |
| | Diferencia de arqueos | suma de `arqueos.diferencia` de momento `cierre` de los turnos del día | ≠ 0 |
| | Pendientes | `movimientos` en `pendiente` creados ese día | > 0 |
| | Depósito | suma de `deposito_banco` confirmados ese día | día cerrado con depósito 0 |
| Cierre | Cierre | `cierres_dia.cerrado_en` o "Falta" | falta y el día operativo ya terminó |
| | Venta total | `cierres_dia.venta_total` | — |
| | Bóveda | `cierres_dia.boveda_diferencia` | ≠ 0 |
| Checklists | Masa | lecturas registradas / horas de norma; fuera de norma | faltan horas ya cerradas o hay fuera de norma |
| | Recorrido | recorridos hechos / horas de checklists; con fallas | faltan horas ya cerradas o hay "no cumple" |
| | Mermas cerradas | `cierres_merma` del día | no cerradas y el día operativo ya terminó |
| Mermas y caja chica | Mermas | número de `mermas` del día | — |
| | Gastos | suma de `gastos_caja_chica.monto` con `fecha` del día | — |
| | Sin comprobante | gastos del día con `comprobante = 'sin_comprobante'` | > 0 |

- Carga: una consulta por tabla con `.in("sucursal_id", ids)` o por fecha, no una por sucursal.
- Lógica pura en `lib/corporativo.ts`: `alertasDeSucursal(datos, ahora)` y `ordenarSucursales(filas)`, con pruebas.
- Cada fila tiene el botón **Ver sucursal**: server action `verSucursal(id)` que guarda la cookie y redirige a `/`.
- En celular la tabla se desliza de lado; la columna de sucursal queda fija (`position: sticky`).

### Detalle en solo lectura

- Mismas pantallas de `(app)`. Si `soloLectura`:
  - Franja arriba: **"Viendo {sucursal} · Solo lectura · Volver a corporativo"** (enlace a `/corporativo`).
  - Menú: agrega "Corporativo" al inicio.
  - Se ocultan: abrir turno y confirmar/rechazar (Inicio), formulario de arqueo y recibir arqueo (Arqueo), formulario y confirmar (Movimientos), formulario de gasto y solicitar reposición (Caja chica), formulario de cierre (Cierre), botones Registrar y formularios (Checklists y sus tres pantallas).
- Enlaces "Ver foto" y tablas siguen visibles.

### Errores

- Acción de escritura con corporativo → aviso rojo "Corporativo solo puede consultar." (app) y el mismo texto desde la base de datos si se llega a ella.
- Corporativo con cookie de una sucursal inexistente → vuelve a la vista general.

## Verificación

- `npm test`: pruebas de `lib/corporativo.ts` (diferencia 0.00 no es alerta; día sin cierre es alerta solo si ya terminó; orden con alertas primero).
- `npm run typecheck` y build.
- `supabase/pruebas/0004_corporativo.sql` en SQL Editor.
- Guion manual en README: entrar como corporativo → vista general → ver sucursal → comprobar que no hay formularios → volver.

## Arranque

1. Revisar que no haya perfiles no corporativos sin sucursal (consulta en el README).
2. Correr `0004_corporativo.sql` y `pruebas/0004_corporativo.sql`.
3. Crear el usuario en Authentication y su perfil: `insert into perfiles (id, nombre, rol) values ('<uuid>', 'Nombre', 'corporativo');`.
