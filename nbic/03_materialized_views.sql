-- ============================================================
-- NBIC — 03_materialized_views.sql
-- Fact tables materializadas + índices
-- Nadaki Business Intelligence Center
-- Versión: 1.0 | 2026-04-20
-- ============================================================
-- INSTRUCCIÓN: NO ejecutar directamente. Requiere aprobación.
-- Precondición: 01_dimensions.sql + 02_views.sql ejecutados.
-- NOTA: REFRESH MATERIALIZED VIEW CONCURRENTLY requiere al menos
--       un índice UNIQUE en la tabla. Se crea con CREATE UNIQUE INDEX.
-- ============================================================

BEGIN;

-- ── mv_fact_daily_boat ────────────────────────────────────
-- Grain: barco × día
-- Refresh: cada hora (via job Node.js)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_fact_daily_boat AS
SELECT * FROM analytics.v_boat_daily
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_daily_boat
    ON analytics.mv_fact_daily_boat (fecha, boat_id);

CREATE INDEX IF NOT EXISTS idx_mv_daily_boat_fecha
    ON analytics.mv_fact_daily_boat (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_mv_daily_boat_id
    ON analytics.mv_fact_daily_boat (boat_id);


-- ── mv_fact_weekly_boat ───────────────────────────────────
-- Grain: barco × semana ISO
-- Refresh: nocturno 02:00 UTC
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_fact_weekly_boat AS
SELECT
    DATE_TRUNC('week', fecha)::DATE             AS semana,
    boat_id,
    MAX(boat_name)                              AS boat_name,
    SUM(gross_revenue)                          AS gross_revenue,
    SUM(total_descuentos)                       AS total_descuentos,
    SUM(net_revenue)                            AS net_revenue,
    SUM(count_bookings)                         AS count_bookings,
    SUM(count_completados)                      AS count_completados,
    SUM(horas_operadas)                         AS horas_operadas,
    SUM(total_expenses)                         AS total_expenses,
    SUM(crew_cost)                              AS crew_cost,
    SUM(fuel_cost)                              AS fuel_cost,
    SUM(mant_cost)                              AS mant_cost,
    SUM(gross_revenue) - SUM(total_descuentos) - SUM(total_expenses)
                                                AS gross_margin,
    CASE WHEN SUM(gross_revenue) > 0
         THEN ROUND((SUM(gross_revenue) - SUM(total_descuentos) - SUM(total_expenses))
              / SUM(gross_revenue) * 100, 2)
         ELSE NULL
    END                                         AS margin_pct,
    -- RevPAB semanal = revenue / 7 días
    ROUND(SUM(gross_revenue) / 7.0, 2)          AS RevPAB_weekly,
    -- Utilización semanal = días con al menos 1 booking / 7
    ROUND(SUM(utilization_day) / 7.0 * 100, 2) AS utilization_rate_pct,
    -- Ticket promedio
    CASE WHEN SUM(count_bookings) > 0
         THEN ROUND(SUM(gross_revenue) / SUM(count_bookings), 2)
         ELSE NULL
    END                                         AS avg_ticket,
    -- WoW calculado en la API (requiere acceso a semana anterior)
    -- Se incluye como columna para pre-cálculo en refresh completo
    NULL::NUMERIC                               AS wow_revenue_pct,
    NULL::NUMERIC                               AS wow_bookings_pct
FROM analytics.mv_fact_daily_boat
GROUP BY DATE_TRUNC('week', fecha)::DATE, boat_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_weekly_boat
    ON analytics.mv_fact_weekly_boat (semana, boat_id);

CREATE INDEX IF NOT EXISTS idx_mv_weekly_boat_semana
    ON analytics.mv_fact_weekly_boat (semana DESC);

CREATE INDEX IF NOT EXISTS idx_mv_weekly_boat_id
    ON analytics.mv_fact_weekly_boat (boat_id);


-- ── mv_fact_monthly_boat ──────────────────────────────────
-- Grain: barco × mes
-- Refresh: día 1 de mes + endpoint manual
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_fact_monthly_boat AS
SELECT
    DATE_TRUNC('month', semana)::DATE           AS mes,
    boat_id,
    MAX(boat_name)                              AS boat_name,
    SUM(gross_revenue)                          AS gross_revenue,
    SUM(total_descuentos)                       AS total_descuentos,
    SUM(net_revenue)                            AS net_revenue,
    SUM(count_bookings)                         AS count_bookings,
    SUM(count_completados)                      AS count_completados,
    SUM(horas_operadas)                         AS horas_operadas,
    SUM(total_expenses)                         AS total_expenses,
    SUM(crew_cost)                              AS crew_cost,
    SUM(fuel_cost)                              AS fuel_cost,
    SUM(mant_cost)                              AS mant_cost,
    SUM(gross_margin)                           AS gross_margin,
    -- Margin % recalculado para exactitud
    CASE WHEN SUM(gross_revenue) > 0
         THEN ROUND(SUM(gross_margin) / SUM(gross_revenue) * 100, 2)
         ELSE NULL
    END                                         AS margin_pct,
    -- RevPAB mensual = revenue / días del mes
    ROUND(SUM(gross_revenue) /
          EXTRACT(DAYS FROM DATE_TRUNC('month', semana)
                  + INTERVAL '1 month' - INTERVAL '1 day'), 2)
                                                AS RevPAB_monthly,
    -- Utilización mensual
    ROUND(SUM(utilization_rate_pct) /
          COUNT(DISTINCT semana), 2)            AS utilization_rate_pct,
    -- Ticket promedio
    CASE WHEN SUM(count_bookings) > 0
         THEN ROUND(SUM(gross_revenue) / SUM(count_bookings), 2)
         ELSE NULL
    END                                         AS avg_ticket,
    -- Contribution margin = net_revenue - variable_costs (crew + fuel)
    SUM(net_revenue) - SUM(crew_cost) - SUM(fuel_cost)
                                                AS contribution_margin,
    CASE WHEN SUM(net_revenue) > 0
         THEN ROUND((SUM(net_revenue) - SUM(crew_cost) - SUM(fuel_cost))
              / SUM(net_revenue) * 100, 2)
         ELSE NULL
    END                                         AS contribution_margin_pct,
    -- MoM y YoY: calculados en API o en refresh extendido
    NULL::NUMERIC                               AS mom_revenue_pct,
    NULL::NUMERIC                               AS yoy_revenue_pct
FROM analytics.mv_fact_weekly_boat
GROUP BY DATE_TRUNC('month', semana)::DATE, boat_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_monthly_boat
    ON analytics.mv_fact_monthly_boat (mes, boat_id);

CREATE INDEX IF NOT EXISTS idx_mv_monthly_boat_mes
    ON analytics.mv_fact_monthly_boat (mes DESC);

CREATE INDEX IF NOT EXISTS idx_mv_monthly_boat_id
    ON analytics.mv_fact_monthly_boat (boat_id);


-- ── mv_executive_kpis ─────────────────────────────────────
-- KPIs ejecutivos consolidados para RPT-F1
-- Grain: empresa × período (mes actual, semana actual, trimestre)
-- Refresh: cada 15 minutos
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_executive_kpis AS
WITH
current_month AS (
    SELECT
        SUM(gross_revenue)      AS gross_revenue,
        SUM(net_revenue)        AS net_revenue,
        SUM(total_expenses)     AS total_expenses,
        SUM(gross_margin)       AS gross_margin,
        SUM(count_bookings)     AS count_bookings,
        SUM(count_completados)  AS count_completados,
        SUM(horas_operadas)     AS horas_operadas,
        AVG(RevPAB_monthly)     AS avg_RevPAB,
        AVG(utilization_rate_pct) AS avg_utilization,
        AVG(avg_ticket)         AS avg_ticket
    FROM analytics.mv_fact_monthly_boat
    WHERE mes = DATE_TRUNC('month', CURRENT_DATE)::DATE
),
prev_month AS (
    SELECT
        SUM(gross_revenue)      AS gross_revenue,
        SUM(net_revenue)        AS net_revenue,
        SUM(total_expenses)     AS total_expenses,
        SUM(count_bookings)     AS count_bookings
    FROM analytics.mv_fact_monthly_boat
    WHERE mes = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE
),
current_week AS (
    SELECT
        SUM(gross_revenue)      AS gross_revenue,
        SUM(count_bookings)     AS count_bookings
    FROM analytics.mv_fact_weekly_boat
    WHERE semana = DATE_TRUNC('week', CURRENT_DATE)::DATE
),
prev_week AS (
    SELECT
        SUM(gross_revenue)      AS gross_revenue,
        SUM(count_bookings)     AS count_bookings
    FROM analytics.mv_fact_weekly_boat
    WHERE semana = DATE_TRUNC('week', CURRENT_DATE - INTERVAL '7 days')::DATE
)
SELECT
    NOW()                                               AS calculated_at,
    -- Ingresos mes
    cm.gross_revenue,
    cm.net_revenue,
    cm.total_expenses,
    cm.gross_margin,
    cm.count_bookings,
    cm.count_completados,
    cm.horas_operadas,
    cm.avg_RevPAB,
    cm.avg_utilization,
    cm.avg_ticket,
    -- Deltas MoM
    CASE WHEN pm.gross_revenue > 0
         THEN ROUND((cm.gross_revenue / pm.gross_revenue - 1) * 100, 2)
         ELSE NULL END                                  AS mom_revenue_pct,
    CASE WHEN pm.total_expenses > 0
         THEN ROUND((cm.total_expenses / pm.total_expenses - 1) * 100, 2)
         ELSE NULL END                                  AS mom_expenses_pct,
    CASE WHEN pm.count_bookings > 0
         THEN ROUND((cm.count_bookings::NUMERIC / pm.count_bookings - 1) * 100, 2)
         ELSE NULL END                                  AS mom_bookings_pct,
    -- Deltas WoW
    CASE WHEN pw.gross_revenue > 0
         THEN ROUND((cw.gross_revenue / pw.gross_revenue - 1) * 100, 2)
         ELSE NULL END                                  AS wow_revenue_pct,
    CASE WHEN pw.count_bookings > 0
         THEN ROUND((cw.count_bookings::NUMERIC / pw.count_bookings - 1) * 100, 2)
         ELSE NULL END                                  AS wow_bookings_pct,
    -- Margin %
    CASE WHEN cm.gross_revenue > 0
         THEN ROUND(cm.gross_margin / cm.gross_revenue * 100, 2)
         ELSE NULL END                                  AS margin_pct
FROM current_month cm
CROSS JOIN prev_month pm
CROSS JOIN current_week cw
CROSS JOIN prev_week pw
WITH DATA;

-- No UNIQUE index needed en mv_executive_kpis (solo 1 fila siempre)
CREATE INDEX IF NOT EXISTS idx_mv_exec_kpis_calc
    ON analytics.mv_executive_kpis (calculated_at DESC);

COMMIT;
