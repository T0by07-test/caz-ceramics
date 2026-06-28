## Cambios en `/admin/registro`

Archivo: `src/routes/admin.registro.tsx`.

### 1. Ordenar las clases regulares por día de la semana y hora

Hoy el grupo 0 ("clases regulares") solo se ordena por fecha de creación. Lo cambiamos a:

- Lunes → Martes → Miércoles → Jueves → Viernes → Sábado → Domingo → Niños (al final de los regulares).
- Dentro de cada día, por hora de inicio ascendente (de mañana a noche).
- Ítems sin día reconocido dentro del grupo 0 caen al final, manteniendo su orden actual.

Los ítems vienen como `"Lunes 18.30"`, `"Miércoles 10:30"`, `"Niños Lunes 17.00"`, etc. Se extrae:

- **Día** con el regex existente `WEEKDAY_RE` (mapeado a un índice 0–7; "niños/ninos" → 7).
- **Hora** con un regex nuevo que acepta `HH.MM` o `HH:MM` después del día (ej. `(\d{1,2})[.:](\d{2})`). Se convierte a minutos desde medianoche para comparar.

La ordenación del `useMemo` queda:

1. `itemGroup` (sin cambios: 0 regulares → 1 clase suelta → 2 coworkers → 3 workshops → 4 resto → 5 vacíos).
2. Si grupo = 0: por índice de día, luego por minutos de hora.
3. Si grupo = 4: por nombre del ítem (como ahora).
4. Empate: orden estable actual (índice original = fecha desc).

### 2. Ordenar el desplegable "Mes" por orden calendario

Hoy `months` se construye con `.sort()` alfabético, por eso el dropdown muestra ABRIL, ENERO, FEBRERO, JUNIO, MARZO, MAYO…

Se reemplaza por un orden basado en la posición del mes en el calendario (enero=0 … diciembre=11), usando un mapa `MONTH_INDEX` con todas las variantes que aparecen en BD (mayúsculas/minúsculas, con/sin tilde). Meses no reconocidos van al final, alfabéticamente.

Resultado en el dropdown: Todos, ENERO, FEBRERO, MARZO, ABRIL, MAYO, JUNIO, JULIO, …

### Fuera de alcance

- No se tocan datos en la BD.
- No se cambian otros grupos (sueltas, coworkers, workshops, resto).
- No se añaden cabeceras de sección visuales.
