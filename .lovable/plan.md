## Plan

### Contexto
El usuario está en `/admin/registro` (el cuaderno de ingresos). Pide que aparezca la fecha al lado de cada alumno y que pueda visualizar todo el mes de junio.

### Hallazgos de exploración
- La tabla de `Registro` ya tiene una columna `Fecha`, pero muchas filas tienen `entry_date` a `null` en la base de datos, por lo que se ven como `—`.
- El campo `month` contiene valores como `JUNIO`, `MAYO`, etc., y hay un filtro de `Mes` que por defecto está en `Todos`.
- La fecha actual (28 jun 2026) cae en junio, así que pre-filtrar al mes actual muestra directamente todo junio.

### Cambios propuestos
1. **Pre-filtro a junio por defecto**: cambiar el valor inicial del filtro de `Mes` de `todos` a `JUNIO` (mes actual), para que al entrar en la página se vean todas las entradas de junio.
2. **Fecha visible al lado de cada alumno**:
   - En la celda de `Alumno`, añadir una segunda línea pequeña en color muted con la fecha (`entry_date` formateada en español) debajo del nombre del alumno.
   - Si `entry_date` es `null`, usar el valor de `month` como fallback (por ejemplo, `junio`).
   - Mantener la columna `Fecha` existente, pero mostrar también el fallback de `month` cuando `entry_date` sea `null`, para que no haya filas sin fecha.
3. **Ordenación por fecha**: ordenar las filas por `entry_date` descendente, y si no tiene fecha, por `created_at` descendente, de modo que las entradas de junio aparezcan agrupadas cronológicamente.

### Archivos a modificar
- `src/routes/admin.registro.tsx`

### Resultado esperado
Al abrir `/admin/registro` se verán solo las entradas de junio, ordenadas por fecha, y cada alumno tendrá una fecha visible junto a su nombre (entrada o mes como fallback).