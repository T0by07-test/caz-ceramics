# Estado de Stripe y limpieza del sistema de créditos

## 1. ¿Está listo Stripe?

Casi. La conexión con tu cuenta de Stripe está hecha y las claves live ya existen. Falta **el último paso: la verificación final (readiness check)** en la pestaña de Pagos. Hasta que se complete, la web solo cobra en modo prueba.

- Cuenta sandbox: conectada
- Cuenta live: conectada, app de Lovable instalada, claves live creadas
- Pendiente: comprobación de preparación (readiness check)

## 2. ¿Están bien conectados los productos?

Sí, la conexión es correcta y estable:

| Producto en la web | Precio | Identificador en Stripe |
|---|---|---|
| Plan 1 clase/mes | 30 € | plan_1_class_month |
| Plan 2 clases/mes | 55 € | plan_2_class_month |
| Plan 3 clases/mes | 70 € | plan_3_class_month |
| Plan 4 clases/mes | 85 € | plan_4_class_month |
| Clase de prueba (2 h) | 35 € | trial_class_single |
| Clase suelta / extra | 20 € | drop_in_class_single |

El checkout busca el precio por ese identificador en el momento del pago, así que el importe siempre viene de Stripe (no está escrito a mano en el código). Los cuatro planes de la base de datos apuntan a su producto correcto y están activos.

Nota: el precio que se muestre en la web y el de Stripe hay que mantenerlos sincronizados a mano; si cambias un precio en Stripe, hay que cambiar también el texto de la web.

## 3. Limpieza del sistema de créditos

La lógica de reserva ya no usa créditos (con plan del mes pagado se reserva libremente), pero quedan restos que confunden. Se limpian así:

**Base de datos**
- Quitar las columnas de créditos de las suscripciones (`credits_total`, `credits_remaining`) y actualizar las funciones que aún las escriben: alta de plan por Stripe, alta de plan en efectivo y la función de resumen mensual.
- Mantener intactas las recuperaciones (las clases canceladas a tiempo siguen guardándose y reservándose dentro del mes).

**Textos de la app**
- "Tus créditos están listos" → "Tu plan del mes está activo, ya puedes reservar tus clases".
- Cancelaciones: cambiar "recuperas el crédito" por "recuperas la clase".
- Mensajes de error: eliminar "No te quedan créditos en tu plan este mes".
- Notificaciones (email/WhatsApp): confirmación de reserva, alta de plan y resumen de fin de mes reescritos sin créditos (el resumen pasa a contar clases asistidas y recuperaciones pendientes).

**Incoherencia de la ventana de cancelación**
La web promete 12 horas, pero la app y la base de datos aplican 3 horas. Propuesta: unificar todo a **12 horas**, que es lo que se comunica públicamente. Si prefieres otro plazo, se cambia en un solo sitio.

## Detalles técnicos

- Migración: `ALTER TABLE public.subscriptions DROP COLUMN credits_total, credits_remaining`; recrear `grant_plan_subscription`, `grant_cash_plan_purchase` y la función de resumen mensual sin esas columnas; regenerar tipos.
- Ventana de cancelación: constante en `src/lib/booking.ts` + comprobación dentro de `cancel_booking` en la base de datos.
- Textos: `src/routes/app.plan-exitoso.tsx`, `src/routes/app.reservas.tsx`, `src/lib/booking.ts`, `supabase/functions/process-notifications/index.ts`.
- Tras la migración conviene publicar para que la versión publicada no quede desalineada con el esquema.
