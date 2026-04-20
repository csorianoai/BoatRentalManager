-- ============================================================
-- NBIC — 02_views.sql
-- Vistas base enriquecidas del schema analytics
-- Nadaki Business Intelligence Center
-- Versión: 1.0 | 2026-04-20
-- ============================================================
-- INSTRUCCIÓN: NO ejecutar directamente. Requiere aprobación.
-- Precondición: 01_dimensions.sql ejecutado exitosamente.
-- ============================================================

BEGIN;

-- ── v_booking_enriched ────────────────────────────────────
-- Vista unificada de bookings + bookings_ledger con todas las dimensiones
CREATE OR REPLACE VIEW analytics.v_booking_enriched AS
SELECT
    b.id                                                    AS booking_id,
    'bookings'                                              AS source_table,
    -- Fechas
    CASE
        WHEN b.booking_date ~ '^\d{4}-\d{2}-\d{2}$'
        THEN b.booking_date::DATE
        ELSE NULL
    END                                                     AS fecha_servicio,
    b.payment_date                                          AS fecha_cobro,
    -- Dimensiones
    COALESCE(db.boat_id, b.boat_id)                         AS boat_id,
    COALESCE(db.name, b.boat_type, 'Sin barco asignado')    AS boat_name,
    LOWER(b.platform)                                       AS channel_id,
    b.platform                                              AS canal,
    COALESCE(dc.channel_type, 'ota')                        AS channel_type,
    b.customer_name,
    b.customer_email,
    b.sold_by_name,
    b.sold_by_user_id,
    -- Finanzas
    b.total_amount                                          AS precio_vendido,
    b.base_price                                            AS precio_base_lista,
    COALESCE(b.discount_amount, 0)                          AS descuento,
    COALESCE(b.discount_pct, 0)                             AS descuento_pct,
    b.deposit_amount                                        AS deposito_garantia,
    b.balance_pending                                       AS saldo_pendiente,
    -- Métricas de pricing
    b.total_amount - COALESCE(b.base_price, b.total_amount) AS diff_vs_tarifa,
    CASE
        WHEN b.base_price IS NULL OR b.base_price = 0 THEN NULL
        ELSE ROUND((b.total_amount / b.base_price - 1) * 100, 2)
    END                                                     AS diff_pct_vs_tarifa,
    CASE
        WHEN b.base_price IS NULL                           THEN 'sin_tarifa_referencia'
        WHEN b.total_amount >= b.base_price * 0.95          THEN 'normal'
        WHEN b.total_amount >= b.base_price * 0.80          THEN 'ligeramente_bajo'
        ELSE 'significativamente_bajo'
    END                                                     AS clasificacion_precio,
    -- Operación
    b.payment_method,
    b.duration_hours,
    b.num_guests,
    b.status,
    b.is_manual,
    b.broker_id,
    b.broker_name,
    -- Agrupaciones temporales
    DATE_TRUNC('week',
        CASE WHEN b.booking_date ~ '^\d{4}-\d{2}-\d{2}$'
             THEN b.booking_date::DATE ELSE NULL END
    )::DATE                                                 AS semana,
    DATE_TRUNC('month',
        CASE WHEN b.booking_date ~ '^\d{4}-\d{2}-\d{2}$'
             THEN b.booking_date::DATE ELSE NULL END
    )::DATE                                                 AS mes,
    b.created_at

FROM public.bookings b
LEFT JOIN analytics.dim_boat    db ON db.boat_id    = b.boat_id
LEFT JOIN analytics.dim_channel dc ON dc.channel_id = LOWER(b.platform)

UNION ALL

