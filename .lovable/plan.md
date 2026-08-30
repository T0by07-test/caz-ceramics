# Disponibilidad visible en móvil (calendario público)

Hoy en móvil el calendario del mes solo muestra puntos de color por clase; los lugares libres y el estado "completa" únicamente aparecen tras tocar el día. En escritorio sí se ven ("3 libres" / "completa").

## Qué se hará

1. **Celdas del mes en móvil**: junto al número del día, mostrar un resumen compacto de disponibilidad (por ejemplo `5 libres` o `completa` cuando todas las clases del día están llenas), y mantener los puntos de color por clase.
2. **Días completos**: atenuar visualmente el día y no permitir selección cuando ninguna clase tiene lugar.
3. **Lista del día (móvil)**: mostrar los lugares libres de forma más clara (`Quedan 3 lugares` / `Clase completa`) en lugar de solo `4/7`, manteniendo profesora y etiqueta de niños.
4. **Leyenda breve** debajo del calendario en móvil explicando los colores: disponible / últimos lugares / completa.
5. Se abrirá el día actual/primer día con clases por defecto en móvil, para que la disponibilidad se vea sin tener que tocar nada.

## Alcance técnico

- Solo cambios de presentación en `src/components/PublicClassCalendar.tsx` (usado en `/` y `/solicitar`).
- Se reutilizan los helpers existentes `capacityLevel`, `capacityDotClass`, `capacityLabel` y el mapa `availability` del hook `usePublicAvailability` (ya conectado).
- Sin cambios de base de datos, precios ni lógica de reserva.
- Verificación con Playwright en viewport móvil (390x844) para confirmar que nada se corta.
