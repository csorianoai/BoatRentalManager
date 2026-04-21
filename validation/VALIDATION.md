# Nadaki Fleet Ops — Sistema de Auto-Validación

## Qué es esto

Un runner de tests que se ejecuta después de cada fase para confirmar que el sistema funciona correctamente en producción, sin intervención humana de validación.

## Cómo ejecutarlo

```bash
# Apuntar a desarrollo (localhost:5000)
node validation/self-check.js --target=dev

# Apuntar a producción
node validation/self-check.js --target=prod

# Ambos entornos + comparación dev vs prod
node validation/self-check.js --target=all

# Con output detallado de cada PASS (por defecto solo muestra FAIL/WARN)
node validation/self-check.js --target=prod --verbose
```

## Reglas de aprobación

| Condición | Acción |
|---|---|
| 0 FAIL, 0 WARN | ✅ Fase aprobada — puede avanzar |
| 0 FAIL, ≤2 WARN | ✅ Aprobada con nota — puede avanzar |
| 0 FAIL, >2 WARN | ⚠️ Revisar WARNs antes de avanzar |
| ≥1 FAIL | ❌ No avanzar — corregir primero |

## Estructura de tests

### INFRA (I-01 … I-08)
Verifica que la infraestructura básica funcione: BUILD_TS inyectado, archivos sin 404, endpoints respondiendo rápido, sin funciones obsoletas.

### DATA (D-01 … D-06)
Verifica integridad de datos: KPIs numéricos válidos, nombres de barcos comerciales, utilización en rango, today-strip con fecha correcta.

### UI (U-01 … U-10)
Verifica comportamiento del front-end: drawer abre/cierra, secciones presentes, chips de color, navegación temporal.

### INTEGRITY (C-01 … C-04)
Verifica consistencia entre entornos (solo con `--target=all`) y que el BUILD_TS no sea antiguo.

## Tests de Fase 3 (pendientes)

Cuando se implemente Fase 3 (Week/Month/List + keyboard shortcuts), agregar al runner:

```
U-11: Atajo T activa vista Timeline
U-12: Atajo W activa vista Weekly
U-13: Atajo M activa vista Month
U-14: Atajo L activa vista List
U-15: Atajo Esc en drawer cierra drawer
U-16: Atajo / hace focus en búsqueda
U-17: Atajo [ retrocede rango temporal
U-18: Atajo ] avanza rango temporal
U-19: Week view muestra horas en slots de 30min
U-20: Month view muestra revenue diario en cada celda
U-21: List view permite sort por cualquier columna
U-22: List view soporta bulk actions sobre seleccionados
```

## Formato del reporte ejecutivo

```
===========================================
FLEET OPS SELF-CHECK REPORT
Target:     https://gestion.nadakiexcursions.com/fleet.html
Timestamp:  21/4/2026, 14:17
BUILD_TS:   1776795422063
Duration:   2341ms
-------------------------------------------
INFRA         : 8/8  PASS
DATA          : 6/6  PASS
UI            : 10/10 PASS
INTEGRITY     : 4/4  PASS
-------------------------------------------
OVERALL: 28/28 PASS · 0 WARN · 0 FAIL · 0 SKIP
STATUS:  PASS

Siguiente acción:
  🚀 Todo limpio — puede avanzar a siguiente fase
===========================================
```

## Protocolo de entrega

**El agente DEBE, antes de pedir aprobación de cualquier fase:**

1. Ejecutar `node validation/self-check.js --target=prod`
2. Pegar el reporte completo en su respuesta
3. Solo si 0 FAIL y ≤2 WARN → pedir aprobación
4. Si hay FAIL → corregir primero, no pedir aprobación

## Variables de entorno (opcional)

```bash
DEV_URL=http://localhost:5000
PROD_URL=https://gestion.nadakiexcursions.com
```