SELECT
    bl.id                                                   AS booking_id,
    'bookings_ledger'                                       AS source_table,
    bl.booking_date                                         AS fecha_servicio,
    bl.payment_date                                         AS fecha_cobro,
    COALESCE(db.boat_id, bl.boat_id)                        AS boat_id,
    COALESCE(db.name, 'Sin barco asignado')                 AS boat_name,
    LOWER(bl.booking_source)                                AS channel_id,
    bl.booking_source                                       AS canal,
    COALESCE(dc.channel_type, 'direct')                     AS channel_type,
    COALESCE(bl.final_customer_name, bl.customer_name)      AS customer_name,
    COALESCE(bl.final_customer_email, bl.customer_email)    AS customer_email,
    bl.sold_by_name,
    bl.sold_by_user_id,
    bl.total_amount                                         AS precio_vendido,
    bl.base_price                                           AS precio_base_lista,
    COALESCE(bl.discount_amount, 0)                         AS descuento,
    COALESCE(bl.discount_pct, 0)                            AS descuento_pct,
    bl.deposit_amount                                       AS deposito_garantia,
    COALESCE(bl.total_amount - bl.deposit_amount, 0)        AS saldo_pendiente,
    bl.total_amount - COALESCE(bl.base_price, bl.total_amount) AS diff_vs_tarifa,
    CASE
        WHEN bl.base_price IS NULL OR bl.base_price = 0 THEN NULL
        ELSE ROUND((bl.total_amount / bl.base_price - 1) * 100, 2)
    END                                                     AS diff_pct_vs_tarifa,
    CASE
        WHEN bl.base_price IS NULL                          THEN 'sin_tarifa_referencia'
        WHEN bl.total_amount >= bl.base_price * 0.95        THEN 'normal'
        WHEN bl.total_amount >= bl.base_price * 0.80        THEN 'ligeramente_bajo'
        ELSE 'significativamente_bajo'
    END                                                     AS clasificacion_precio,
    bl.payment_method,
    bl.hours_rented                                         AS duration_hours,
    NULL::INTEGER                                           AS num_guests,
    bl.status,
    FALSE                                                   AS is_manual,
    bl.broker_id,
    bl.broker_name,
    DATE_TRUNC('week', bl.booking_date)::DATE               AS semana,
    DATE_TRUNC('month', bl.booking_date)::DATE              AS mes,
    bl.created_at

FROM public.bookings_ledger bl
LEFT JOIN analytics.dim_boat    db ON db.boat_id    = bl.boat_id
LEFT JOIN analytics.dim_channel dc ON dc.channel_id = LOWER(bl.booking_source);


-- ── v_transaction_enriched ────────────────────────────────
-- Transacciones con dimensiones contables, booking y barco
CREATE OR REPLACE VIEW analytics.v_transaction_enriched AS
SELECT
    t.id                                                    AS tx_id,
    t.transaction_date,
    t.transaction_type,
    t.amount,
    t.currency,
    t.description,
    t.reference_type,
    t.reference_id,
    t.booking_id,
    t.ledger_id,
    t.boat_id,
    t.platform,
    t.reconciled,
    -- Chart of accounts
    ca.account_code,
    ca.account_name,
    ca.account_type,
    -- Category mapping via dim_expense_category
    dec.category_key,
    dec.category_name,
    -- Boat enrichment
    COALESCE(db.name, 'Sin barco')                          AS boat_name,
    -- Booking enrichment (cuando booking_id está poblado)
    bk.platform                                             AS booking_canal,
    bk.status                                               AS booking_status,
    -- Agrupaciones temporales
    DATE_TRUNC('week', t.transaction_date)::DATE            AS semana,
    DATE_TRUNC('month', t.transaction_date)::DATE           AS mes,
    t.created_at

FROM public.transactions t
LEFT JOIN public.chart_of_accounts ca ON ca.id = t.account_id
LEFT JOIN analytics.dim_expense_category dec
    ON ca.account_code = ANY(dec.account_codes)
LEFT JOIN analytics.dim_boat db ON db.boat_id = t.boat_id
LEFT JOIN public.bookings bk ON bk.id = t.booking_id;


-- ── v_expense_enriched ────────────────────────────────────
-- Vista unificada de TODOS los orígenes de gasto.
-- Prevención de doble conteo: boat_expenses con synced_to_accounting=1 están excluidos.
-- (ya se contabilizan via transactions)
CREATE OR REPLACE VIEW analytics.v_expense_enriched AS

