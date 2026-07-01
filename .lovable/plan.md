## Diagnóstico

La cuenta `zuzacande@gmail.com` existe en la base de datos:
- Perfil: `role = 'admin'` ✅ (los permisos están bien)
- `email_confirmed_at = NULL` ❌
- `last_sign_in_at = NULL` (nunca ha entrado)

El problema no es la contraseña ni el rol: es que **su email nunca fue confirmado**. Con Supabase, si el email no está confirmado, todos los intentos de login devuelven "Invalid login credentials" (que es exactamente el error que vemos en los logs de auth de hoy antes de que entraras tú). Un simple "reset password" no arregla esto de forma limpia si además no recuerda haber creado contraseña.

## Recomendación

En vez de solo resetear la contraseña, hacer las dos cosas juntas en un único paso administrativo:

1. **Confirmar su email manualmente** en Auth (marcar `email_confirmed_at = now()`), para que el login deje de rechazarla.
2. **Enviar un enlace de recuperación** a `zuzacande@gmail.com` para que ella misma establezca una contraseña nueva desde el correo.

Así:
- No le pasamos ninguna contraseña por chat/WhatsApp (más seguro).
- Ella hace un solo click en el correo → pone su contraseña → entra directamente al panel admin.
- Queda cubierto tanto el bloqueo por email sin confirmar como el "no sé mi contraseña".

## Pasos técnicos

1. Ejecutar migración puntual que actualice `auth.users.email_confirmed_at` para ese usuario si sigue en `NULL` (idempotente).
2. Disparar `password recovery` para ese email vía Auth Admin API (server function admin-only, o directamente desde el backend).
3. Verificar que existe la ruta `/reset-password` en la app — si no existe, crearla (formulario mínimo que llama `supabase.auth.updateUser({ password })` tras detectar `type=recovery` en la URL). Sin esta página el enlace de recuperación solo iniciaría sesión sin permitir cambiar contraseña.
4. Confirmar por chat cuando el correo esté enviado, para que Cande revise su bandeja (y spam).

## Alternativa (si prefieres)

Si no quieres depender del correo, puedo en su lugar:
- Confirmar el email y **fijar una contraseña temporal** (que te muestro por chat) para que ella entre y la cambie desde Perfil.

Menos seguro pero inmediato y sin depender de la entrega del email.

¿Voy con la **opción recomendada (confirmar email + enviar recovery + asegurar página /reset-password)**, o prefieres la **alternativa con contraseña temporal**?
