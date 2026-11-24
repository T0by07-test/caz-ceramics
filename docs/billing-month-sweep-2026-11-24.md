# Comprobación del sábado que cuenta para diciembre

## Regla

Las clases del sábado 28 de noviembre, a las 10:00 y a las 17:00, forman parte de la tarifa de diciembre para alumnas regulares. Su fecha de asistencia sigue siendo noviembre. Las recuperaciones siguen perteneciendo al mes calendario de la clase original, no al mes de tarifa.

La selección exacta de la captura de Cande es:

- 28 de noviembre, 17:00–19:00.
- 2 de diciembre, 15:00–17:00.
- 9 de diciembre, 15:00–17:00.
- 16 de diciembre, 10:30–12:30.

Son cuatro clases de diciembre: **85 €**, no 30 € + 70 € = 100 €.

## Lugares revisados y resultado

| Lugar | Verificación y resultado |
| --- | --- |
| Calendario de alumnas y sus vistas; carga mensual compartida con Admin → Clases | Código leído: `useClassesInRange` carga `billing_month`; `useMonthClasses` lo conserva; el calendario mantiene las fechas reales. No se cambian horarios, aforo ni asistentes. |
| Selección, navegación entre meses y elección de pago | Interfaz autenticada comprobada con las cuatro fechas exactas: selección conservada, una agrupación «diciembre de 2026 · 4 clases», todas las fechas/horas y 85 €. `useSelectionQuoteBreakdown` conserva el mes de tarifa y llama al cálculo autenticado por ese mes. |
| Cotización y asignación del importe por reserva | SQL vivo leído y probado: `class_billing_month`, `prior_adult_seats`, `prior_adult_slot_seats`, `drop_in_amounts`, `quote_my_selection`. La cotización se ordena ahora por mes de tarifa, evitando reiniciar un tramo cuando las fechas calendario intercalan meses de tarifa diferentes. |
| Reservar clases ordinarias | `book_class` leído: crea reservas y una fila provisional de 0 €, no fija una tarifa mensual. El cobro usa los importes del servidor. Flujo ficticio ejecutado desde la interfaz. |
| Efectivo, selección de varias clases y selección individual | `pay_drop_in_cash_batch` y `pay_drop_in_cash` usan el mismo cálculo. Nuevos pendientes y entradas de ingresos quedan separados por mes de tarifa; no crean otra deuda para reservas ya pagadas. Probados 85 € para cuatro clases y +25 € tras una clase pagada de 30 €. Interfaz de confirmación y lectura en Mis reservas comprobadas. |
| Mis reservas y cambio de efectivo a tarjeta | Código y pantalla comprobados: agrupa por `billingMonthKey`, muestra las cuatro fechas/horas y 85 €, y ofrece pagar con tarjeta. No suma intentos alternativos de pago como deudas adicionales. |
| Preparación de Stripe, tarjeta/Bizum y pago alojado/incrustado | `create-checkout` leído y corregido: carga `billing_month` y agrupa los importes del servidor con el mismo helper puro del navegador. Se abrió una sesión Stripe **sandbox** con una sola línea «diciembre 2026 (4 clases)» por 85 €. No se introdujo tarjeta ni se completó un pago. Ambos formatos comparten la construcción de líneas. |
| Confirmación de tarjeta y recibo de ingresos | Código leído en las dos implementaciones del aviso de Stripe: ahora comparten `record_drop_in_ledger`. SQL probado con un pago sintético confirmado: mes de diciembre, fecha de registro real independiente, importes exactos e idempotencia. Los recibos ya existentes no se reescriben ni duplican. `app.pago-exitoso` solo consulta estados y no calcula tarifas. No se verificó una liquidación Stripe completa. |
| Admin → Ingresos, pagos de la app | Código y pantalla comprobados: fechas reales conservadas y agrupación por mes de tarifa. La prueba detectó 170 € al coexistir efectivo y un intento de tarjeta por las mismas reservas; se corrigió para mostrar **un único pendiente de 85 €**. No se borran datos reales ni se ocultan cobros confirmados. |
| Admin → Pagos y restaurar una reserva liberada | Código leído: la lista muestra los importes almacenados y fechas del registro, sin calcular tramos. `admin_restore_released_booking` se corrigió para cotizar y sincronizar el mes de tarifa al restaurar una reserva no pagada. Prueba SQL: +25 € en diciembre, pago confirmado de 30 € intacto, reserva pagada sin nuevo cargo y cortesía no cobrada. |
| Admin → Miembros, actividad/pago del mes y detalle/movimientos | Código leído: el filtro mensual de actividad y pagos selecciona las clases por mes de tarifa, sin perder la fecha de asistencia. El detalle conserva fechas/importes registrados. `admin_move_booking` mantiene la protección del mes calendario para recuperaciones y bloquea además movimientos de reservas ordinarias entre meses de tarifa distintos, incluso dentro de noviembre. Probados rechazos entre meses de tarifa y entre meses calendario. |
| Próximas clases y filtro de pendientes del personal | Código leído y corregido: no inventa una deuda de 30 € a partir de una reserva provisional de 0 €. Usa importes pendientes reales y no suma efectivo/tarjeta alternativos. Los planes históricos se consultan por mes de tarifa. El filtro conserva los pendientes todavía sin importe. Pruebas unitarias de importes. |
| Planes históricos y sus compras/recordatorios | Código de `useMyPlan` corregido para agrupar uso por mes de tarifa. SQL leído en `resolve_plan_month`, `purchase_plan_cash`, `grant_plan_subscription` y `enqueue_plan_renewal_reminders`: operan sobre el mes explícito de la suscripción, no sobre una clase del sábado. No se cambian derechos de reserva, planes, permisos ni política de renovación. |
| Cancelación de la alumna, cancelación manual del estudio y retirada administrativa | SQL vivo leído en `cancel_booking`, `admin_cancel_class`, `admin_remove_booking`, `recalc_month_pending_cash`, `sync_cash_ledger`. Ya recalculaban pendientes usando el mes de tarifa; mantienen los pagos confirmados. Probados cancelación de sábado, recálculo de diciembre, bloqueo sin tocar reservas y cancelación real idempotente. |
| Recuperar y volver a cancelar/mover una recuperación | `book_makeup`, `makeup_origin_month`, `makeup_deadline` y las pantallas/helpers de recuperaciones leídos. Elegibilidad sigue por el mes raíz calendario. Se corrigió el disparador `recalc_on_makeup_use` con `makeup_billing_month`, que recorre la raíz para recalcular el mes de tarifa sin extender el crédito. Prueba: recuperar en noviembre restaura los 85 € de diciembre; cancelar conserva el mismo origen y diciembre es rechazado. Las cortesías sintéticas se reconocen y no recalculan el mes de una clase ajena. |
| Cancelación automática por asistencia y su disparador HTTP | SQL vivo de `auto_cancel_low_attendance` y código del disparador leídos: recálculo por mes de tarifa, créditos por mes calendario raíz. No se ejecutó el proceso global para evitar cancelar clases reales; no se cambió su política, programación ni autorización. |
| Lista de espera | `promote_waitlist` leído y corregido para consultar la suscripción del mes de tarifa; las reservas ordinarias provisionales siguen siendo 0 € hasta cotizar. No se cambia la política de promoción ni se ejecuta sobre clases reales. |
| Avisos, vencimiento de reservas y resumen mensual | Código/SQL leídos en `confirm_drop_in_booking`, `notify_on_makeup_insert`, `enqueue_monthly_summary`, `warn_expiring_drop_in_holds`, `expire_pending_drop_ins`, `fail_payment` y `process-notifications`. Los avisos usan fechas reales e importes almacenados; el resumen ya agrupa clases por mes de tarifa. Los procesos de caducidad no recalculan tramos por fecha calendario. No se reenvían avisos, cambian avisos enviados ni se ejecutan procesos globales. |
| Finanzas e informes/exportación | Código leído y pruebas añadidas: reconoce meses ISO y etiquetas españolas sin modificar registros. Los filtros mensuales siguen el mes de tarifa; los intervalos explícitos de fechas siguen la fecha del registro. `loadFinanceRows`, `computeFinanceMonthly`, `filterByPeriod` y columnas de exportación mantienen importes y fechas. |
| Solicitud pública, prueba e invitaciones | Código leído en el calendario público, `/`, `/solicitar`, `checkout`, helpers de solicitudes/invitaciones y `enroll_from_invite`: solicitud no cobra una tarifa calculada, prueba conserva su precio independiente y reservas concedidas siguen siendo cortesías. No se cambia ninguna de esas políticas. Infantil: prueba SQL conserva 12 € por clase. |

