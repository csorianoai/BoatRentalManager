-- ============================================================
-- NBIC — 01_dimensions.sql
-- Schema analytics + tablas de dimensiones
-- Nadaki Business Intelligence Center
-- Versión: 1.0 | 2026-04-20
-- ============================================================
-- INSTRUCCIÓN: NO ejecutar directamente. Requiere aprobación.
-- BACKUP: antes de ejecutar en producción:
--   CREATE TABLE public.bookings_backup_20260420 AS SELECT * FROM public.bookings;
-- EJECUCIÓN: BEGIN; ... COMMIT; con rollback plan
-- ============================================================

BEGIN;

-- ── Schema analytics ──────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS analytics;

-- ── dim_date ──────────────────────────────────────────────
-- Tabla de fechas 2020-01-01 a 2030-12-31 (3,653 filas)
-- Carga inicial via generate_series (incluida al final)
CREATE TABLE IF NOT EXISTS analytics.dim_date (
    date_id          DATE        PRIMARY KEY,
    day_of_week      SMALLINT    NOT NULL,  -- 1=Monday … 7=Sunday (ISO)
    day_name         TEXT        NOT NULL,
    week_num         SMALLINT    NOT NULL,  -- ISO week number
    month_num        SMALLINT    NOT NULL,
    month_name       TEXT        NOT NULL,
    quarter          SMALLINT    NOT NULL,
    year             SMALLINT    NOT NULL,
    is_weekend       BOOLEAN     NOT NULL DEFAULT FALSE,
    is_holiday       BOOLEAN     NOT NULL DEFAULT FALSE,  -- TODO: poblar con festivos PR/USA
    fiscal_year      SMALLINT    NOT NULL,  -- mismo que year (ajustar si fiscal != calendario)
    fiscal_quarter   SMALLINT    NOT NULL,
    -- Temporada de negocio (zona caribeña): high=Dic–Abr, low=May–Nov
    season           TEXT        NOT NULL CHECK (season IN ('high','shoulder','low'))
);

-- Carga inicial dim_date (si la tabla está vacía)
INSERT INTO analytics.dim_date
SELECT
    d::DATE                                             AS date_id,
    EXTRACT(ISODOW FROM d)::SMALLINT                    AS day_of_week,
    TO_CHAR(d, 'Day')                                   AS day_name,
    EXTRACT(WEEK FROM d)::SMALLINT                      AS week_num,
    EXTRACT(MONTH FROM d)::SMALLINT                     AS month_num,
    TO_CHAR(d, 'Month')                                 AS month_name,
    EXTRACT(QUARTER FROM d)::SMALLINT                   AS quarter,
    EXTRACT(YEAR FROM d)::SMALLINT                      AS year,
    EXTRACT(ISODOW FROM d) IN (6, 7)                    AS is_weekend,
    FALSE                                               AS is_holiday,
    EXTRACT(YEAR FROM d)::SMALLINT                      AS fiscal_year,
    EXTRACT(QUARTER FROM d)::SMALLINT                   AS fiscal_quarter,
    CASE
        WHEN EXTRACT(MONTH FROM d) IN (12, 1, 2, 3, 4) THEN 'high'
        WHEN EXTRACT(MONTH FROM d) IN (5, 11)           THEN 'shoulder'
        ELSE 'low'
    END                                                 AS season
FROM generate_series(
    '2020-01-01'::DATE,
    '2030-12-31'::DATE,
    '1 day'::INTERVAL
) AS d
ON CONFLICT (date_id) DO NOTHING;

-- ── dim_boat ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_boat (
    boat_id              TEXT    PRIMARY KEY,
    name                 TEXT    NOT NULL,
    boat_type            TEXT,
    capacity             INTEGER,
    make                 TEXT,
    model                TEXT,
    length_ft            INTEGER,
    status               TEXT,
    daily_cost_estimate  NUMERIC(12,2),  -- costo fijo estimado por día
    avg_fuel_per_hour    NUMERIC(6,2),   -- galones/hora (manual o de boat_fuel_log)
    synced_at            TIMESTAMP DEFAULT NOW()
);

-- Carga inicial desde public.boats
INSERT INTO analytics.dim_boat (boat_id, name, boat_type, capacity, make, model, length_ft, status)
SELECT id, name, type, capacity, make, model, length, status
FROM public.boats
WHERE status = 'active'
ON CONFLICT (boat_id) DO UPDATE SET
    name      = EXCLUDED.name,
    boat_type = EXCLUDED.boat_type,
    capacity  = EXCLUDED.capacity,
    status    = EXCLUDED.status,
    synced_at = NOW();

-- ── dim_user ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_user (
    user_id      TEXT    PRIMARY KEY,
    display_name TEXT,
    email        TEXT,
    role         TEXT    DEFAULT 'staff',
    is_active    BOOLEAN DEFAULT TRUE,
    synced_at    TIMESTAMP DEFAULT NOW()
);

-- Carga inicial desde public.users
INSERT INTO analytics.dim_user (user_id, display_name, email)
SELECT id, COALESCE(first_name || ' ' || last_name, email, id), email
FROM public.users
ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    synced_at    = NOW();

