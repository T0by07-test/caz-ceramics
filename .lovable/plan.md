## Cambios en `/admin/registro`

En `src/routes/admin.registro.tsx`:

### 1. Quitar la fecha bajo el nombre del alumno
En la celda "Alumno" eliminar la segunda línea con `formatDateOrMonth(...)`. La columna "Fecha" (primera columna) ya muestra esa información.

### 2. Ordenar la tabla por tipo de Clase/Producto
Añadir un orden por grupos del campo `item` (Clase/Producto), y dentro de cada grupo mantener el orden actual por fecha desc → created_at desc.

Grupos, en este orden:
1. **Clases regulares** — `item` empieza por un día de la semana (`Lunes|Martes|Miércoles|Miercole|Jueves|Viernes|Sábado|Domingo|Niños`).
2. **Coworkers** — `item` contiene `coworker` (case-insensitive).
3. **Workshops / Talleres** — `item` empieza por `Taller` o contiene `Workshop`.
4. **Resto** — todo lo demás (Kit, Productos, Alquiler Horno, Reserva, Otros, etc.) y filas sin `item`.

Implementación: helper `itemGroup(item)` que devuelve 0–3; en el `useMemo` que produce `filtered`, ordenar primero por `itemGroup`, luego mantener el orden cronológico ya cargado (estable). No se toca la query SQL.

### Archivos
- `src/routes/admin.registro.tsx`

### Fuera de alcance
- No se renombra ni reagrupa visualmente (sin cabeceras de sección); solo se ordena.
- No se tocan datos en la BD.
