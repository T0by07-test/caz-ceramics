# Cancelación parcial antes de pagar — comprobación

## Resultado

Cuatro clases sin pagar: 85 €. Al cancelar una: 70 €. Al cancelar dos: **55 €**, no los dos incrementos antiguos de 15 €. Canceladas sin recuperar no cuentan; las recuperadas vuelven a contar. No se modifican cobros confirmados ni se generan devoluciones.

## Cambios aplicados

- Migraciones `0028_quote_current_pending_bookings` y `0029_current_pending_quotes_and_cash_settlement` aplicadas al Lovable Cloud compartido.
- `pending_booking_amounts` valida identidad y propiedad; personal autorizado mantiene su acceso. Su núcleo `current_pending_booking_amounts` es exclusivamente de servicio y alimenta checkout y avisos nuevos.
- Reservas, próximos cobros, Ingresos, Admin → Pagos y ficha de alumna muestran deuda actual; los pendientes alternativos no se suman dos veces. Importes editados de efectivo, pagos confirmados e historial fallido se preservan.
- Stripe toma la misma cotización para reservas pendientes; las reservas nuevas de 0 € siguen usando el cálculo de nuevas selecciones. Una confirmación de tarjeta sincroniza el efectivo alternativo del ledger y recalcula solo pendientes de su mes.
- Finanzas se actualiza al cambiar el ledger. Las reservas liberadas no muestran un importe fallido como deuda actual.
- Avisos nuevos de reserva por expirar/liberada usan cotización actual. No se cambian los plazos ni avisos históricos. Cancelaciones de alumna, estudio, automáticas y retirada/restauración mantienen sus caminos de recálculo mensual.

## Pruebas reales, con datos ficticios

- 95 pruebas unitarias correctas en 14 archivos; tres regresiones nuevas de deuda actual/55 €, preservación del historial y efectivo editado. Build OK; sin errores del navegador.
- `supabase/tests/pending_booking_cancellation.sql`: rollback verifica 85→70→55 €, recuperaciones 70→85→55 €, ledger 55 €, otro mes intacto, snapshot de tarjeta intacto, privacidad y pagos confirmados intactos.
- `supabase/tests/pending_payment_paths.sql`: rollback verifica cotización de UI/servicio y aviso por 55 €, efectivo editado a 27 €/0 €, simulación de confirmación sin cargo, ledger efectivo alternativo a 0 €, confirmación repetida y posterior cancelación sin alterar historial confirmado.
- Alumna temporal en localhost: selección de cuatro fechas/horas por 85 €, reserva en efectivo, cancelación de las dos primeras por 70→55 €, recarga mantiene 55 €. Móvil 390×844 sin desbordamiento y ordenador comprobados.
- Stripe **sandbox** mostró 55 € y las dos fechas/horas; no se introdujeron datos de tarjeta ni se confirmó pago. Checkout de prueba cerrado al finalizar.
- Administración autenticada: Ingresos agrupa dos clases por 55 €, cuaderno conserva 55 €, Admin → Pagos muestra dos pendientes por 30 € y 25 € y conserva filas fallidas históricas.
- Datos ficticios de clases, reservas, pagos, recuperaciones, avisos y ledger retirados. No se usaron alumnas reales para pruebas.

## Despliegue

- Lovable Cloud: ambas migraciones aplicadas.
- Función existente `create-checkout`: desplegada; hash entregado por herramienta `e0d395c85ea6152f2440fece87bb722d9c7f207da99d2779c4cdcc87b99be90d`.
- Web: cambios en vista previa, **sin publicar**, según lo pedido por Cande. La web publicada necesita su actualización para mostrar estas pantallas.