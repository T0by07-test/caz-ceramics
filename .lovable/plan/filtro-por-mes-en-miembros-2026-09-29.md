# Filtro por mes en Miembros

Objetivo: en **Admin → Miembros** poder elegir el mes (septiembre, octubre…) y ver qué clases tiene anotada cada alumna en ese mes.

## Cómo quedará para ti

- Un desplegable **"Mes"** junto a los filtros existentes (rol, tag), con el mes actual marcado por defecto y los meses con reservas disponibles (p. ej. "octubre 2026").
- Al elegir **octubre**, la columna de reservas y los chips de días (L M X…) muestran las clases de octubre de cada alumna, y el estado "Activa / Sin actividad este mes" se calcula sobre ese mes.
- El resto de la página (pagos, recuperaciones, archivadas) no cambia.

## Detalles técnicos

- `src/routes/admin.alumnas.tsx`: nuevo estado `selectedMonth` (YYYY-MM, por defecto el mes actual). La query de `bookings` pasa de "mes actual + siguiente" a filtrar por el mes elegido (`gte` primer día, `lt` primer día del mes siguiente), igual que `subscriptions` ya filtra por `month`.
- La lista de meses del desplegable se deriva de las fechas de las reservas existentes (o mes actual ± próximos 2), con etiqueta en español ("octubre 2026").
- `deriveEstado` y `summarizeMonthClasses` no necesitan cambios: reciben los datos del mes seleccionado.
- El filtro se aplica también al recuento `bookedThisMonth` para que "Sin actividad este mes" refleje el mes elegido.
