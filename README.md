# Control de efectivo · Dodo Pizza

Aplicación web para registrar arqueos de turno, movimientos entre cajas, caja chica y el cierre del día.
Reemplaza las hojas de papel de inicio, traspaso y cierre de caja.

Next.js 15 (TypeScript) + Supabase (Postgres, autenticación y seguridad por renglón). Se publica en Vercel.

## Cómo funciona

Cada sucursal tiene cuatro cajas y corporativo como destino:

| Caja | Qué guarda | De dónde entra | A dónde sale |
|---|---|---|---|
| Caja de venta | El cajón del POS | Fondo inicial desde bóveda, ventas | Retiros a bóveda |
| Fondo de cambios | Morralla | — | Solo cambios con la caja de venta (el total no cambia) |
| Bóveda | Efectivo de ventas por entregar | Retiros de la caja de venta | Fondo inicial y salidas a corporativo |
| Caja chica | Fondo fijo para gastos menores | Reposiciones desde corporativo | Gastos con comprobante |

Reglas que aplica la base de datos, no solo la pantalla:

- Cada tipo de movimiento solo puede ir por su ruta (un retiro a bóveda siempre va de caja de venta a bóveda).
- Todo movimiento queda pendiente hasta que **otra persona** lo confirma con su usuario. Nadie confirma lo que registró.
- Salidas a corporativo y reposiciones de caja chica solo las confirma un gerente. La salida exige folio o recibo (migración 0010: la caja "banco" pasó a "corporativo").
- Nada se edita ni se borra. Un error se corrige con un movimiento nuevo o rechazando el pendiente.
- El arqueo calcula en el servidor el fondo inicial y los retiros confirmados del turno:
  esperado = fondo + ventas en efectivo según Dodo IS − retiros a bóveda. Diferencia = contado − esperado.
- Guardar el arqueo de cierre cierra el turno. El día solo se cierra sin turnos abiertos ni movimientos pendientes.
- Solo encargados y gerentes abren turno; solo gerentes cierran el día.
- El día de operación cambia a las 4:00 (hora de Ciudad de México): un cierre o un movimiento después de medianoche
  cuenta para el día que termina, igual en efectivo, checklists y la vista de corporativo.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, corre `supabase/migrations/0001_control_efectivo.sql`.
3. Ajusta los montos de fondos en `supabase/seed.sql` y córrelo. Crea la sucursal Zapopan-1 y sus cinco cajas.
4. En **Authentication → Users**, crea cada usuario con correo y contraseña (desactiva el registro público en
   **Authentication → Providers → Email**, para que nadie se dé de alta solo).
5. Dale a cada usuario su perfil en el SQL Editor:

   ```sql
   insert into perfiles (id, nombre, rol, sucursal_id)
   values ('<uuid del usuario>', 'Luis Pérez', 'gerente',
           (select id from sucursales where nombre = 'Zapopan-1'));
   ```

   Roles: `operacion` (cocina y caja; antes `cajero`), `encargado`, `gerente`, `admin` (ve todas las sucursales).

### 2. Local

```bash
cp .env.example .env.local   # pega la URL y la anon key de Supabase → Project Settings → API
npm install
npm run dev                  # http://localhost:3000
```

### 3. Vercel

1. Sube la carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com), **Add New → Project** e importa el repositorio.
3. En **Environment Variables**, agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Deploy**. En Supabase → **Authentication → URL Configuration**, pon la URL de Vercel como Site URL.

La anon key es pública por diseño: la seguridad está en las políticas de la base de datos.
Nunca pongas la `service_role` key en Vercel ni en el código.

## Estructura