-- ── dim_channel ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_channel (
    channel_id              TEXT    PRIMARY KEY,
    channel_name            TEXT    NOT NULL,
    channel_type            TEXT    NOT NULL CHECK (channel_type IN ('ota','direct','broker','manual')),
    commission_rate_standard NUMERIC(5,2) DEFAULT 0,
    is_active               BOOLEAN DEFAULT TRUE
);

-- Carga inicial desde platform_configs + commission_rules
INSERT INTO analytics.dim_channel (channel_id, channel_name, channel_type, commission_rate_standard)
SELECT
    LOWER(REPLACE(pc.platform_name, ' ', '_'))  AS channel_id,
    pc.platform_name                             AS channel_name,
    'ota'                                        AS channel_type,
    COALESCE(cr.commission_percentage, 0)        AS commission_rate_standard
FROM public.platform_configs pc
LEFT JOIN public.commission_rules cr ON LOWER(cr.platform) = LOWER(pc.platform_name) AND cr.is_active = 1
ON CONFLICT (channel_id) DO NOTHING;

-- Canales especiales no capturados por platform_configs
INSERT INTO analytics.dim_channel (channel_id, channel_name, channel_type) VALUES
    ('direct',  'Venta Directa',  'direct'),
    ('broker',  'Broker/Agencia', 'broker'),
    ('manual',  'Entrada Manual', 'manual'),
    ('unknown', 'Desconocido',    'manual')
ON CONFLICT (channel_id) DO NOTHING;

-- ── dim_payment_method ────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_payment_method (
    payment_method_id TEXT    PRIMARY KEY,
    method_name       TEXT    NOT NULL,
    method_type       TEXT    NOT NULL CHECK (method_type IN ('cash','digital','platform','unknown')),
    settlement_days   INTEGER DEFAULT 0,   -- días para liquidar al operador
    is_reconcilable   BOOLEAN DEFAULT TRUE -- puede vincularse a bank_statement
);

INSERT INTO analytics.dim_payment_method VALUES
    ('cash',            'Efectivo',              'cash',     0, FALSE),
    ('card',            'Tarjeta',               'digital',  1, TRUE),
    ('transfer',        'Transferencia',          'digital',  1, TRUE),
    ('online_platform', 'Plataforma Online (OTA)','platform', 7, TRUE),
    ('mixed',           'Pago Mixto',             'cash',     0, FALSE),
    ('pending',         'Pendiente',              'unknown',  0, FALSE),
    ('unknown',         'Desconocido',            'unknown',  0, FALSE)
ON CONFLICT (payment_method_id) DO NOTHING;

-- ── dim_tour ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_tour (
    tour_id           TEXT    PRIMARY KEY,
    tour_type         TEXT    NOT NULL CHECK (tour_type IN ('half_day','full_day','custom','unknown')),
    duration_hours    NUMERIC(5,2),
    typical_boat_type TEXT,
    is_active         BOOLEAN DEFAULT TRUE
);

INSERT INTO analytics.dim_tour VALUES
    ('half_day', 'half_day', 4.0,  NULL, TRUE),
    ('full_day', 'full_day', 8.0,  NULL, TRUE),
    ('custom',   'custom',   NULL, NULL, TRUE),
    ('unknown',  'unknown',  NULL, NULL, TRUE)
ON CONFLICT (tour_id) DO NOTHING;

-- ── dim_expense_category ──────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_expense_category (
    category_id    TEXT    PRIMARY KEY,
    category_key   TEXT    NOT NULL UNIQUE,
    category_name  TEXT    NOT NULL,
    category_type  TEXT    NOT NULL CHECK (category_type IN ('fixed','variable','semi-variable')),
    account_codes  TEXT[],
    parent_category TEXT
);

-- Insertar categorías usando la taxonomía unificada del sistema
-- (espejo de UNIFIED_EXPENSE_CATEGORIES en server.js)
INSERT INTO analytics.dim_expense_category (category_id, category_key, category_name, category_type, account_codes) VALUES
    ('cat_fuel',        'fuel',         'Combustible',               'variable',      ARRAY['5010','5011']),
    ('cat_crew',        'crew',         'Tripulación (Capitanes/Stews)', 'variable',  ARRAY['5020','5021','5022']),
    ('cat_maintenance', 'maintenance',  'Mantenimiento y Reparaciones', 'semi-variable', ARRAY['5030','5031','5032','5035']),
    ('cat_insurance',   'insurance',    'Seguros',                    'fixed',         ARRAY['5040']),
    ('cat_marina',      'marina',       'Marina / Muelle',            'fixed',         ARRAY['5050']),
    ('cat_marketing',   'marketing',    'Marketing y Publicidad',     'variable',      ARRAY['5060']),
    ('cat_admin',       'admin',        'Gastos Administrativos',     'semi-variable', ARRAY['5070','5075']),
    ('cat_taxes',       'taxes',        'Impuestos y Tasas',          'fixed',         ARRAY['5080']),
    ('cat_other',       'other',        'Otros Gastos',               'variable',      ARRAY['5090','5099'])
ON CONFLICT (category_id) DO NOTHING;

COMMIT;
