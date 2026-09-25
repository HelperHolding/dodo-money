# Control de efectivo · Dodo Pizza

Aplicación web para registrar arqueos de turno, movimientos entre cajas, caja chica y el cierre del día.
Reemplaza las hojas de papel de inicio, traspaso y cierre de caja.

Next.js 15 (TypeScript) + Supabase (Postgres, autenticación y seguridad por renglón). Se publica en Vercel.

## Cómo funciona

Cada sucursal tiene cuatro cajas y el banco como destino:

| Caja | Qué guarda | De dónde entra | A dónde sale |
|---|---|---|---|
| Caja de venta | El cajón del POS | Fondo inicial desde bóveda, ventas | Retiros a bóveda |
| Fondo de cambios | Morralla | — | Solo cambios con la caja de venta (el total no cambia) |
| Bóveda | Efectivo de ventas por depositar | Retiros de la caja de venta | Fondo inicial y depósitos al banco |
| Caja chica | Fondo fijo para gastos menores | Reposiciones desde el banco | Gastos con comprobante |

Reglas que aplica la base de datos, no solo la pantalla:

- Cada tipo de movimiento solo puede ir por su ruta (un retiro a bóveda siempre va de caja de venta a bóveda).
- Todo movimiento queda pendiente hasta que **otra persona** lo confirma con su usuario. Nadie confirma lo que registró.
- Depósitos al banco y reposiciones de caja chica solo los confirma un gerente. El depósito exige número de ficha.
- Nada se edita ni se borra. Un error se corrige con un movimiento nuevo o rechazando el pendiente.
- El arqueo calcula en el servidor el fondo inicial y los retiros confirmados del turno:
  esperado = fondo + ventas en efectivo según Dodo IS − retiros a bóveda. Diferencia = contado − esperado.
- Guardar el arqueo de cierre cierra el turno. El día solo se cierra sin turnos abiertos ni movimientos pendientes.
- Solo encargados y gerentes abren turno; solo gerentes cierran el día.

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

   Roles: `cajero`, `encargado`, `gerente`, `admin` (ve todas las sucursales).

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
3. `supabase/pruebas/0002_checklists.sql`: debe terminar con el error `PRUEBAS OK — …` (es a propósito, para no dejar datos). Necesita un encargado y otro usuario activos en la misma sucursal (si no hay cajero, el otro usuario actúa como cajero solo durante la prueba).

Para cambiar el catálogo de mermas:

```sql
insert into productos_merma (categoria, nombre, unidad, orden) values ('Bebidas', 'Refresco 600 ml', 'pieza', 405);
update productos_merma set activo = false where nombre = 'Refresco';   -- quitar sin borrar
```

### Prueba manual

Con una ventana de incógnito por usuario:

1. **Cajero** → Checklists → Temperatura de masa: registra la hora actual con la norma exacta y 18 °C. Debe guardarse sin comentario.
2. En la siguiente hora abierta, escribe 25 °C sin comentario: el formulario pide comentario; si lo quitas, la app responde "Escribe qué pasó: …".
3. **Cajero** → Recorrido: debe decir que lo registra el encargado o el gerente.
4. **Encargado** → Recorrido: marca un punto como "No cumple"; sin comentario no se guarda. Con comentario, aparece en "Recorridos de hoy".
5. **Cajero** → Mermas: registra "0,5" kg de Mozzarella con nombre de empleado. En totales aparece 0.5 kg.
6. **Encargado** → Mermas: marca "Ya capturé…" y cierra. El formulario desaparece y el cajero ya no puede agregar mermas.
7. **Gerente** → Checklists: el resumen muestra las horas en Listo, Revisar, Ahora o Falta, y al elegir el día anterior se ve su historial.

## Siguiente paso: conectar con Dodo IS

Hoy las ventas en efectivo se copian del reporte de Dodo IS. Cuando esté el acceso a la API,
`/accounting/sales` con `paymentMethod = Cash`, agrupado por `cashBoxSessionId`, puede llenar ese dato
automáticamente en el arqueo y en el cierre del día.
