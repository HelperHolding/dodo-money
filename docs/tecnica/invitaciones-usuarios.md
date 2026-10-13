# Altas por invitación

## Configuración antes de publicar

1. Aplicar migración 0058 y ensayo 0058. El ensayo usa cuentas ficticias en una transacción que revierte; no envía correos.
2. Vercel → Settings → Environment Variables: configurar `SUPABASE_SERVICE_ROLE_KEY` como variable privada del servidor, solo Production; configurar `APP_URL=https://dodo-money-j31t.vercel.app`. No usar prefijo NEXT_PUBLIC para la clave. No copiarla al chat ni al repositorio. El cliente privilegiado no persiste sesiones ni entra al navegador.
3. Supabase → Authentication → URL Configuration: Site URL `https://dodo-money-j31t.vercel.app`; añadir `https://dodo-money-j31t.vercel.app/invitacion` a Redirect URLs.
4. Supabase → Authentication → Email Templates: en **Invite user**, usar este enlace:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=invite">Aceptar invitación y crear contraseña</a>
```

En **Reset password**, usar:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Crear tu contraseña de Dodo MX</a>
```

5. Configurar SMTP de producción en Supabase Auth. El servicio de correo predeterminado puede restringir destinatarios. Confirmar que el remitente autorizado y la entrega funcionan con una cuenta de prueba controlada antes de invitar al equipo.

## Flujo y límites

Solo un administrador activo y sin contraseña pendiente reserva el alta. La reserva privada almacena correo, nombre, rol, sucursal y autor. La API administrativa envía la invitación. Un trigger crea el perfil con contraseña pendiente, tomando el rol de la reserva y no del metadata del usuario. Auth revierte la creación si falla su transacción. La confirmación de correo no libera permisos; el cambio real de contraseña lo hace con el trigger de 0048. La página `/invitacion` solo permite establecer contraseña a una cuenta activa con invitación pendiente y correo verificado. `/auth/confirm` acepta exclusivamente tokens invite/recovery y redirige a una ruta fija, sin devolver el token.

El reenvío mantiene asignaciones y autor original, registra al administrador que lo solicita y usa una espera de un minuto. Si la persona ya confirmó el correo pero no creó contraseña, se envía recuperación; si no confirmó, se reenvía invitación. Las cuentas existentes no se reasignan por invitar el mismo correo. Una cuenta desactivada o con contraseña terminada no se reenvía. Los resultados de SMTP pueden confirmar la solicitud de envío sin garantizar recepción; la interfaz muestra errores y permite reintento. Un fallo de red con resultado desconocido se recupera usando la misma reserva y su cuenta asociada, sin crear otra.

Registro de altas y envíos: `usuarios_invitaciones_historial`, privado de administración. Las invitaciones pendientes se muestran en la pantalla de usuarios; las aceptadas se conservan en base. El cambio de perfil continúa en historial 0057.

## Validación

Compilación, tipos y pruebas de acciones con Auth simulado verifican autorización, primer envío, reenvío, error y contraseña. El ensayo SQL comprueba permisos y triggers; el administrador lo ejecuta en Supabase. Falta validar la entrega real y aceptar un correo en un dispositivo diferente después de configurar SMTP y plantillas.

Fuentes oficiales: [Invitar usuario](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [plantillas de correo](https://supabase.com/docs/guides/auth/auth-email-templates), [implementación de reenvío de invitaciones](https://github.com/supabase/auth/blob/master/internal/api/invite.go).
