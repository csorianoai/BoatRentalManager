-- ============================================================
-- NBIC — 04_jobs.sql
-- Estrategia de refresh automático de fact tables
-- Nadaki Business Intelligence Center
-- Versión: 1.0 | 2026-04-20
-- ============================================================
-- INSTRUCCIÓN: NO ejecutar directamente. Requiere aprobación.
-- Precondición: 01, 02, 03 ejecutados exitosamente.
--
-- Este archivo tiene DOS versiones de implementación:
--   A) Con pg_cron (si Neon lo soporta — verificar primero)
--   B) Sin pg_cron (job en Node.js — implementación primaria)
-- ============================================================

-- ============================================================
-- VERSIÓN A: pg_cron (solo si disponible en Neon)
-- Verificar disponibilidad: SELECT * FROM pg_available_extensions WHERE name='pg_cron';
-- ============================================================

/*
-- Si pg_cron está disponible, descomentar y ejecutar:

-- Refresh ejecutivo: cada 15 minutos
SELECT cron.schedule(
    'nbic-refresh-executive',
    '*/15 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_executive_kpis'
);

-- Refresh diario: cada hora en minuto :05
SELECT cron.schedule(
    'nbic-refresh-daily',
    '5 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_fact_daily_boat'
);

-- Refresh semanal: cada noche a las 02:00 UTC
SELECT cron.schedule(
    'nbic-refresh-weekly',
    '0 2 * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_fact_weekly_boat'
);

-- Refresh mensual: día 1 de cada mes a las 02:30 UTC
SELECT cron.schedule(
    'nbic-refresh-monthly',
    '30 2 1 * *',
    'REFRESH MATERIALIZED VIEW analytics.mv_fact_monthly_boat'
);

-- Evaluación de alertas: cada hora en minuto :10
SELECT cron.schedule(
    'nbic-alert-eval',
    '10 * * * *',
    'SELECT analytics.evaluate_alert_rules()'
);
*/

-- ============================================================
-- VERSIÓN B: Stored procedures para llamar desde Node.js
-- Estos procedures son los que invoca el job scheduler de server.js
-- ============================================================

BEGIN;

-- Función: refresh mv_executive_kpis (cada 15 min)
CREATE OR REPLACE FUNCTION analytics.refresh_executive_kpis()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    -- mv_executive_kpis no tiene índice UNIQUE (siempre 1 fila) → FULL refresh
    REFRESH MATERIALIZED VIEW analytics.mv_executive_kpis;
    -- Log de ejecución
    INSERT INTO analytics.refresh_log (view_name, refresh_type, started_at, finished_at)
    VALUES ('mv_executive_kpis', 'full', NOW(), NOW())
    ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    -- No propagar error — degradación no crítica
    RAISE WARNING 'NBIC: refresh_executive_kpis failed: %', SQLERRM;
END;
$$;

-- Función: refresh mv_fact_daily_boat (cada hora)
CREATE OR REPLACE FUNCTION analytics.refresh_daily_boat()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_fact_daily_boat;
    INSERT INTO analytics.refresh_log (view_name, refresh_type, started_at, finished_at)
    VALUES ('mv_fact_daily_boat', 'concurrent', NOW(), NOW())
    ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'NBIC: refresh_daily_boat failed: %', SQLERRM;
END;
$$;

-- Función: refresh mv_fact_weekly_boat (nocturno)
CREATE OR REPLACE FUNCTION analytics.refresh_weekly_boat()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_fact_weekly_boat;
    INSERT INTO analytics.refresh_log (view_name, refresh_type, started_at, finished_at)
    VALUES ('mv_fact_weekly_boat', 'concurrent', NOW(), NOW())
    ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'NBIC: refresh_weekly_boat failed: %', SQLERRM;
END;
$$;

-- Función: refresh mv_fact_monthly_boat (mensual)
CREATE OR REPLACE FUNCTION analytics.refresh_monthly_boat()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW analytics.mv_fact_monthly_boat;
    INSERT INTO analytics.refresh_log (view_name, refresh_type, started_at, finished_at)
    VALUES ('mv_fact_monthly_boat', 'full', NOW(), NOW())
    ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'NBIC: refresh_monthly_boat failed: %', SQLERRM;
END;
$$;

-- Tabla de log de refreshes
CREATE TABLE IF NOT EXISTS analytics.refresh_log (
    id          SERIAL PRIMARY KEY,
    view_name   TEXT NOT NULL,
    refresh_type TEXT NOT NULL CHECK (refresh_type IN ('full','concurrent')),
    started_at  TIMESTAMP NOT NULL,
    finished_at TIMESTAMP NOT NULL,
    duration_ms INTEGER GENERATED ALWAYS AS
        (EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::INTEGER STORED,
    error_msg   TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_log_view ON analytics.refresh_log (view_name, started_at DESC);

COMMIT;

-- ============================================================
-- CÓDIGO NODE.JS para agregar a server.js (no ejecutar aquí)
-- Este bloque va dentro de la sección de scheduled jobs existente
-- ============================================================
/*

// ── NBIC Analytics Refresh Jobs ─────────────────────────────
const nbicRefresh = {

  // Refresh ejecutivo: cada 15 minutos
  executive: setInterval(async () => {
    try {
      await pool.query('SELECT analytics.refresh_executive_kpis()');
      console.log('✅ NBIC: mv_executive_kpis refreshed');
    } catch (err) {
      console.warn('⚠️ NBIC: executive refresh failed:', err.message);
    }
  }, 15 * 60 * 1000),

  // Refresh diario: cada hora
  daily: setInterval(async () => {
    try {
      await pool.query('SELECT analytics.refresh_daily_boat()');
      console.log('✅ NBIC: mv_fact_daily_boat refreshed');
    } catch (err) {
      console.warn('⚠️ NBIC: daily refresh failed:', err.message);
    }
  }, 60 * 60 * 1000),

};

// Refresh semanal: verificar cada hora si son las 02:00 UTC
setInterval(async () => {
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  if (hour === 2 && minute < 5) {
    try {
      await pool.query('SELECT analytics.refresh_weekly_boat()');
      console.log('✅ NBIC: mv_fact_weekly_boat refreshed (nocturno)');
    } catch (err) {
      console.warn('⚠️ NBIC: weekly refresh failed:', err.message);
    }
  }
}, 5 * 60 * 1000);

// Refresh mensual: día 1 a las 02:30 UTC
setInterval(async () => {
  const d = new Date();
  if (d.getUTCDate() === 1 && d.getUTCHours() === 2 && d.getUTCMinutes() >= 30 && d.getUTCMinutes() < 35) {
    try {
      await pool.query('SELECT analytics.refresh_monthly_boat()');
      console.log('✅ NBIC: mv_fact_monthly_boat refreshed (mensual)');
    } catch (err) {
      console.warn('⚠️ NBIC: monthly refresh failed:', err.message);
    }
  }
}, 5 * 60 * 1000);

*/