-- 1. Transactions de tipo gasto (fuente principal contable)
SELECT
    t.id                        AS expense_id,
    'transaction'               AS source_table,
    t.transaction_date          AS expense_date,
    t.boat_id,
    COALESCE(db.name, 'Sin barco') AS boat_name,
    COALESCE(dec.category_key, 'other') AS category,
    ca.account_name             AS subcategory,
    t.amount,
    NULL::TEXT                  AS vendor,
    t.description,
    NULL::TEXT                  AS payment_method,
    DATE_TRUNC('week', t.transaction_date)::DATE    AS semana,
    DATE_TRUNC('month', t.transaction_date)::DATE   AS mes
FROM public.transactions t
LEFT JOIN public.chart_of_accounts ca ON ca.id = t.account_id
LEFT JOIN analytics.dim_expense_category dec ON ca.account_code = ANY(dec.account_codes)
LEFT JOIN analytics.dim_boat db ON db.boat_id = t.boat_id
WHERE t.transaction_type = 'expense'
  AND ca.account_type = 'expense'

UNION ALL

-- 2. boat_expenses NO sincronizados (aún no contabilizados)
SELECT
    be.id                       AS expense_id,
    'boat_expense'              AS source_table,
    be.expense_date,
    be.boat_id,
    COALESCE(db.name, 'Sin barco') AS boat_name,
    be.category,
    be.category                 AS subcategory,
    be.amount,
    be.vendor,
    be.description,
    be.payment_method,
    DATE_TRUNC('week', be.expense_date)::DATE   AS semana,
    DATE_TRUNC('month', be.expense_date)::DATE  AS mes
FROM public.boat_expenses be
LEFT JOIN analytics.dim_boat db ON db.boat_id = be.boat_id
WHERE COALESCE(be.synced_to_accounting, 0) = 0  -- excluir si ya fue contabilizado

UNION ALL

-- 3. captain_payments (costo de crew — capitanes)
SELECT
    cp.id                       AS expense_id,
    'captain_payment'           AS source_table,
    cp.work_date                AS expense_date,
    cp.boat_id,
    COALESCE(db.name, cp.boat_name, 'Sin barco') AS boat_name,
    'crew'                      AS category,
    'Pago Capitán'              AS subcategory,
    cp.amount,
    cp.captain_name             AS vendor,
    cp.description,
    NULL::TEXT                  AS payment_method,
    DATE_TRUNC('week', cp.work_date)::DATE      AS semana,
    DATE_TRUNC('month', cp.work_date)::DATE     AS mes
FROM public.captain_payments cp
LEFT JOIN analytics.dim_boat db ON db.boat_id = cp.boat_id

UNION ALL

-- 4. stew_payments (costo de crew — tripulación)
SELECT
    sp.id                       AS expense_id,
    'stew_payment'              AS source_table,
    sp.work_date                AS expense_date,
    sp.boat_id,
    COALESCE(db.name, sp.boat_name, 'Sin barco') AS boat_name,
    'crew'                      AS category,
    'Pago Tripulación'          AS subcategory,
    sp.amount,
    sp.stew_name                AS vendor,
    sp.description,
    NULL::TEXT                  AS payment_method,
    DATE_TRUNC('week', sp.work_date)::DATE      AS semana,
    DATE_TRUNC('month', sp.work_date)::DATE     AS mes
FROM public.stew_payments sp
LEFT JOIN analytics.dim_boat db ON db.boat_id = sp.boat_id

UNION ALL

-- 5. boat_fuel_log (combustible)
SELECT
    fl.id                       AS expense_id,
    'fuel_log'                  AS source_table,
    fl.log_date                 AS expense_date,
    fl.boat_id,
    COALESCE(db.name, 'Sin barco') AS boat_name,
    'fuel'                      AS category,
    'Combustible'               AS subcategory,
    fl.total_cost               AS amount,
    COALESCE(fl.station, fl.vendor) AS vendor,
    CONCAT('Combustible: ', fl.gallons, ' gal @ $', fl.cost_per_gallon) AS description,
    NULL::TEXT                  AS payment_method,
    DATE_TRUNC('week', fl.log_date)::DATE   AS semana,
    DATE_TRUNC('month', fl.log_date)::DATE  AS mes
FROM public.boat_fuel_log fl
LEFT JOIN analytics.dim_boat db ON db.boat_id = fl.boat_id;