```
app/
  login/                 inicio de sesión
  (app)/page.tsx         saldos, turno y movimientos por confirmar
  (app)/arqueo/          arqueo de turno con conteo por denominación y diferencia en vivo
  (app)/movimientos/     bitácora de movimientos entre cajas
  (app)/caja-chica/      gastos y reposiciones
  (app)/cierre/          cierre del día del gerente
  (app)/checklists/      mermas, temperatura de masa y recorrido de supervisor
lib/                     cliente de Supabase, tipos, formatos, denominaciones
supabase/migrations/     esquema, reglas y seguridad por renglón
supabase/seed.sql        sucursal inicial
supabase/seed_checklists.sql  norma de masa, recorridos y productos de merma
supabase/pruebas/        pruebas de reglas para correr en el SQL Editor
```

## Checklists

Tres registros que antes eran de papel, en **Checklists** del menú:

| Registro | Cuándo | Quién | Regla |
|---|---|---|---|
| Temperatura de masa | Cada hora de 10:00 a 22:00 | Cualquier rol | Masa de 12 a 22 °C y bolas según la norma de la temperatura del área; si no, comentario obligatorio |
| Recorrido de supervisor | Cada hora, 12:00–17:00 (mañana) y 18:00–23:00 (tarde) | Encargado, gerente o admin | Los 7 puntos marcados; cada "no cumple" con comentario |
| Mermas | Cuando pasan; se cierran al final del día | Cualquiera registra; encargado, gerente o admin cierra | Producto de la lista, cantidad, motivo y nombre de quien la hizo; después del cierre no se agregan |

- Cada hora se puede registrar desde su inicio hasta 10 minutos después de que termina. La hora la fija el servidor.
- El día de mermas y del resumen cambia a las 4:00, para que el cierre nocturno cuente para el día que termina.
- Nada se edita ni se borra.

### Puesta en marcha

En Supabase → **SQL Editor**, corre en orden:

1. `supabase/migrations/0002_checklists.sql`
2. `supabase/seed_checklists.sql`
3. `supabase/pruebas/0002_checklists.sql`: debe terminar con el error `PRUEBAS OK — …` (es a propósito, para no dejar datos). Necesita un encargado y otro usuario activos en la misma sucursal (si no hay alguien de operación, el otro usuario actúa como operación solo durante la prueba).

Para cambiar el catálogo de mermas:

```sql
insert into productos_merma (categoria, nombre, unidad, orden) values ('Bebidas', 'Refresco 600 ml', 'pieza', 405);
update productos_merma set activo = false where nombre = 'Refresco';   -- quitar sin borrar
```

### Prueba manual

Con una ventana de incógnito por usuario:

1. **Operación** → Checklists → Temperatura de masa: registra la hora actual con la norma exacta y 18 °C. Debe guardarse sin comentario.
2. En la siguiente hora abierta, escribe 25 °C sin comentario: el formulario pide comentario; si lo quitas, la app responde "Escribe qué pasó: …".
3. **Operación** → Recorrido: debe decir que lo registra el encargado o el gerente.
4. **Encargado** → Recorrido: marca un punto como "No cumple"; sin comentario no se guarda. Con comentario, aparece en "Recorridos de hoy".
5. **Operación** → Mermas: registra "0,5" kg de Mozzarella con nombre de empleado. En totales aparece 0.5 kg.
6. **Encargado** → Mermas: marca "Ya capturé…" y cierra. El formulario desaparece y operación ya no puede agregar mermas.
7. **Gerente** → Checklists: el resumen muestra las horas en Listo, Revisar, Ahora o Falta, y al elegir el día anterior se ve su historial.

## Checklists de zonas

Las demás hojas del Excel, en **Checklists** (barra de accesos arriba):

| Pantalla | Qué se registra | Quién |
|---|---|---|
| Ronda de la hora | Cada hora: limpieza, zona caliente y caja y sala (8:00–23:00), baño (11:00–23:00). Cada zona se guarda por separado | Cualquiera con el nombre de quien revisó; el encargado marca Revisado |
| Listas del turno | Apertura, cambio de turno, durante el turno, cierre y tareas semanales del encargado y de cada zona | Zonas: cualquiera; encargado: encargado o gerente |
| Amasado | Un lote: horas, bolas, temperaturas (masa 24–26 °C), gramos, minutos | Cualquiera; comentario si algo sale de norma |
| Limpieza profunda | El área del día (ciclo de 14 días) | Cualquiera; el encargado la revisa |
| Objetivos | Empleado y objetivo por turno | Encargado o gerente |

