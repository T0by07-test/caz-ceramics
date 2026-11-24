# Roadmap
- [x] Reproducir las cuatro fechas de la captura: sábado 28, 17:00 + 2/9 dic, 15:00 + 16 dic, 10:30 = 85 € en diciembre; vista previa autenticada y pantalla previa al pago verificadas.
- [x] Revisar selección, reservas, cobros, ingresos y procesos automáticos: 92 pruebas, dos pruebas SQL con rollback y flujo ficticio de efectivo/Mis reservas/Stripe sandbox/Ingresos. Cloud y funciones de cobro actualizadas; cero clases, reservas, pagos, avisos o ledger ficticios al terminar; pagos cerrados intactos. Auditoría en docs/billing-month-sweep-2026-11-24.md.
- [x] Revisar precio del sábado 28 con diciembre: la web publicada aún agrupa por fecha; vista previa autenticada verificada para 10:00 y 17:00, sábado + dos clases de diciembre = 70 €, selección conservada y desglose antes de pagar. Doce pruebas correctas, cero reservas/pagos de prueba.
- [ ] Actualizar la web publicada con el cálculo por mes de tarifa (pendiente de que Cande publique; no publicar desde este encargo).
- [x] Viernes 4 de diciembre, 17:30–19:30: clase asignada a Cande con cinco asistentes sin cuenta registrados como cinco plazas ocupadas; detalle 5/7 verificado en móvil y ordenador, sin duplicar reservas ni crear cobros.
- [x] Eliminar la clase paralela de Claudia del 26 de noviembre, 18:30–20:30, porque generaba confusión; estaba vacía y la clase regular de Cande conserva sus siete reservas intactas.
- [x] Vincular Francisco y Emilia como asistentes independientes a la clase del 23 de noviembre, 11:00–13:00: prueba transaccional y vista administradora verificadas, tres plazas ocupadas sin cuentas ni cobros.
- [x] Crear clase puntual del lunes 23 de noviembre de 2026, 11:00–13:00 con Cande; sesión verificada.
- [x] Anotar a Francisco y Emilia sin cuentas para el lunes 23, 11:00–13:00: registro privado de 2 asistentes en Talleres y 5 plazas restantes en la clase; sin cobros.
- [x] Crear clase del viernes 13 de noviembre 19:00–21:00 con Cande y apuntar a Marina Martínez Rodríguez; reserva confirmada verificada, sin registrar cobros.
- [ ] Apuntar a Josue al viernes 13 de noviembre 19:00 con Cande (no aparece una cuenta con ese nombre; falta identificar su cuenta o correo para invitarlo).
- [x] Añadir registro privado de cocciones con cantidades por tamaño, tarifas acordadas y total automático; guardado, edición, cobro y eliminación verificados con sesión administradora, y nueve pruebas de cálculo correctas.

- [x] Revisar octubre y verificar correcciones de Fernando, Pilar, Alejandra, Cristina, Andrea Gómez, Johanna y Marta; contrastar los dos cobros reales de Belén en Stripe sin alterarlos.
- [ ] Resolver diferencias restantes de octubre con cancelaciones, recuperaciones o cobros reales (requiere confirmar excepciones y posibles devoluciones; no reducir cobros de Stripe a la tarifa de reservas activas).

- [x] Aclarar método y estado del pago de clases añadidas en Ingresos, separando cobrado de pendiente y conservando el mes correcto; pruebas y vista autenticada verificadas sin modificar pagos.

- [x] Separar precios y mostrar desglose por mes en selección y pago: noviembre 2 clases = 55 €, diciembre 3 clases = 70 €; pruebas y cálculo autenticado verificados (125 € juntos).
- [ ] Verificar visualmente la selección y pago entre meses desde una cuenta de alumna (la sesión disponible es administradora y redirige fuera del calendario de alumnas).

- [x] Corregir los céntimos de las tres compras indicadas y verificar que cada una suma los 70 € cobrados en Stripe.
- [x] Miembros (/admin/alumnas): filtro por mes para ver las clases anotadas de octubre (y otros meses)
- [ ] WhatsApp Business: conectar número +34 661 499 026 y enviar avisos (plan aprobado; falta que la usuaria complete la tarjeta de conexión)

- [x] Miércoles 15:00: pasar de 1 h a 2 h (15:00–17:00) en las 9 clases de hoy en adelante; verificado en base de datos y en el calendario público (11 de noviembre muestra 15:00 – 17:00).
- [ ] Apuntar a Sara Ruiz y a Belen Igual en el viernes 6 de noviembre a las 17:30 (pendiente: no tienen cuenta en la app; hacen falta sus correos para enviarles invitación o que Cande confirme si están con otro nombre).
- [x] Viernes 6 de noviembre 17:30: la da Cande (antes Sofi); verificado en base de datos y en el calendario público (P. Cande).
- [x] Ingresos: buscador de alumna arriba de la página que filtra pagos de la app y entradas del cuaderno en todos los meses, sin distinguir tildes ni mayúsculas; 7 pruebas de búsqueda y vista autenticada verificadas (camila 5 pagos, maría = maria 17, garcía = GARCÍA 7).
