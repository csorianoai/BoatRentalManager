-- ============================================================
-- NBIC — 05_alert_rules.sql
-- Sistema de alertas configurable (reglas + eventos)
-- Nadaki Business Intelligence Center
-- Versión: 1.0 | 2026-04-20
-- ============================================================
-- INSTRUCCIÓN: NO ejecutar directamente. Requiere aprobación.
-- Precondición: 01, 02, 03, 04 ejecutados exitosamente.
-- ============================================================

BEGIN;

-- ── Tabla de reglas de alerta (configurable) ──────────────
CREATE TABLE IF NOT EXISTS analytics.alert_rules (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    code            TEXT        NOT NULL UNIQUE,     -- ALT-01, ALT-02, ...
    name            TEXT        NOT NULL,
    description     TEXT,
    severity        TEXT        NOT NULL CHECK (severity IN ('critical','warn','info')),
    frequency       TEXT        NOT NULL CHECK (frequency IN ('real_time','hourly','daily','weekly')),
    -- Query SQL que devuelve filas cuando la alerta aplica
    -- Debe devolver: entity_type, entity_id, entity_name, value, threshold
    check_query     TEXT        NOT NULL,
    threshold       NUMERIC(12,2),                   -- valor de referencia configurable
    threshold_pct   NUMERIC(5,2),                    -- umbral en % donde aplica
    is_active       BOOLEAN     DEFAULT TRUE,
    created_at      TIMESTAMP   DEFAULT NOW(),
    updated_at      TIMESTAMP   DEFAULT NOW()
);