Nada frena el efectivo: lo incompleto se ve en el resumen y en corporativo.

### Puesta en marcha

En Supabase → **SQL Editor**:

1. `supabase/migrations/0005_checklists_zonas.sql`
2. `supabase/seed_checklists_zonas.sql`
3. `supabase/pruebas/0005_checklists_zonas.sql`: debe terminar con el error `PRUEBAS OK — …`.

### Prueba manual

1. **Ronda de la hora:** llena solo Caja y sala con un nombre y guarda; aparece en "Rondas de hoy" y las demás zonas siguen pendientes. Empieza Limpieza sin nombre: la app pide completarla antes de enviar.
2. **Listas del turno:** abre Encargado · Mañana · Apertura como encargado y guárdala; la tarjeta cambia a "Hecho". Toca "Revisado": cambia a "Revisado". Como operación, la lista del encargado dice que la registra el encargado.
3. **Amasado:** escribe 28 °C en la masa: el campo se marca y el comentario se vuelve obligatorio.
4. **Limpieza profunda:** dice qué área toca hoy; regístrala y revísala.
5. **Resumen y corporativo:** aparecen rondas, listas del turno, amasado y limpieza profunda.

## Foto del ticket en caja chica

Al registrar un gasto se puede adjuntar la foto del ticket o recibo (opcional). En tablet y celular abre la cámara;
la app reduce la foto en el dispositivo antes de subirla. Las fotos quedan en un bucket privado de Supabase,
separadas por sucursal, y no se pueden reemplazar ni borrar. En la lista de gastos, "Ver foto" abre un enlace de 1 hora.

Puesta en marcha, en Supabase → **SQL Editor**:

1. `supabase/migrations/0003_foto_gastos.sql`
2. `supabase/pruebas/0003_foto_gastos.sql`: debe terminar con el error `PRUEBAS OK — …`.

## Usuario corporativo

Rol de **solo consulta** para oficina central. No tiene sucursal: al entrar ve la **vista general** con todas las
sucursales del día (efectivo, cierre, checklists, mermas y caja chica), con lo que merece atención en rojo y primero.
"Ver sucursal" abre las mismas pantallas del gerente sin formularios; "Volver a corporativo" regresa a la tabla.
La base de datos rechaza cualquier escritura de este rol.

### Puesta en marcha

En Supabase → **SQL Editor**:

1. `select * from perfiles where sucursal_id is null;` debe salir vacío (si no, asigna sucursal a esos perfiles).
2. `supabase/migrations/0004_corporativo.sql`
3. `supabase/pruebas/0004_corporativo.sql`: debe terminar con el error `PRUEBAS OK — …`.
4. Crea el usuario en **Authentication → Users** y su perfil, sin sucursal:

   ```sql
   insert into perfiles (id, nombre, rol)
   select id, 'Nombre Apellido', 'corporativo' from auth.users where email = 'correo@dominio.com';
   ```

### Prueba manual

1. Entra como corporativo: debe abrir la vista general, no el inicio de una sucursal.
2. Cambia el día a ayer: el cierre y las mermas sin cerrar aparecen en rojo si faltaron.
3. "Ver sucursal": arriba dice "Viendo … · Solo lectura" y no hay formularios en Inicio, Arqueo, Movimientos,
   Caja chica, Cierre ni Checklists. "Ver foto" en Caja chica sí abre.
4. "Volver a corporativo" regresa a la tabla. "Salir" cierra la sesión.

## Ventas y costos (importados de Dodo IS)