-- ── v_reconciliation ──────────────────────────────────────
-- Para RPT-A1: cadena booking → cobro → depósito bancario
CREATE OR REPLACE VIEW analytics.v_reconciliation AS
SELECT
    b.booking_id,
    b.fecha_servicio,
    b.fecha_cobro,
    -- Último bank_statement vinculado via transactions.booking_id
    bs.statement_date                                       AS fecha_banco,
    b.boat_id,
    b.boat_name,
    b.canal,
    b.customer_name,
    b.sold_by_name,
    b.payment_method,
    -- Montos
    b.precio_vendido                                        AS monto_bruto,
    b.descuento,
    b.precio_vendido - b.descuento                          AS neto_vendido,
    COALESCE(ar.amount, 0)                                  AS monto_ar,
    CASE WHEN ar.status = 'paid' THEN ar.amount ELSE 0 END  AS monto_cobrado,
    b.deposito_garantia,
    COALESCE(bs.amount, 0)                                  AS monto_banco,
    -- Diferencias
    (b.precio_vendido - b.descuento) - COALESCE(
        CASE WHEN ar.status = 'paid' THEN ar.amount ELSE 0 END, 0
    )                                                       AS diff_vendido_cobrado,
    COALESCE(CASE WHEN ar.status = 'paid' THEN ar.amount ELSE 0 END, 0)
        - COALESCE(bs.amount, 0)                            AS diff_cobrado_depositado,
    -- Estados
    b.status                                                AS status_booking,
    COALESCE(ar.status, 'sin_ar')                           AS status_ar,
    CASE WHEN bs.id IS NOT NULL THEN 'vinculado' ELSE 'sin_deposito' END AS status_banco,
    -- Alerta
    CASE
        WHEN b.status = 'cancelled'
             AND COALESCE(CASE WHEN ar.status='paid' THEN ar.amount ELSE 0 END, 0) > 0
             THEN 'cancelado_con_cobro'
        WHEN COALESCE(CASE WHEN ar.status='paid' THEN ar.amount ELSE 0 END, 0)
             > b.precio_vendido
             THEN 'cobro_excesivo'
        WHEN b.saldo_pendiente > 0
             AND COALESCE(ar.status,'pending') != 'paid'
             THEN 'cobro_parcial'
        WHEN bs.id IS NULL AND b.status = 'completed'
             THEN 'sin_deposito_banco'
        WHEN ABS(
             COALESCE(CASE WHEN ar.status='paid' THEN ar.amount ELSE 0 END, 0)
             - COALESCE(bs.amount, 0)) > 1
             AND bs.id IS NOT NULL
             THEN 'diferencia_deposito'
        ELSE 'ok'
    END                                                     AS alerta

FROM analytics.v_booking_enriched b
LEFT JOIN public.booking_receivables ar ON ar.booking_id = b.booking_id
LEFT JOIN public.transactions tx ON tx.booking_id = b.booking_id
    AND tx.transaction_type = 'income'
LEFT JOIN public.bank_statements bs
    ON bs.matched_transaction_id = tx.id
    AND bs.reconciliation_status IN ('matched', 'posted');


-- ── v_price_variance ─────────────────────────────────────
-- Para RPT-B1/B3/B5/B6: variación de precio con Z-score de ventana 90 días
CREATE OR REPLACE VIEW analytics.v_price_variance AS
SELECT
    be.booking_id,
    be.fecha_servicio,
    be.boat_id,
    be.boat_name,
    be.canal,
    be.duration_hours,
    be.sold_by_name,
    be.customer_name,
    be.status,
    be.precio_vendido,
    be.precio_base_lista,
    be.diff_vs_tarifa                                       AS diff_abs,
    be.diff_pct_vs_tarifa                                   AS diff_pct,
    be.clasificacion_precio,
    be.descuento,
    be.descuento_pct,
    -- Z-score precio en ventana móvil 90 días por barco + canal
    ROUND(
        (be.precio_vendido - AVG(be.precio_vendido) OVER w90)
        / NULLIF(STDDEV(be.precio_vendido) OVER w90, 0),
    2)                                                      AS z_score_90d,
    AVG(be.precio_vendido) OVER w90                         AS avg_precio_90d,
    STDDEV(be.precio_vendido) OVER w90                      AS stddev_precio_90d,
    COUNT(*) OVER w90                                       AS obs_en_ventana_90d,
    be.semana,
    be.mes

