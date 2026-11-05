# Roadmap
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