Mientras la API de Dodo IS no está disponible, un **admin** importa cada día los dos reportes de Dodo IS de cada
sucursal: **Ventas** y **Productos** (ProductsSales, método de cálculo "Con descuentos"), de un solo día.
Con eso, en **Ventas** se ven la venta diaria, los productos, los descuentos, el costo teórico con costo promedio
ponderado por categoría y las diferencias entre el cierre del gerente y Dodo IS.

- **Importar** (solo admin): se sube el archivo **Datos brutos** de Dodo IS (Informes → Datos brutos), de cualquier
  periodo de hasta 92 días y de una o varias sucursales → **Revisar** muestra cada día con pedidos, venta, comidas del
  personal y cancelados, y qué productos no tienen categoría o costo → **Guardar**. Si trae días ya importados,
  **Reimportar** los reemplaza completos (hay que marcar la casilla). El archivo no se guarda. Mientras se activa la API
  de Dodo IS, esta es la forma de cargar ventas; la API llenará los mismos datos.
- **Reportes por pedido:** venta por hora (mapa de calor), canales, comidas del personal y cancelados, tiempos de cocina
  y combos. Los días importados con el formato anterior (Ventas + ProductsSales) no tienen este detalle hasta reimportarlos.
- **Costos** (solo admin): categoría y costo por pieza de cada producto, con la fecha desde la que aplica.
  Un costo nuevo no borra el anterior; los días previos se siguen costeando con el que estaba vigente.
  Un error de captura se arregla con **Corregir** en el historial: el valor anterior queda registrado.
- **Reportes**: admin y corporativo ven todas las sucursales o una; el gerente, la suya. Encargado y operación no ven ventas.
  El costo % se calcula solo sobre los productos con costo; los que no tienen se listan aparte.
- Dodo IS cuenta el día de 0:00 a 23:59 y el cierre de la app hasta las 4:00: ventas después de medianoche pueden
  explicar una diferencia en "Cierre contra Dodo IS".

### Puesta en marcha

En Supabase → **SQL Editor**:

1. `supabase/migrations/0006_ventas_costos.sql`
2. `supabase/seed_ventas_costos.sql`
3. `supabase/pruebas/0006_ventas_costos.sql`: debe terminar con el error `PRUEBAS OK — …`.
4. `supabase/migrations/0007_datos_brutos.sql`
5. `supabase/pruebas/0007_datos_brutos.sql`: debe terminar con el error `PRUEBAS OK — …`.
6. `update sucursales set m2_comedor = 61 where nombre = 'Zapopan-1';` (para la venta por m²).
7. `supabase/migrations/0008_puesto_operacion.sql` (el puesto `cajero` pasa a `operacion`) y `supabase/pruebas/0008_puesto_operacion.sql` → `PRUEBAS OK`.

### Prueba manual

1. Como admin, en **Ventas → Importar**, sube el Datos brutos de Zapopan-1 del 21 al 28/09/2026: el 25/09 debe
   decir 39 pedidos y $7,736.00, y la semana 29 comidas del personal y 9 cancelados. Guardar.
2. Súbelo otra vez: los días salen con ⚠, el botón dice **Reimportar** y pide la casilla.
3. Sube el reporte de Ventas (no el Datos brutos): debe decir que no parece un Datos brutos.
4. En **Reportes**, el 25/09/2026: costo teórico $2,188.87 (33.9 %); Coca-Cola sin costo. Datos brutos no distingue la
   versión "T" de una pizza, así que la Pepperoni Grande T se cuenta como Pepperoni Grande (con los reportes viejos daba $2,187.19).
5. En **Costos**, "Sin costo" muestra las Coca-Cola; Hawaiana Mediano tiene el aviso de costo dudoso.
   Corrige su costo: el aviso desaparece y el historial dice "corregido (antes $44.09)".
6. Como gerente solo aparece su sucursal y no hay Importar ni Costos; como encargado no aparece Ventas en el menú.

## Usuarios y contraseñas

Cada persona tiene su propio usuario (nunca cuentas compartidas: nadie puede recibir su propio arqueo ni confirmar
su propio movimiento). Puestos: operación, encargado, gerente, admin y corporativo.

