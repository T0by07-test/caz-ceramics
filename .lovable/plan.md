# WhatsApp Business para avisar a las alumnas

Objetivo: enviar por WhatsApp los tres avisos clave (confirmación de reserva, recordatorio antes de la clase, y cancelaciones/pérdida de plaza) desde el número del estudio **+34 661 499 026**, sin esperar respuesta de la alumna.

## Cómo quedará para ti

- Cada alumna con número de WhatsApp en su ficha recibirá:
  - **Al reservar**: sus clases, fecha/hora y el importe.
  - **El día antes**: recordatorio con fecha y horario.
  - **Si se cancela una clase o se libera su plaza por falta de pago**: aviso con el motivo.
- Los emails actuales siguen funcionando igual. WhatsApp se añade, no sustituye.
- En **Admin → Notificaciones** verás el estado de cada mensaje (enviado, entregado, leído o fallido).
- Mientras falte la configuración de WhatsApp, la app simplemente no envía WhatsApp y no rompe nada.

## Pasos de puesta en marcha (los haces tú, te acompaño)

1. Conectar WhatsApp Business en Lovable con el número +34 661 499 026. El número no puede estar ya registrado en WhatsApp y debe poder recibir un SMS o llamada.
2. Meta revisa el nombre público del negocio ("Cazú Ceramics"). Esa verificación puede tardar días o semanas; hasta entonces el envío a números nuevos está limitado.
3. Crear las plantillas de mensaje en español (las redacto yo, tú solo confirmas) y esperar la aprobación de Meta. Sin plantilla aprobada, WhatsApp no permite escribir primero a una alumna.
4. Probar con tu propio número antes de activarlo para todas.

Importante: fuera de las 24 h siguientes a un mensaje de la alumna, solo se pueden enviar plantillas aprobadas. Por eso los tres avisos van como plantilla.

## Plantillas previstas (español, UTILITY)

- `reserva_confirmada` — nombre, clases, importe.
- `recordatorio_clase` — nombre, fecha, hora de inicio y fin.
- `clase_cancelada` — nombre, clase afectada, si queda recuperación.
- `plaza_liberada_sin_pago` — nombre, clases, importe pendiente.

## Detalles técnicos

- **Envío**: nueva función de servidor `src/lib/whatsapp.server.ts` que llama al gateway de conectores (`POST /whatsapp/messages`, `type: "template"`) con `LOVABLE_API_KEY` + `WHATSAPP_API_KEY`. Nunca desde el navegador.
- **Integración con los avisos existentes**: la cola `notifications` y `process-notifications` ya cubren `reservation_confirmed`, `reminder_24h`, `class_cancelled` y `booking_released_unpaid`. Se añade un canal `whatsapp` junto al email: se lee `profiles.whatsapp`, se normaliza a E.164 sin `+`, y si falta número se omite el envío sin marcar error.
- **Registro de envíos**: tabla `whatsapp_messages` (notification_id, student_id, template, to_phone, provider_message_id, state `accepted|sent|delivered|read|failed`, error, timestamps) con RLS admin-only y GRANTs; se guarda `messages[0].id` de la respuesta.
- **Receptor de callbacks** (obligatorio para saber si se entregó): `src/routes/api/public/whatsapp/webhook.ts` con `verifyWebhookRequest` de `@lovable.dev/webhooks-js` (secreto = `WHATSAPP_API_KEY`, `maxBodyBytes: 4MB`), 401 si la firma falla. Cada entrega se guarda en `whatsapp_webhook_events` (`delivery_id` único, `event`, `payload`, `processed_at`, `processing_error`) con el cliente privilegiado, y luego se procesa de forma idempotente.
- **Conciliación de estados**: los `statuses[]` se cruzan por `status.id` con `whatsapp_messages.provider_message_id`; si el callback llega antes que el envío se guarda pendiente y se aplica después. No se degrada `delivered`/`read` a `sent`; se conserva el timestamp de Meta y los `errors[]`. Filas no procesadas se reintentan con programación equitativa; 5xx si el procesado falla.
- **Mensajes entrantes**: se guardan en el inbox pero no disparan ninguna acción automática (decisión: sin respuestas).
- **Migraciones**: en `supabase/migrations/` + aplicadas vía la herramienta de migración; `process-notifications` requiere redeploy.
- **Admin → Notificaciones**: columna con el estado de WhatsApp por aviso.

## Fuera de alcance

- Responder SÍ/NO para confirmar o cancelar desde WhatsApp.
- Mensajes de marketing o resumen mensual.
- Chat bidireccional dentro de la app.