## Pruebas ejecutadas

- `bunx vitest run`: **14 archivos, 92 pruebas correctas**.
- `supabase/tests/billing_month_flow_sweep.sql`: cotización de las cuatro fechas = 8.500 céntimos; meses intercalados = 5.500 + 8.500; efectivo/idempotencia; cancelación y recuperación; origen noviembre/importe diciembre; movimientos bloqueados; bloqueo vs. cancelación del estudio; confirmados intactos; recibo de tarjeta sintético/idempotente; infantil = 1.200.
- `supabase/tests/restore_billing_month.sql`: restauración incremental = 2.500 céntimos de diciembre; ingresos sincronizados; pagos/cortesías protegidos.
- Ambas pruebas SQL terminaron con su excepción deliberada `TEST_PASS`, que deshace todas las filas ficticias. No son errores de aplicación.
- Navegador autenticado: selección real sin reservar; después, cuatro clases **ficticias** para efectivo, Mis reservas, Stripe sandbox e Ingresos. Se verificaron capturas y ausencia de errores de aplicación.
- Limpieza consultada: **0** clases, reservas, pagos, avisos e ingresos ficticios; ambas clases reales del sábado conservan diciembre. La cuenta de prueba es temporal y la plataforma la elimina al finalizar.
- Última señal del compilador: `build OK`.

## Estado de aplicación y límites

- **Lovable Cloud compartido:** aplicadas `0024_billing_month_flow_sweep`, `0025_restore_booking_billing_quote`, `0026_restore_nonbillable_booking_guard`; sin actualización masiva de datos históricos.
- **Funciones existentes de cobro:** `create-checkout` y `payments-webhook` desplegadas. Sesión Stripe sandbox preparada y visible; ningún cargo completado.
- **Vista previa:** selección de la captura, efectivo, Mis reservas e Ingresos verificados con 85 €.
- **Web publicada:** continúa con el código anterior que agrupa por fecha calendario. Sus archivos descargados no contienen `billing_month`; esto produce las dos solicitudes independientes de 30 € y 70 € de la captura. La web **no se ha publicado**, conforme a lo indicado por Cande. Actualizar la publicación sigue pendiente.
- **Sin comprobación de pago completo:** no se introdujo tarjeta ni se completó un cargo en Stripe; la confirmación y el recibo se comprobaron únicamente mediante código leído y pagos SQL sintéticos.