**Dar de alta** (lo hace un admin):

1. Supabase → Authentication → Users → **Add user → Create new user**: correo, una contraseña temporal distinta para
   cada quien y **Auto Confirm User**. La contraseña temporal se entrega en privado.
2. En el SQL Editor, el perfil con nombre, puesto y sucursal, marcado para cambiar la contraseña al entrar:

   ```sql
   insert into perfiles (id, nombre, rol, sucursal_id, debe_cambiar_contrasena)
   select u.id, 'Nombre Apellido', 'operacion', (select id from sucursales where nombre = 'Zapopan-1'), true
   from auth.users u where u.email = 'correo@dodopizza.mx';
   ```

3. Al entrar por primera vez, la app lo lleva a **Mi cuenta** y no lo deja usar nada más hasta que elige su
   contraseña. Después puede cambiarla cuando quiera desde **Mi contraseña**, en el encabezado.

**Dar de baja:** `update perfiles set activo = false where id = (select id from auth.users where email = 'correo@dodopizza.mx');`
El usuario ya no puede entrar; su historial se conserva.

### Puesta en marcha

`supabase/migrations/0009_cambiar_contrasena.sql` y `supabase/pruebas/0009_cambiar_contrasena.sql` → `PRUEBAS OK`.

## Siguiente paso: conectar con Dodo IS

Hoy las ventas se importan a mano desde los reportes de Dodo IS (ver "Ventas y costos"). Cuando vuelva el acceso a
la API, `/accounting/sales` puede llenar `ventas_dia` y `ventas_producto` automáticamente, y con `paymentMethod = Cash`,
agrupado por `cashBoxSessionId`, el efectivo del arqueo y del cierre del día.

## Compras (oficina central)

`/compras` es de oficina central: el **admin** edita y **corporativo** consulta. La sucursal no ve el catálogo.

- **Proveedores**: razón social, RFC (único; reconoce sus facturas), régimen fiscal del SAT, contacto, banco y CLABE (se valida el dígito verificador), días de crédito, forma de pago y qué surte. Nunca se borran: se desactivan.
- **Artículos**: nombre, unidad, tipo (consumible, activo fijo, servicio, otro), IVA y, en consumibles, el ID de insumo de Dodo IS. El último precio por proveedor se llena al confirmar órdenes de compra (fase 2).
- **Cargar Excel**: alta masiva de proveedores (Razón social, RFC, Régimen fiscal…) y de artículos (Nombre, Unidad, Tipo, IVA, ID de insumo Dodo IS); los encabezados se reconocen sin importar mayúsculas, acentos u orden. Si un renglón falla no se guarda ninguno.

Migración `0011_compras_proveedores.sql` y su prueba `supabase/pruebas/0011_compras_proveedores.sql`.
Diseño completo (fases 2–4: órdenes, facturas XML, pagos y calendario): `docs/superpowers/specs/2026-09-30-compras-design.md`.

- **Órdenes** (fase 2): cada documento empieza como cotización (borrador → enviada) y al confirmarlo es la orden de compra (folio OC-0001). "Pedir a otro proveedor" crea una cotización alternativa del mismo grupo; al confirmar una, las demás se cancelan solas. Confirmar actualiza el último precio de cada artículo con ese proveedor. PDF para mandar al proveedor en `/orden-compra/<id>`.
- **Recepciones**: los consumibles llegan del *Incoming supplies* de Dodo IS (Compras → Recepciones) y se ligan solos al renglón de la orden confirmada de la misma sucursal y el mismo insumo, entre la confirmación y 7 días después; lo que no se liga queda "Por revisar". Activos fijos, servicios y otros los registra el gerente o encargado en **Recepciones** de su sucursal (sin ver precios), con foto opcional. Una orden con algo recibido ya no se cancela: se cierra con motivo.

Migración `0012_compras_ordenes.sql` y su prueba `supabase/pruebas/0012_compras_ordenes.sql`.