FROM analytics.v_booking_enriched be
WHERE be.status != 'cancelled'
  AND be.precio_vendido IS NOT NULL

WINDOW w90 AS (
    PARTITION BY be.boat_id, be.canal
    ORDER BY be.fecha_servicio
    RANGE BETWEEN INTERVAL '90 days' PRECEDING AND CURRENT ROW
);


-- ── v_boat_daily ──────────────────────────────────────────
-- Agrega todas las métricas por barco × día (input para fact tables)
CREATE OR REPLACE VIEW analytics.v_boat_daily AS
SELECT
    COALESCE(dd.date_id, fecha)                             AS fecha,
    COALESCE(db.boat_id, boat_id)                           AS boat_id,
    COALESCE(db.name, boat_name)                            AS boat_name,
    -- Ingresos
    SUM(gross_revenue)                                      AS gross_revenue,
    SUM(descuento)                                          AS total_descuentos,
    SUM(gross_revenue) - SUM(descuento)                     AS net_revenue,
    COUNT(booking_id)                                       AS count_bookings,
    COUNT(CASE WHEN status = 'completed' THEN 1 END)        AS count_completados,
    SUM(duration_hours)                                     AS horas_operadas,
    -- Gastos (del día)
    SUM(exp_amount)                                         AS total_expenses,
    SUM(crew_cost)                                          AS crew_cost,
    SUM(fuel_cost)                                          AS fuel_cost,
    SUM(mant_cost)                                          AS mant_cost,
    -- Márgenes
    SUM(gross_revenue) - SUM(descuento) - SUM(exp_amount)  AS gross_margin,
    CASE
        WHEN SUM(gross_revenue) > 0
        THEN ROUND((SUM(gross_revenue) - SUM(descuento) - SUM(exp_amount))
             / SUM(gross_revenue) * 100, 2)
        ELSE NULL
    END                                                     AS margin_pct,
    -- RevPAB (Revenue Per Available Boat-Day)
    SUM(gross_revenue)                                      AS RevPAB,  -- 1 día disponible por barco
    -- Utilización: 1 si hay al menos un booking completado, 0 si no
    CASE WHEN COUNT(CASE WHEN status = 'completed' THEN 1 END) > 0
         THEN 1.0 ELSE 0.0 END                             AS utilization_day

FROM (
    -- Ingresos de bookings
    SELECT
        be.fecha_servicio                                   AS fecha,
        be.boat_id,
        be.boat_name,
        be.booking_id,
        be.precio_vendido                                   AS gross_revenue,
        be.descuento,
        be.duration_hours,
        be.status,
        0::NUMERIC                                          AS exp_amount,
        0::NUMERIC                                          AS crew_cost,
        0::NUMERIC                                          AS fuel_cost,
        0::NUMERIC                                          AS mant_cost
    FROM analytics.v_booking_enriched be
    WHERE be.fecha_servicio IS NOT NULL

    UNION ALL

    -- Gastos del día
    SELECT
        ex.expense_date                                     AS fecha,
        ex.boat_id,
        ex.boat_name,
        NULL                                                AS booking_id,
        0::NUMERIC                                          AS gross_revenue,
        0::NUMERIC                                          AS descuento,
        NULL                                                AS duration_hours,
        NULL                                                AS status,
        ex.amount                                           AS exp_amount,
        CASE WHEN ex.category = 'crew' THEN ex.amount ELSE 0 END    AS crew_cost,
        CASE WHEN ex.category = 'fuel' THEN ex.amount ELSE 0 END    AS fuel_cost,
        CASE WHEN ex.category = 'maintenance' THEN ex.amount ELSE 0 END AS mant_cost
    FROM analytics.v_expense_enriched ex
    WHERE ex.expense_date IS NOT NULL
) unified
LEFT JOIN analytics.dim_date dd ON dd.date_id = fecha
LEFT JOIN analytics.dim_boat db ON db.boat_id  = boat_id
GROUP BY
    COALESCE(dd.date_id, fecha),
    COALESCE(db.boat_id, boat_id),
    COALESCE(db.name, boat_name);

COMMIT;