-- ── Tabla de eventos de alerta (historial) ────────────────
CREATE TABLE IF NOT EXISTS analytics.alert_events (
    id              SERIAL      PRIMARY KEY,
    alert_code      TEXT        NOT NULL REFERENCES analytics.alert_rules(code),
    entity_type     TEXT        NOT NULL,    -- 'booking', 'boat', 'transaction', etc.
    entity_id       TEXT        NOT NULL,    -- ID de la entidad afectada
    entity_name     TEXT,                   -- nombre legible
    detected_value  NUMERIC(12,2),          -- valor detectado
    threshold_value NUMERIC(12,2),          -- umbral configurado en ese momento
    severity        TEXT        NOT NULL CHECK (severity IN ('critical','warn','info')),
    status          TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','resolved')),
    ack_by          TEXT,                   -- user_id que reconoció
    ack_at          TIMESTAMP,
    resolved_at     TIMESTAMP,
    context         JSONB,                  -- datos adicionales de contexto
    created_at      TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_events_code    ON analytics.alert_events (alert_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_status  ON analytics.alert_events (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_entity  ON analytics.alert_events (entity_type, entity_id);

-- ── Insertar reglas de alerta ─────────────────────────────
INSERT INTO analytics.alert_rules
    (code, name, description, severity, frequency, threshold, threshold_pct, check_query)
VALUES

-- ALT-01: Gap de conciliación > $100
('ALT-01',
 'Gap de Conciliación de Ingresos',
 'Booking completado donde la diferencia entre cobrado y depositado supera $100',
 'critical', 'daily', 100.00, NULL,
 $$
 SELECT
     'booking' AS entity_type,
     booking_id AS entity_id,
     COALESCE(canal || ' - ' || customer_name, booking_id) AS entity_name,
     ABS(diff_cobrado_depositado) AS value,
     100 AS threshold
 FROM analytics.v_reconciliation
 WHERE status_booking = 'completed'
   AND ABS(diff_cobrado_depositado) > 100
 $$),

-- ALT-02: Booking completado sin depósito bancario > 48h
('ALT-02',
 'Booking Completado Sin Depósito Bancario',
 'Booking marcado como completado hace más de 48 horas sin bank_statement vinculado',
 'warn', 'daily', 48.00, NULL,
 $$
 SELECT
     'booking' AS entity_type,
     booking_id AS entity_id,
     COALESCE(customer_name, booking_id) AS entity_name,
     EXTRACT(EPOCH FROM (NOW() - fecha_servicio::TIMESTAMPTZ))/3600 AS value,
     48 AS threshold
 FROM analytics.v_reconciliation
 WHERE status_booking = 'completed'
   AND status_banco = 'sin_deposito'
   AND fecha_servicio < NOW() - INTERVAL '48 hours'
 $$),

-- ALT-03: Precio de booking < -15% de la tarifa base
('ALT-03',
 'Booking Vendido por Debajo de Tarifa',
 'Precio vendido más del 15% por debajo de la tarifa de lista',
 'warn', 'real_time', NULL, -15.00,
 $$
 SELECT
     'booking' AS entity_type,
     booking_id AS entity_id,
     COALESCE(boat_name || ' - ' || canal, booking_id) AS entity_name,
     diff_pct AS value,
     -15 AS threshold
 FROM analytics.v_price_variance
 WHERE clasificacion_precio = 'significativamente_bajo'
   AND obs_en_ventana_90d >= 5
 $$),

-- ALT-04: Vendedor con descuento promedio > 15% en la semana
('ALT-04',
 'Descuento Excesivo por Vendedor',
 'Vendedor aplicó descuento promedio superior al 15% esta semana',
 'warn', 'weekly', NULL, 15.00,
 $$
 SELECT
     'user' AS entity_type,
     COALESCE(sold_by_user_id, 'unknown') AS entity_id,
     COALESCE(sold_by_name, 'Vendedor desconocido') AS entity_name,
     AVG(descuento_pct) AS value,
     15 AS threshold
 FROM analytics.v_price_variance
 WHERE semana = DATE_TRUNC('week', CURRENT_DATE)::DATE
   AND sold_by_name IS NOT NULL
 GROUP BY sold_by_user_id, sold_by_name
 HAVING AVG(descuento_pct) > 15
 $$),

-- ALT-05: Revenue WoW < -20% por barco
('ALT-05',
 'Caída de Ingresos WoW por Barco',
 'Ingresos de un barco cayeron más del 20% respecto a la semana anterior',
 'warn', 'weekly', NULL, -20.00,
 $$
 SELECT
     'boat' AS entity_type,
     cw.boat_id AS entity_id,
     cw.boat_name AS entity_name,
     CASE WHEN pw.gross_revenue > 0
          THEN ROUND((cw.gross_revenue / pw.gross_revenue - 1) * 100, 2)
          ELSE NULL END AS value,
     -20 AS threshold
 FROM analytics.mv_fact_weekly_boat cw
 JOIN analytics.mv_fact_weekly_boat pw
     ON pw.boat_id = cw.boat_id
     AND pw.semana  = cw.semana - INTERVAL '7 days'
 WHERE cw.semana = DATE_TRUNC('week', CURRENT_DATE)::DATE
   AND pw.gross_revenue > 0
   AND cw.gross_revenue < pw.gross_revenue * 0.80
 $$),

-- ALT-06: Gasto en categoría > 2σ del histórico
('ALT-06',
 'Gasto Anómalo por Categoría',
 'Transacción de gasto que supera 2 desviaciones estándar del promedio histórico de la categoría',
 'critical', 'daily', 2.00, NULL,
 $$
 SELECT
     'transaction' AS entity_type,
     expense_id AS entity_id,
     COALESCE(category || ' - ' || boat_name, expense_id) AS entity_name,
     ROUND(
         (amount - AVG(amount) OVER (PARTITION BY category))
         / NULLIF(STDDEV(amount) OVER (PARTITION BY category), 0),
     2) AS value,
     2 AS threshold
 FROM analytics.v_expense_enriched
 WHERE expense_date >= CURRENT_DATE - INTERVAL '90 days'
 HAVING ROUND(
     (amount - AVG(amount) OVER (PARTITION BY category))
     / NULLIF(STDDEV(amount) OVER (PARTITION BY category), 0),
 2) > 2
 $$),

-- ALT-07: Cash days outstanding > 7 días
('ALT-07',
 'Cash Days Outstanding Elevado',
 'Tiempo promedio entre fecha de servicio y cobro supera 7 días',
 'warn', 'daily', 7.00, NULL,
 $$
 SELECT
     'company' AS entity_type,
     'global' AS entity_id,
     'Promedio CDO' AS entity_name,
     ROUND(AVG(EXTRACT(EPOCH FROM (fecha_cobro - fecha_servicio)) / 86400), 1) AS value,
     7 AS threshold
 FROM analytics.v_reconciliation
 WHERE fecha_cobro IS NOT NULL
   AND fecha_servicio IS NOT NULL
   AND fecha_cobro > fecha_servicio
   AND status_booking = 'completed'
 HAVING AVG(EXTRACT(EPOCH FROM (fecha_cobro - fecha_servicio)) / 86400) > 7
 $$),

-- ALT-08: AR vencida > 30 días
('ALT-08',
 'Cuenta por Cobrar Vencida',
 'AR en status pending con due_date hace más de 30 días',
 'critical', 'daily', 30.00, NULL,
 $$
 SELECT
     'receivable' AS entity_type,
     ar.id AS entity_id,
     COALESCE(ar.client_name, ar.id) AS entity_name,
     EXTRACT(DAY FROM NOW() - ar.due_date::TIMESTAMPTZ) AS value,
     30 AS threshold
 FROM public.booking_receivables ar
 WHERE ar.status = 'pending'
   AND ar.due_date < CURRENT_DATE - INTERVAL '30 days'
 $$),

-- ALT-09: Booking sin payment_method
('ALT-09',
 'Booking Sin Método de Pago',
 'Booking confirmado o completado sin payment_method registrado',
 'info', 'real_time', NULL, NULL,
 $$
 SELECT
     'booking' AS entity_type,
     id AS entity_id,
     COALESCE(customer_name, id) AS entity_name,
     NULL::NUMERIC AS value,
     NULL AS threshold
 FROM public.bookings
 WHERE payment_method IS NULL
   AND status IN ('confirmed', 'completed')
 $$),

-- ALT-10: Z-score precio > 2 (ventana 90 días)
('ALT-10',
 'Precio Outlier (Z-Score)',
 'Booking con precio cuyo z-score supera 2 en la ventana de 90 días por barco+canal',
 'warn', 'real_time', 2.00, NULL,
 $$
 SELECT
     'booking' AS entity_type,
     booking_id AS entity_id,
     COALESCE(boat_name || ' / ' || canal, booking_id) AS entity_name,
     z_score_90d AS value,
     2 AS threshold
 FROM analytics.v_price_variance
 WHERE ABS(z_score_90d) > 2
   AND obs_en_ventana_90d >= 30
 $$)

ON CONFLICT (code) DO UPDATE SET
    description  = EXCLUDED.description,
    threshold    = EXCLUDED.threshold,
    threshold_pct= EXCLUDED.threshold_pct,
    check_query  = EXCLUDED.check_query,
    updated_at   = NOW();

-- ── Función: evaluate_alert_rules ─────────────────────────
-- Evalúa todas las reglas activas e inserta eventos nuevos.
-- Idempotente: evita duplicados por entity_id + code en el día.
CREATE OR REPLACE FUNCTION analytics.evaluate_alert_rules()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    rule        analytics.alert_rules%ROWTYPE;
    rec         RECORD;
    new_events  INTEGER := 0;
    q           TEXT;
BEGIN
    FOR rule IN SELECT * FROM analytics.alert_rules WHERE is_active = TRUE LOOP
        BEGIN
            q := FORMAT(
                'SELECT entity_type, entity_id, entity_name, value::NUMERIC, threshold::NUMERIC
                 FROM (%s) _sub',
                rule.check_query
            );
            FOR rec IN EXECUTE q LOOP
                -- Evitar duplicados: solo 1 evento abierto por código + entity_id
                IF NOT EXISTS (
                    SELECT 1 FROM analytics.alert_events
                    WHERE alert_code  = rule.code
                      AND entity_id   = rec.entity_id
                      AND status      = 'open'
                      AND created_at  > NOW() - INTERVAL '24 hours'
                ) THEN
                    INSERT INTO analytics.alert_events
                        (alert_code, entity_type, entity_id, entity_name,
                         detected_value, threshold_value, severity, context)
                    VALUES
                        (rule.code, rec.entity_type, rec.entity_id, rec.entity_name,
                         rec.value, rec.threshold, rule.severity,
                         jsonb_build_object('rule_code', rule.code, 'evaluated_at', NOW()));
                    new_events := new_events + 1;
                END IF;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'NBIC alert rule % failed: %', rule.code, SQLERRM;
        END;
    END LOOP;
    RETURN new_events;
END;
$$;

COMMIT;
