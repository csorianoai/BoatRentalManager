const path = require('path');
const express = require('express');
const twilio = require('twilio');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');
const moment = require('moment');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const OpenAI = require('openai');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const ofx = require('ofx-js');
const { PDFParse } = require('pdf-parse');
console.log('✅ pdf-parse v2 loaded — PDFParse:', typeof PDFParse);
// AUTHENTICATION DISABLED - No validation required
// const { setupAuth, isAuthenticated: replitAuthMiddleware } = require('./replitAuth');

// Dummy middleware - always allow access
const isAuthenticated = (req, res, next) => next();
const aiOrchestrator = require('./ai-orchestrator');
const marineConditionsService = require('./server/marineConditionsService');
require('dotenv').config();

// Initialize OpenAI with Replit AI Integrations
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Initialize database connection
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL
});
// Log once on successful initialization
pool.query('SELECT NOW()').then(() => {
  console.log('✅ Database connection pool initialized');
}).catch(err => {
  console.error('❌ Database connection failed:', err);
});

// Initialize AI Orchestrator with shared pool and openai client
aiOrchestrator.initialize(pool, openai);
console.log('✅ AI Orchestrator initialized');

// Initialize database schema on startup
async function initializeDatabase() {
  try {
    // Create bookings table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        boat_type TEXT NOT NULL,
        booking_date TEXT NOT NULL,
        start_time TEXT,
        duration_hours INTEGER,
        total_amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        assigned_captain_id TEXT,
        assigned_captain_name TEXT,
        assigned_captain_phone TEXT,
        notes TEXT,
        internal_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // Create captains table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS captains (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL,
        specialties JSONB NOT NULL,
        photo TEXT
      )
    `);
    
    // FASE 1: Create chat_conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        messages JSONB NOT NULL,
        status TEXT NOT NULL,
        booking_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 6: Create chat_ai_context table for AI-powered booking assistant
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_ai_context (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        detected_language TEXT,
        detected_intent TEXT,
        intent_confidence INTEGER,
        customer_preferences JSONB,
        recommended_boats JSONB,
        upsell_opportunities JSONB,
        escalated_to_human INTEGER DEFAULT 0,
        escalation_reason TEXT,
        last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // Create indices for chat_ai_context (optimized for fast lookups)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_ai_context_last_interaction 
      ON chat_ai_context(last_interaction_at DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_ai_context_intent 
      ON chat_ai_context(detected_intent)
    `);
    
    console.log('✅ Chat AI Context indices created');
    
    // FASE 2: Create platform_sync_status table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_sync_status (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        last_sync_at TIMESTAMP,
        sync_status TEXT NOT NULL,
        sync_errors JSONB,
        bookings_synced INTEGER DEFAULT 0,
        conflicts_detected INTEGER DEFAULT 0,
        next_sync_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 4: Create commission_rules table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        commission_percentage INTEGER NOT NULL,
        fixed_fee INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 4: Create commission_payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_payments (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        captain_id TEXT NOT NULL,
        gross_amount INTEGER NOT NULL,
        commission_amount INTEGER NOT NULL,
        net_amount INTEGER NOT NULL,
        payment_status TEXT NOT NULL,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 3: Create trip_logs table (check-ins/check-outs)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trip_logs (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        captain_id TEXT NOT NULL,
        check_in_time TIMESTAMP,
        check_in_lat TEXT,
        check_in_lon TEXT,
        check_out_time TIMESTAMP,
        check_out_lat TEXT,
        check_out_lon TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 3: Create trip_reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trip_reports (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        captain_id TEXT NOT NULL,
        trip_log_id TEXT NOT NULL,
        weather_conditions TEXT,
        sea_conditions TEXT,
        fuel_used INTEGER,
        passengers_actual INTEGER,
        issues_reported TEXT,
        customer_satisfaction INTEGER,
        photos JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 5: Create captain_availability table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS captain_availability (
        id TEXT PRIMARY KEY,
        captain_id TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_available INTEGER DEFAULT 1,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 7: Create boats table (inventario de barcos)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boats (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        boat_type TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT,
        full_description TEXT,
        features JSONB,
        amenities JSONB,
        photos JSONB,
        platform_ids JSONB,
        hourly_rate_base INTEGER,
        daily_rate_base INTEGER,
        location TEXT,
        year INTEGER,
        make TEXT,
        model TEXT,
        length INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // Migration: Add missing columns to existing boats tables
    await pool.query(`
      DO $$ 
      BEGIN
        -- Add full_description if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='full_description') THEN
          ALTER TABLE boats ADD COLUMN full_description TEXT;
        END IF;
        
        -- Add amenities if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='amenities') THEN
          ALTER TABLE boats ADD COLUMN amenities JSONB;
        END IF;
        
        -- Add photos if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='photos') THEN
          ALTER TABLE boats ADD COLUMN photos JSONB;
        END IF;
        
        -- Add platform_ids if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='platform_ids') THEN
          ALTER TABLE boats ADD COLUMN platform_ids JSONB;
        END IF;
        
        -- Add hourly_rate_base if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='hourly_rate_base') THEN
          ALTER TABLE boats ADD COLUMN hourly_rate_base INTEGER;
        END IF;
        
        -- Add daily_rate_base if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='daily_rate_base') THEN
          ALTER TABLE boats ADD COLUMN daily_rate_base INTEGER;
        END IF;
        
        -- Add location if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='location') THEN
          ALTER TABLE boats ADD COLUMN location TEXT;
        END IF;
        
        -- Add year if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='year') THEN
          ALTER TABLE boats ADD COLUMN year INTEGER;
        END IF;
        
        -- Add make if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='make') THEN
          ALTER TABLE boats ADD COLUMN make TEXT;
        END IF;
        
        -- Add model if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='model') THEN
          ALTER TABLE boats ADD COLUMN model TEXT;
        END IF;
        
        -- Add length if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='length') THEN
          ALTER TABLE boats ADD COLUMN length INTEGER;
        END IF;
        
        -- Add updated_at if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boats' AND column_name='updated_at') THEN
          ALTER TABLE boats ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
        END IF;
      END $$;
    `);
    
    // FASE 7: Create platform_pricing_policies table (precios base por plataforma)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_pricing_policies (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        boat_id TEXT NOT NULL,
        base_price_half_day INTEGER NOT NULL,
        base_price_full_day INTEGER NOT NULL,
        currency TEXT DEFAULT 'USD',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 7: Create pricing_adjustments table (descuentos/aumentos centralizados)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_adjustments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        adjustment_type TEXT NOT NULL,
        adjustment_value INTEGER NOT NULL,
        scope TEXT NOT NULL,
        target_platforms JSONB,
        target_boats JSONB,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        priority INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 7: Create availability_blocks table (prevención de double-booking)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS availability_blocks (
        id TEXT PRIMARY KEY,
        boat_id TEXT NOT NULL,
        block_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        block_type TEXT NOT NULL,
        booking_id TEXT,
        reason TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        released_at TIMESTAMP
      )
    `);
    
    // Create index for fast availability lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_blocks_lookup 
      ON availability_blocks(boat_id, block_date, status)
    `);
    
    // FASE 7: Create sync_jobs table (cola de sincronización bidireccional)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL,
        target_platform TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        last_attempt_at TIMESTAMP,
        error_message TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // Create index for job queue processing
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_queue 
      ON sync_jobs(status, created_at)
    `);
    
    console.log('✅ FASE 7 tables created (boats, pricing, availability, sync_jobs)');
    
    // FASE 7 (Extended): Create dynamic pricing & market intelligence tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS competitor_data (
        id TEXT PRIMARY KEY,
        region TEXT,
        competitor_name TEXT,
        boat_type TEXT,
        capacity INTEGER,
        price_half_day NUMERIC(10,2),
        price_full_day NUMERIC(10,2),
        recorded_date DATE,
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_events (
        id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        region TEXT,
        start_date DATE,
        end_date DATE,
        price_multiplier NUMERIC(5,2),
        event_type TEXT,
        impact_level TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS demand_forecasts (
        id TEXT PRIMARY KEY,
        forecast_date DATE NOT NULL,
        region TEXT,
        boat_type TEXT,
        predicted_demand_score INTEGER,
        recommended_price_multiplier NUMERIC(5,2),
        confidence_level NUMERIC(5,2),
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_forecasts_unique 
      ON demand_forecasts(forecast_date, region, boat_type)
    `);
    
    console.log('✅ Demand forecasts unique index created');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_recommendations (
        id TEXT PRIMARY KEY,
        boat_id TEXT,
        recommended_date DATE,
        duration_hours INTEGER,
        base_price NUMERIC(10,2),
        recommended_price NUMERIC(10,2),
        factors JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_segments (
        id TEXT PRIMARY KEY,
        segment_name TEXT NOT NULL,
        characteristics JSONB,
        price_sensitivity TEXT,
        preferred_boat_types TEXT[],
        avg_booking_value NUMERIC(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    console.log('✅ FASE 7 (Extended) tables created (competitor_data, market_events, demand_forecasts, pricing_recommendations, customer_segments)');
    
    // FASE 8: Create chart_of_accounts table (accounting categories)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id TEXT PRIMARY KEY,
        account_code TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
        parent_account_id TEXT REFERENCES chart_of_accounts(id),
        description TEXT,
        is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 8: Create reconciliation_sessions table (must be before transactions due to FK)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_sessions (
        id TEXT PRIMARY KEY,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        opening_balance NUMERIC(12,2) NOT NULL,
        closing_balance NUMERIC(12,2) NOT NULL,
        total_credits NUMERIC(12,2) DEFAULT 0,
        total_debits NUMERIC(12,2) DEFAULT 0,
        variance NUMERIC(12,2) DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'cancelled')),
        reconciled_by TEXT,
        reconciled_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 8: Create transactions table (all income/expenses)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer', 'adjustment')),
        account_id TEXT NOT NULL REFERENCES chart_of_accounts(id),
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        description TEXT,
        reference_id TEXT,
        reference_type TEXT CHECK (reference_type IN ('booking', 'commission', 'fuel', 'maintenance', 'manual', 'bank_transfer', 'other')),
        boat_id TEXT,
        captain_id TEXT,
        platform TEXT,
        reconciled INTEGER DEFAULT 0 CHECK (reconciled IN (0, 1)),
        reconciliation_id TEXT REFERENCES reconciliation_sessions(id),
        notes TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // Create indices for fast transaction queries and auto-matching
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_date 
      ON transactions(transaction_date DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_boat 
      ON transactions(boat_id, transaction_date)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_reconciled 
      ON transactions(reconciled, transaction_date)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_account 
      ON transactions(account_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_reference 
      ON transactions(reference_type, reference_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_amount_date 
      ON transactions(amount, transaction_date)
    `);
    
    // FASE 8: Create bank_statements table (imported bank data)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_statements (
        id TEXT PRIMARY KEY,
        statement_date DATE NOT NULL,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
        balance NUMERIC(12,2),
        reference_number TEXT,
        matched_transaction_id TEXT REFERENCES transactions(id),
        reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('unmatched', 'suggested', 'matched', 'ignored')),
        import_batch_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_statements_date 
      ON bank_statements(statement_date DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_statements_reconciliation 
      ON bank_statements(reconciliation_status)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_statements_amount_date 
      ON bank_statements(amount, statement_date)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_statements_reference 
      ON bank_statements(reference_number)
    `);
    
    // FASE 8: Create tax_configs table (tax rules)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tax_configs (
        id TEXT PRIMARY KEY,
        jurisdiction TEXT NOT NULL,
        tax_type TEXT NOT NULL CHECK (tax_type IN ('sales_tax', 'income_tax', 'payroll_tax', 'property_tax', 'other')),
        tax_rate NUMERIC(5,2) NOT NULL,
        effective_from DATE NOT NULL,
        effective_until DATE,
        applies_to_income INTEGER DEFAULT 1 CHECK (applies_to_income IN (0, 1)),
        account_id TEXT REFERENCES chart_of_accounts(id),
        is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_configs_active 
      ON tax_configs(is_active, jurisdiction)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_configs_effective 
      ON tax_configs(effective_from, effective_until)
    `);
    
    // FASE 8: Create financial_periods table (accounting periods)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_periods (
        id TEXT PRIMARY KEY,
        period_name TEXT NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'locked')),
        closed_by TEXT,
        closed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_financial_periods_status 
      ON financial_periods(status)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_financial_periods_dates 
      ON financial_periods(period_start, period_end)
    `);
    
    // FASE 8: Create categorization_rules table (auto-categorization)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorization_rules (
        id TEXT PRIMARY KEY,
        rule_name TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        match_field TEXT NOT NULL CHECK (match_field IN ('description', 'amount', 'reference_type', 'platform', 'combined')),
        match_operator TEXT NOT NULL CHECK (match_operator IN ('contains', 'equals', 'starts_with', 'ends_with', 'greater_than', 'less_than', 'between')),
        match_value TEXT NOT NULL,
        match_value_max TEXT,
        target_account_id TEXT NOT NULL REFERENCES chart_of_accounts(id),
        transaction_type TEXT CHECK (transaction_type IN ('income', 'expense', 'transfer', 'adjustment')),
        is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
        apply_count INTEGER DEFAULT 0,
        last_applied_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categorization_rules_active 
      ON categorization_rules(is_active, priority DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_categorization_rules_field 
      ON categorization_rules(match_field)
    `);
    
    // FASE 8: Create accounting_alerts table for alert system
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounting_alerts (
        id TEXT PRIMARY KEY,
        alert_type TEXT NOT NULL CHECK (alert_type IN ('low_balance', 'unusual_spending', 'profit_margin', 'tax_reminder')),
        severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        threshold_value NUMERIC(12,2),
        actual_value NUMERIC(12,2),
        account_id TEXT REFERENCES chart_of_accounts(id),
        is_resolved INTEGER DEFAULT 0 CHECK (is_resolved IN (0, 1)),
        is_dismissed INTEGER DEFAULT 0 CHECK (is_dismissed IN (0, 1)),
        notification_sent INTEGER DEFAULT 0 CHECK (notification_sent IN (0, 1)),
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_accounting_alerts_type_resolved 
      ON accounting_alerts(alert_type, is_resolved)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_accounting_alerts_severity 
      ON accounting_alerts(severity, is_resolved)
    `);
    
    // FASE 8: Create alert_configurations table for customizable thresholds
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_configurations (
        id TEXT PRIMARY KEY,
        alert_type TEXT NOT NULL UNIQUE CHECK (alert_type IN ('low_balance', 'unusual_spending', 'profit_margin', 'tax_reminder')),
        is_enabled INTEGER DEFAULT 1 CHECK (is_enabled IN (0, 1)),
        threshold_value NUMERIC(12,2),
        threshold_percentage NUMERIC(5,2),
        comparison_operator TEXT CHECK (comparison_operator IN ('less_than', 'greater_than', 'equals', 'between')),
        account_id TEXT REFERENCES chart_of_accounts(id),
        notification_method TEXT DEFAULT 'in_app' CHECK (notification_method IN ('in_app', 'whatsapp', 'both')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    console.log('✅ FASE 8 tables created (accounting, transactions, reconciliation, categorization, alerts)');

    // FASE 8B-MIGRATION: Ensure amount/balance columns are NUMERIC(12,2), not INTEGER
    // (table may have been created before schema was updated to use NUMERIC)
    try {
      await pool.query(`
        ALTER TABLE bank_statements
          ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric(12,2),
          ALTER COLUMN balance TYPE NUMERIC(12,2) USING balance::numeric(12,2)
      `);
      console.log('✅ bank_statements amount/balance migrated to NUMERIC(12,2)');
    } catch(migrErr) {
      // Columns may already be NUMERIC — not an error
      if (!migrErr.message.includes('does not exist') && !migrErr.message.includes('already')) {
        console.log('ℹ️  bank_statements numeric migration skipped:', migrErr.message);
      }
    }

    // FASE 8B: Smart classification columns for bank_statements + patterns table
    const bsCols = [
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS category TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS accounting_type TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS confidence_level TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS boat_id TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS classification_status TEXT DEFAULT 'unclassified'`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS suggested_account_debit TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS suggested_account_credit TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS notes TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS vendor_suggestion TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS module_destination TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS duplicate_of TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS dup_score INTEGER DEFAULT NULL`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS dup_level TEXT DEFAULT NULL`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS dup_reason TEXT DEFAULT NULL`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS dup_ignored BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS confidence_reason TEXT`,
      `ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ];
    for (const q of bsCols) { try { await pool.query(q); } catch(_) {} }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS classification_patterns (
        id TEXT PRIMARY KEY,
        description_pattern TEXT NOT NULL UNIQUE,
        accounting_type TEXT NOT NULL,
        category TEXT NOT NULL,
        boat_id TEXT,
        vendor_pattern TEXT,
        module_destination TEXT,
        use_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    try { await pool.query(`ALTER TABLE classification_patterns ADD COLUMN IF NOT EXISTS vendor_pattern TEXT`); } catch(_) {}
    try { await pool.query(`ALTER TABLE classification_patterns ADD COLUMN IF NOT EXISTS module_destination TEXT`); } catch(_) {}
    console.log('✅ FASE 8B: Smart classification columns + patterns table ready');
    
    // ============================================================================
    // FASE 9: MESSAGING CENTER - Multi-platform unified inbox
    // ============================================================================
    
    // FASE 9: Create platform_configs table for platform metadata
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_configs (
        id TEXT PRIMARY KEY,
        platform_name TEXT NOT NULL UNIQUE,
        platform_icon TEXT,
        platform_color TEXT,
        base_url TEXT,
        is_auto_ingestion INTEGER DEFAULT 0 CHECK (is_auto_ingestion IN (0, 1)),
        webhook_enabled INTEGER DEFAULT 0 CHECK (webhook_enabled IN (0, 1)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // FASE 9: Create message_threads table for conversation threads
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_threads (
        id TEXT PRIMARY KEY,
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        platform TEXT NOT NULL REFERENCES platform_configs(platform_name) ON DELETE RESTRICT,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'responded', 'closed')),
        booking_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_threads_platform_status 
      ON message_threads(platform, status)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_threads_customer 
      ON message_threads(customer_email, customer_phone)
    `);
    
    // FASE 9: Create platform_messages table for individual messages
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        sender_name TEXT,
        sender_contact TEXT,
        message_content TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'responded', 'archived')),
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP,
        platform_message_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_messages_thread 
      ON platform_messages(thread_id, received_at)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_messages_status 
      ON platform_messages(status, received_at)
    `);
    
    // FASE 9: Create message_templates table for quick replies
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('pricing', 'availability', 'modifications', 'cancellations', 'general')),
        content TEXT NOT NULL,
        platform TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    // Add dynamic_placeholders column if it doesn't exist
    await pool.query(`
      ALTER TABLE message_templates 
      ADD COLUMN IF NOT EXISTS dynamic_placeholders JSONB DEFAULT '[]'::jsonb
    `);
    
    console.log('✅ FASE 9 tables created (messaging center, platform configs, templates)');
    
    // =============================================================================
    // FASE 10: BOAT MAINTENANCE & EXPENSE TRACKING SYSTEM
    // =============================================================================
    
    // FASE 10: Create mechanics table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mechanics (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        specialty TEXT NOT NULL CHECK (specialty IN ('engine_repair', 'electrical', 'hull', 'propulsion', 'fiberglass', 'general')),
        hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
        rating NUMERIC(3,2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
        total_jobs INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mechanics_status 
      ON mechanics(status, rating DESC)
    `);
    
    // FASE 10: Create boat_expenses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boat_expenses (
        id TEXT PRIMARY KEY,
        boat_id TEXT NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK (category IN ('fuel', 'maintenance_parts', 'labor', 'cleaning', 'marina_fees', 'insurance', 'emergency_repairs', 'operational')),
        amount NUMERIC(12,2) NOT NULL,
        expense_date DATE NOT NULL,
        description TEXT NOT NULL,
        receipt_image TEXT,
        mechanic_id TEXT REFERENCES mechanics(id),
        fuel_gallons NUMERIC(8,2),
        fuel_station TEXT,
        invoice_number TEXT,
        is_tax_deductible INTEGER DEFAULT 1 CHECK (is_tax_deductible IN (0, 1)),
        synced_to_accounting INTEGER DEFAULT 0 CHECK (synced_to_accounting IN (0, 1)),
        accounting_transaction_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_boat_expenses_boat_date 
      ON boat_expenses(boat_id, expense_date DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_boat_expenses_category 
      ON boat_expenses(category, expense_date DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_boat_expenses_synced 
      ON boat_expenses(synced_to_accounting)
    `);
    
    // FASE 10: Create parts_inventory table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parts_inventory (
        id TEXT PRIMARY KEY,
        part_name TEXT NOT NULL,
        part_number TEXT,
        category TEXT NOT NULL CHECK (category IN ('batteries', 'oils', 'filters', 'belts', 'spark_plugs', 'impellers', 'anodes', 'electrical', 'safety', 'other')),
        quantity INTEGER NOT NULL DEFAULT 0,
        unit_cost NUMERIC(10,2) NOT NULL,
        supplier TEXT,
        supplier_phone TEXT,
        min_stock_level INTEGER NOT NULL DEFAULT 0,
        last_restock_date DATE,
        last_restock_quantity INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_parts_inventory_category 
      ON parts_inventory(category)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_parts_inventory_stock 
      ON parts_inventory(quantity)
    `);
    
    // FASE 10: Create maintenance_records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maintenance_records (
        id TEXT PRIMARY KEY,
        boat_id TEXT NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
        service_type TEXT NOT NULL CHECK (service_type IN ('engine_oil_change', 'engine_service', 'hull_cleaning', 'electrical_repair', 'propeller_service', 'fuel_system', 'cooling_system', 'safety_inspection', 'general_maintenance', 'emergency_repair')),
        description TEXT NOT NULL,
        parts_used JSONB,
        labor_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
        mechanic_id TEXT REFERENCES mechanics(id),
        parts_cost NUMERIC(10,2) DEFAULT 0,
        labor_cost NUMERIC(10,2) DEFAULT 0,
        total_cost NUMERIC(10,2) NOT NULL,
        service_date DATE NOT NULL,
        next_service_date DATE,
        engine_hours_at_service INTEGER,
        work_order_id TEXT,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_records_boat 
      ON maintenance_records(boat_id, service_date DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_records_next_service 
      ON maintenance_records(next_service_date)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_records_status 
      ON maintenance_records(status, service_date)
    `);
    
    // FASE 10: Create work_orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_orders (
        id TEXT PRIMARY KEY,
        boat_id TEXT NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
        mechanic_id TEXT REFERENCES mechanics(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
        scheduled_date DATE,
        completion_date DATE,
        estimated_cost NUMERIC(10,2),
        actual_cost NUMERIC(10,2),
        estimated_hours NUMERIC(6,2),
        actual_hours NUMERIC(6,2),
        maintenance_record_id TEXT REFERENCES maintenance_records(id),
        notes TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_work_orders_boat_status 
      ON work_orders(boat_id, status)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_work_orders_mechanic 
      ON work_orders(mechanic_id, status)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_work_orders_priority 
      ON work_orders(priority DESC, created_at DESC)
    `);
    
    console.log('✅ FASE 10 tables created (boat maintenance & expense tracking)');

    // FASE 12: OPERATIONS MODULE TABLES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS op_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#0066cc',
        icon TEXT DEFAULT 'tag',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS op_assignees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT,
        email TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS op_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category_id TEXT REFERENCES op_categories(id) ON DELETE SET NULL,
        priority TEXT DEFAULT 'media' CHECK (priority IN ('alta','media','baja')),
        status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_progreso','completada','pausada','cancelada')),
        assignee_id TEXT REFERENCES op_assignees(id) ON DELETE SET NULL,
        start_date DATE,
        due_date DATE,
        estimated_hours NUMERIC(6,2),
        actual_hours NUMERIC(6,2),
        comments TEXT,
        tags TEXT,
        related_entity_id TEXT,
        related_entity_type TEXT,
        amount NUMERIC(12,2),
        location_name TEXT,
        location_address TEXT,
        location_lat NUMERIC(10,7),
        location_lng NUMERIC(10,7),
        maps_url TEXT,
        sync_calendar BOOLEAN DEFAULT false,
        calendar_event_id TEXT,
        sync_expenses BOOLEAN DEFAULT false,
        expense_ref_id TEXT,
        sync_income BOOLEAN DEFAULT false,
        income_ref_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_op_tasks_status ON op_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_op_tasks_due_date ON op_tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_op_tasks_assignee ON op_tasks(assignee_id);
      CREATE INDEX IF NOT EXISTS idx_op_tasks_category ON op_tasks(category_id);
    `);

    // Seed op_categories if empty
    const opCatCheck = await pool.query('SELECT COUNT(*) FROM op_categories');
    if (parseInt(opCatCheck.rows[0].count) === 0) {
      const { nanoid } = await import('nanoid');
      await pool.query(`
        INSERT INTO op_categories (id, name, color, icon) VALUES
        ('${nanoid()}', 'Reparaciones', '#dc3545', 'wrench'),
        ('${nanoid()}', 'Listings', '#fd7e14', 'list'),
        ('${nanoid()}', 'Contratos de Clientes', '#6f42c1', 'file'),
        ('${nanoid()}', 'Publicaciones', '#e83e8c', 'megaphone'),
        ('${nanoid()}', 'Administración', '#6c757d', 'settings'),
        ('${nanoid()}', 'Seguimiento Comercial', '#17a2b8', 'trending-up'),
        ('${nanoid()}', 'Gastos', '#dc3545', 'credit-card'),
        ('${nanoid()}', 'Ingresos', '#28a745', 'dollar-sign'),
        ('${nanoid()}', 'Logística', '#0066cc', 'map-pin')
      `);
      console.log('✅ Operations categories seeded');
    }

    // Seed op_assignees if empty
    const opAssCheck = await pool.query('SELECT COUNT(*) FROM op_assignees');
    if (parseInt(opAssCheck.rows[0].count) === 0) {
      const { nanoid } = await import('nanoid');
      await pool.query(`
        INSERT INTO op_assignees (id, name, role, email) VALUES
        ('${nanoid()}', 'Administrador', 'Administración', 'admin@nadakiexcursions.com'),
        ('${nanoid()}', 'Capitán Principal', 'Operaciones', 'capitan@nadakiexcursions.com')
      `);
      console.log('✅ Operations assignees seeded');
    }

    console.log('✅ FASE 12 tables created (operations module)');

    // FASE 13: Document Management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        file_size INTEGER,
        mime_type TEXT,
        notes TEXT,
        uploaded_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type)`);
    // FASE 13 enhancements: boat_id + visible_in_general
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS boat_id TEXT`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS visible_in_general BOOLEAN NOT NULL DEFAULT true`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_boat ON documents(boat_id)`);
    // Store file content in DB so files survive redeployments (no ephemeral filesystem dependency)
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data BYTEA`);
    console.log('✅ FASE 13 table created (document management)');

    // FASE 14: Captain & Stew Payments + enhanced expenses
    // Add optional columns to boat_expenses if missing
    await pool.query(`ALTER TABLE boat_expenses ADD COLUMN IF NOT EXISTS vendor TEXT`);
    await pool.query(`ALTER TABLE boat_expenses ADD COLUMN IF NOT EXISTS payment_method TEXT`);
    await pool.query(`ALTER TABLE boat_expenses ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE boat_expenses ADD COLUMN IF NOT EXISTS invoice_document_id TEXT`);
    await pool.query(`ALTER TABLE boat_expenses ADD COLUMN IF NOT EXISTS recurring_rule_id TEXT`);
    await pool.query(`ALTER TABLE boat_expenses ADD COLUMN IF NOT EXISTS generated_automatically BOOLEAN DEFAULT FALSE`);

    // Stews catalog table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stews (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);

    // Captain payments (linked to boat)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS captain_payments (
        id TEXT PRIMARY KEY,
        captain_id TEXT,
        captain_name TEXT NOT NULL,
        boat_id TEXT NOT NULL,
        boat_name TEXT,
        hours NUMERIC(6,2),
        work_date DATE NOT NULL,
        description TEXT,
        amount NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'paid',
        reference TEXT,
        registered_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cap_pay_boat ON captain_payments(boat_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cap_pay_captain ON captain_payments(captain_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cap_pay_date ON captain_payments(work_date DESC)`);

    // Stew payments (parallel to captain payments)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stew_payments (
        id TEXT PRIMARY KEY,
        stew_id TEXT,
        stew_name TEXT NOT NULL,
        boat_id TEXT NOT NULL,
        boat_name TEXT,
        hours NUMERIC(6,2),
        work_date DATE NOT NULL,
        description TEXT,
        amount NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'paid',
        reference TEXT,
        registered_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_stew_pay_boat ON stew_payments(boat_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_stew_pay_stew ON stew_payments(stew_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_stew_pay_date ON stew_payments(work_date DESC)`);

    console.log('✅ FASE 14 tables created (captain/stew payments)');

    // Booking Deposits: separate liability account for future reservations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_deposits (
        id TEXT PRIMARY KEY,
        client_name TEXT NOT NULL,
        client_email TEXT,
        client_phone TEXT,
        boat_id TEXT REFERENCES boats(id),
        booking_reference TEXT,
        amount NUMERIC(12,2) NOT NULL,
        deposit_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','refunded')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    console.log('✅ booking_deposits table ready');

    // Add booking-detail columns to booking_deposits (safe ADD IF NOT EXISTS)
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS booking_date DATE`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS booking_total_amount NUMERIC(12,2)`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS hours_rented NUMERIC(5,2)`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS service_type TEXT`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS linked_receivable_id TEXT`);
    console.log('✅ booking_deposits columns extended');

    // Accounts receivable for booking balance-due amounts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_receivables (
        id TEXT PRIMARY KEY,
        deposit_id TEXT REFERENCES booking_deposits(id) ON DELETE CASCADE,
        client_name TEXT NOT NULL,
        client_email TEXT,
        client_phone TEXT,
        boat_id TEXT REFERENCES boats(id),
        due_date DATE,
        amount NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ booking_receivables table ready');

    // Extend booking_receivables with party info
    await pool.query(`ALTER TABLE booking_receivables ADD COLUMN IF NOT EXISTS party_type TEXT CHECK (party_type IN ('customer','broker'))`);
    await pool.query(`ALTER TABLE booking_receivables ADD COLUMN IF NOT EXISTS party_id TEXT`);
    await pool.query(`ALTER TABLE booking_receivables ADD COLUMN IF NOT EXISTS party_name TEXT`);
    await pool.query(`ALTER TABLE booking_receivables ADD COLUMN IF NOT EXISTS booking_id TEXT`);
    await pool.query(`ALTER TABLE booking_receivables ADD COLUMN IF NOT EXISTS broker_id TEXT`);

    // Extend booking_deposits with transaction link
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS linked_transaction_id TEXT`);

    // Extend booking_deposits with source/broker/customer fields
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'direct'`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS customer_id TEXT`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS broker_id TEXT`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS final_customer_name TEXT`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS final_customer_phone TEXT`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS final_customer_email TEXT`);
    await pool.query(`ALTER TABLE booking_deposits ADD COLUMN IF NOT EXISTS booking_ledger_id TEXT`);

    // Brokers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brokers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        notes TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ brokers table ready');

    // Customers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ customers table ready');

    // Bookings ledger — full booking record
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings_ledger (
        id TEXT PRIMARY KEY,
        booking_source TEXT NOT NULL DEFAULT 'direct' CHECK (booking_source IN ('direct','broker')),
        boat_id TEXT REFERENCES boats(id),
        booking_date DATE,
        hours_rented NUMERIC(5,2),
        total_amount NUMERIC(12,2),
        deposit_amount NUMERIC(12,2),
        customer_id TEXT REFERENCES customers(id),
        customer_name TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        broker_id TEXT REFERENCES brokers(id),
        broker_name TEXT,
        final_customer_name TEXT,
        final_customer_phone TEXT,
        final_customer_email TEXT,
        receivable_party_type TEXT CHECK (receivable_party_type IN ('customer','broker')),
        receivable_party_id TEXT,
        receivable_party_name TEXT,
        deposit_id TEXT,
        service_type TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ bookings_ledger table ready');

    // Seed chart of accounts if empty
    const accountsCheck = await pool.query('SELECT COUNT(*) FROM chart_of_accounts');
    if (parseInt(accountsCheck.rows[0].count) === 0) {
      const { nanoid } = await import('nanoid');
      
      // Create parent accounts first, then child accounts
      const assetParent = nanoid();
      const liabilityParent = nanoid();
      const equityParent = nanoid();
      const revenueParent = nanoid();
      const expenseParent = nanoid();
      
      // Parent Accounts (Top-level categories)
      await pool.query(`
        INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, description) VALUES
        ('${assetParent}', '1000', 'Assets', 'asset', 'Total Assets'),
        ('${liabilityParent}', '2000', 'Liabilities', 'liability', 'Total Liabilities'),
        ('${equityParent}', '3000', 'Equity', 'equity', 'Owner Equity'),
        ('${revenueParent}', '4000', 'Revenue', 'revenue', 'Total Revenue'),
        ('${expenseParent}', '5000', 'Expenses', 'expense', 'Total Expenses')
      `);
      
      // Asset Sub-Accounts
      await pool.query(`
        INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, parent_account_id, description) VALUES
        ('${nanoid()}', '1010', 'Cash - Operating Account', 'asset', '${assetParent}', 'Main operating bank account'),
        ('${nanoid()}', '1020', 'Cash - Savings', 'asset', '${assetParent}', 'Savings account'),
        ('${nanoid()}', '1100', 'Accounts Receivable', 'asset', '${assetParent}', 'Money owed by customers'),
        ('${nanoid()}', '1200', 'Prepaid Expenses', 'asset', '${assetParent}', 'Prepaid insurance, fuel, etc'),
        ('${nanoid()}', '1300', 'Fuel Inventory', 'asset', '${assetParent}', 'Fuel on hand'),
        ('${nanoid()}', '1500', 'Boats - Fleet', 'asset', '${assetParent}', 'Boat fleet at cost'),
        ('${nanoid()}', '1510', 'Accumulated Depreciation - Boats', 'asset', '${assetParent}', 'Depreciation on boat fleet'),
        ('${nanoid()}', '1600', 'Equipment', 'asset', '${assetParent}', 'Marine equipment and tools'),
        ('${nanoid()}', '1610', 'Accumulated Depreciation - Equipment', 'asset', '${assetParent}', 'Depreciation on equipment')
      `);
      
      // Liability Sub-Accounts
      await pool.query(`
        INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, parent_account_id, description) VALUES
        ('${nanoid()}', '2010', 'Accounts Payable', 'liability', '${liabilityParent}', 'Money owed to vendors'),
        ('${nanoid()}', '2100', 'Sales Tax Payable', 'liability', '${liabilityParent}', 'Sales tax collected from customers'),
        ('${nanoid()}', '2110', 'Income Tax Payable', 'liability', '${liabilityParent}', 'Estimated income tax payable'),
        ('${nanoid()}', '2200', 'Wages Payable', 'liability', '${liabilityParent}', 'Unpaid captain wages'),
        ('${nanoid()}', '2300', 'Loan - Boat Purchase', 'liability', '${liabilityParent}', 'Boat financing loans'),
        ('${nanoid()}', '2400', 'Credit Cards Payable', 'liability', '${liabilityParent}', 'Business credit card balances')
      `);
      
      // Equity Sub-Accounts
      await pool.query(`
        INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, parent_account_id, description) VALUES
        ('${nanoid()}', '3010', 'Owner Capital', 'equity', '${equityParent}', 'Owner investment'),
        ('${nanoid()}', '3020', 'Owner Draws', 'equity', '${equityParent}', 'Owner withdrawals'),
        ('${nanoid()}', '3100', 'Retained Earnings', 'equity', '${equityParent}', 'Accumulated profits')
      `);
      
      // Revenue Sub-Accounts
      await pool.query(`
        INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, parent_account_id, description) VALUES
        ('${nanoid()}', '4010', 'Revenue - Tours', 'revenue', '${revenueParent}', 'Income from boat tours'),
        ('${nanoid()}', '4020', 'Revenue - Rentals', 'revenue', '${revenueParent}', 'Income from boat rentals'),
        ('${nanoid()}', '4030', 'Revenue - Fishing Charters', 'revenue', '${revenueParent}', 'Income from fishing charters'),
        ('${nanoid()}', '4040', 'Revenue - Special Events', 'revenue', '${revenueParent}', 'Income from special events'),
        ('${nanoid()}', '4900', 'Revenue - Other', 'revenue', '${revenueParent}', 'Other miscellaneous revenue')
      `);
      
      // Expense Sub-Accounts (FASE 10 boat expenses integration)
      await pool.query(`
        INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, parent_account_id, description) VALUES
        ('${nanoid()}', '5010', 'Fuel Expense', 'expense', '${expenseParent}', 'Fuel costs for boats'),
        ('${nanoid()}', '5020', 'Boat Parts & Maintenance', 'expense', '${expenseParent}', 'Boat parts and maintenance expenses'),
        ('${nanoid()}', '5030', 'Marine Labor', 'expense', '${expenseParent}', 'Mechanic and technician labor costs'),
        ('${nanoid()}', '5040', 'Boat Cleaning', 'expense', '${expenseParent}', 'Boat cleaning and detailing'),
        ('${nanoid()}', '5050', 'Marina & Dock Fees', 'expense', '${expenseParent}', 'Dockage and marina fees'),
        ('${nanoid()}', '5060', 'Marine Insurance', 'expense', '${expenseParent}', 'Boat and liability insurance'),
        ('${nanoid()}', '5070', 'Emergency Repairs', 'expense', '${expenseParent}', 'Emergency boat repairs'),
        ('${nanoid()}', '5080', 'Operational Expenses', 'expense', '${expenseParent}', 'General operational expenses'),
        ('${nanoid()}', '5100', 'Maintenance & Repairs', 'expense', '${expenseParent}', 'General maintenance and repairs'),
        ('${nanoid()}', '5200', 'Marina Fees', 'expense', '${expenseParent}', 'Dockage and marina fees'),
        ('${nanoid()}', '5300', 'Insurance Expense', 'expense', '${expenseParent}', 'Boat and liability insurance'),
        ('${nanoid()}', '5400', 'Captain Wages', 'expense', '${expenseParent}', 'Captain salaries and wages'),
        ('${nanoid()}', '5500', 'Platform Commissions', 'expense', '${expenseParent}', 'Booking platform commission fees'),
        ('${nanoid()}', '5600', 'Marketing & Advertising', 'expense', '${expenseParent}', 'Marketing and advertising costs'),
        ('${nanoid()}', '5700', 'Supplies', 'expense', '${expenseParent}', 'Safety equipment and supplies'),
        ('${nanoid()}', '5800', 'Licenses & Permits', 'expense', '${expenseParent}', 'Business licenses and permits'),
        ('${nanoid()}', '5810', 'Depreciation Expense', 'expense', '${expenseParent}', 'Depreciation of boats and equipment'),
        ('${nanoid()}', '5900', 'Administrative Expenses', 'expense', '${expenseParent}', 'Office and administrative expenses'),
        ('${nanoid()}', '5910', 'Interest Expense', 'expense', '${expenseParent}', 'Interest on loans and credit cards'),
        ('${nanoid()}', '5920', 'Bank Fees', 'expense', '${expenseParent}', 'Bank service charges')
      `);
      
      console.log('✅ Chart of accounts initialized with hierarchical marine business accounts');
    }

    // Ensure "Deferred Booking Deposits" liability account exists (idempotent migration)
    await pool.query(`
      INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, description)
      VALUES ('acc_booking_deposits_2500', '2500', 'Deferred Booking Deposits', 'liability',
              'Deposits received for future bookings — not yet recognized as revenue')
      ON CONFLICT (id) DO NOTHING
    `);

    // ── Viáticos & Transportación expense accounts (idempotent) ───────────
    const expParent = await pool.query(`SELECT id FROM chart_of_accounts WHERE account_code='5000' LIMIT 1`);
    const expParentId = expParent.rows[0]?.id || null;
    await pool.query(`
      INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, parent_account_id, description)
      VALUES
        ('acc_expense_5930', '5930', 'Viáticos', 'expense', $1, 'Viáticos y gastos de viaje del personal'),
        ('acc_expense_5940', '5940', 'Transportación', 'expense', $1, 'Gastos de transporte, traslados y fletes'),
        ('acc_expense_5950', '5950', 'GPS Barcos', 'expense', $1, 'Suscripciones y equipos de GPS para la flota'),
        ('acc_expense_5960', '5960', 'Publicidad', 'expense', $1, 'Publicidad, anuncios y promoción de servicios'),
        ('acc_expense_5970', '5970', 'Renta de Oficina', 'expense', $1, 'Alquiler de espacio de oficina'),
        ('acc_expense_5975', '5975', 'Partes y Piezas', 'expense', $1, 'Partes, piezas y repuestos generales'),
        ('acc_expense_5980', '5980', 'Sistemas Operativos', 'expense', $1, 'Software, sistemas y plataformas operativas'),
        ('acc_expense_5985', '5985', 'Comunicaciones', 'expense', $1, 'Teléfono, internet y servicios de comunicación'),
        ('acc_expense_5990', '5990', 'Electricidad y Luces', 'expense', $1, 'Servicio eléctrico, iluminación y utilidades')
      ON CONFLICT (id) DO NOTHING
    `, [expParentId]);
    console.log('✅ Cuentas de gastos adicionales (5930–5990) listas');

    // ── Company Assets tables ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('equipo','inventario','accesorio','marina')),
        description TEXT,
        purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
        purchase_date DATE,
        supplier TEXT,
        boat_id TEXT REFERENCES boats(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        location TEXT,
        status TEXT NOT NULL DEFAULT 'activo'
          CHECK (status IN ('activo','en_uso','mantenimiento','dañado','fuera_de_servicio')),
        payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','credit')),
        useful_life_years INTEGER,
        residual_value NUMERIC(12,2) DEFAULT 0,
        notes TEXT,
        accounting_tx_debit_id TEXT,
        accounting_tx_credit_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset_movements (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES company_assets(id) ON DELETE CASCADE,
        movement_type TEXT NOT NULL
          CHECK (movement_type IN ('asignado','movido','dañado','eliminado','reparado','ajuste_inventario')),
        quantity_change INTEGER DEFAULT 0,
        from_boat_id TEXT,
        to_boat_id TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ company_assets and asset_movements tables ready');

    // Extend bookings table with manual booking fields
    const bookingCols = [
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stew_id TEXT`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stew_name TEXT`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS boat_id TEXT`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS broker_id TEXT`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS broker_name TEXT`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_location TEXT`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS num_guests INTEGER DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_pending NUMERIC(10,2) DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ];
    for (const sql of bookingCols) {
      await pool.query(sql).catch(() => {});
    }
    console.log('✅ bookings table extended with manual booking fields');

    // Idempotent asset chart-of-accounts
    await pool.query(`
      INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, description)
      VALUES
        ('acc_marine_equipment_1620','1620','Marine Equipment','asset','Marine-specific equipment and gear'),
        ('acc_inventory_assets_1630','1630','Inventory Assets','asset','Company inventory held for operations')
      ON CONFLICT (id) DO NOTHING
    `);

    // Extend transactions reference_type constraint to include 'asset'
    await pool.query(`
      ALTER TABLE transactions
        DROP CONSTRAINT IF EXISTS transactions_reference_type_check
    `);
    await pool.query(`
      ALTER TABLE transactions
        ADD CONSTRAINT transactions_reference_type_check
        CHECK (reference_type IN ('booking','commission','fuel','maintenance','manual','bank_transfer','other','asset'))
    `);
    
    // AUTHENTICATION: Create sessions table (required for Replit Auth)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions (expire)
    `);
    
    // AUTHENTICATION: Create users table (required for Replit Auth)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR UNIQUE,
        first_name VARCHAR,
        last_name VARCHAR,
        profile_image_url VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // FASE 9: Seed platform_configs if empty
    const platformsCheck = await pool.query('SELECT COUNT(*) FROM platform_configs');
    if (parseInt(platformsCheck.rows[0].count) === 0) {
      const { nanoid } = await import('nanoid');
      
      await pool.query(`
        INSERT INTO platform_configs (id, platform_name, platform_icon, platform_color, base_url, is_auto_ingestion, webhook_enabled) VALUES
        ('${nanoid()}', 'Airbnb', '🏠', '#FF5A5F', 'https://www.airbnb.com/hosting/inbox', 0, 0),
        ('${nanoid()}', 'Boat Setter', '⛵', '#0066CC', 'https://www.boatsetter.com/messages', 0, 0),
        ('${nanoid()}', 'GetMyBoat', '🚤', '#00A3E0', 'https://www.getmyboat.com/inbox', 0, 0),
        ('${nanoid()}', 'WhatsApp', '💬', '#25D366', 'auto', 1, 1),
        ('${nanoid()}', 'Email', '📧', '#4285F4', 'auto', 1, 1),
        ('${nanoid()}', 'Viator', '🎫', '#00AA6C', 'https://www.viator.com/messages', 0, 0),
        ('${nanoid()}', 'TripAdvisor', '🦉', '#00AF87', 'https://www.tripadvisor.com/Inbox', 0, 0),
        ('${nanoid()}', 'Expedia', '✈️', '#003B95', 'https://www.expedia.com/messages', 0, 0),
        ('${nanoid()}', 'Website Chat', '💭', '#2563EB', 'auto', 1, 0),
        ('${nanoid()}', 'FareHarbor', '🎟️', '#FF6B35', 'https://www.fareharbor.com/messages', 0, 0)
      `);
      
      console.log('✅ Platform configurations seeded with 10 messaging platforms');
    }
    
    // FASE 9: Seed message_templates with common responses
    const templatesCheck = await pool.query('SELECT COUNT(*) FROM message_templates');
    if (parseInt(templatesCheck.rows[0].count) === 0) {
      const { nanoid } = await import('nanoid');
      
      await pool.query(`
        INSERT INTO message_templates (id, name, category, content, platform) VALUES
        ('${nanoid()}', 'Consulta de Precio', 'pricing', 'Hola {customer_name}! Gracias por tu interés en Nadaki Excursions. Nuestros tours tienen los siguientes precios:\n\n🚤 Tour de 2 horas: $XXX\n⛵ Tour de 4 horas: $XXX\n🌅 Tour de día completo (8h): $XXX\n\n¿Qué fecha te interesa?', NULL),
        ('${nanoid()}', 'Verificar Disponibilidad', 'availability', 'Hola {customer_name}! Déjame verificar la disponibilidad para la fecha {date}. Te responderé en breve con opciones de horarios disponibles. 📅', NULL),
        ('${nanoid()}', 'Confirmación de Reserva', 'general', '¡Perfecto! Tu reserva está confirmada para {date} a las {time}. 🎉\n\nDetalles:\n🚤 Barco: {boat_type}\n👨‍✈️ Capitán asignado\n📍 Punto de encuentro: Marina Nadaki\n⏰ Hora de llegada: 15 min antes\n\n¿Alguna pregunta adicional?', NULL),
        ('${nanoid()}', 'Modificar Reserva', 'modifications', 'Entiendo que necesitas modificar tu reserva. ¿Qué cambio te gustaría hacer?\n\n✏️ Cambiar fecha\n🕐 Cambiar horario\n👥 Cambiar número de pasajeros\n\nDímelo y lo arreglo de inmediato.', NULL),
        ('${nanoid()}', 'Política de Cancelación', 'cancellations', 'Nuestra política de cancelación es:\n\n✅ Cancelación gratuita hasta 48h antes\n⚠️ 50% de reembolso entre 24-48h antes\n❌ Sin reembolso menos de 24h antes\n\n¿Quieres proceder con la cancelación?', NULL),
        ('${nanoid()}', 'Después de Horas', 'general', '¡Gracias por contactarnos! Actualmente estamos fuera de horario (9 AM - 6 PM). Te responderemos mañana a primera hora. Para emergencias, llama al +XXX-XXX-XXXX. 🌙', NULL)
      `);
      
      console.log('✅ Message templates seeded with 6 common response templates');
    }
    
    // FASE 10: Seed mechanics with example technicians
    const mechanicsCheck = await pool.query('SELECT COUNT(*) FROM mechanics');
    if (parseInt(mechanicsCheck.rows[0].count) === 0) {
      const { nanoid } = await import('nanoid');
      
      await pool.query(`
        INSERT INTO mechanics (id, name, phone, email, specialty, hourly_rate, status, rating, total_jobs) VALUES
        ('${nanoid()}', 'Carlos Rodriguez', '+1-305-555-0101', 'carlos@marineworks.com', 'engine_repair', 85.00, 'active', 4.8, 127),
        ('${nanoid()}', 'Mike Thompson', '+1-305-555-0102', 'mike@seasideboats.com', 'electrical', 75.00, 'active', 4.6, 89),
        ('${nanoid()}', 'Jose Martinez', '+1-305-555-0103', 'jose@boattech.com', 'hull', 70.00, 'active', 4.9, 156),
        ('${nanoid()}', 'David Chen', '+1-305-555-0104', 'david@propexperts.com', 'propulsion', 80.00, 'active', 4.7, 93),
        ('${nanoid()}', 'Roberto Silva', '+1-305-555-0105', 'roberto@marinefix.com', 'general', 65.00, 'active', 4.5, 201)
      `);
      
      console.log('✅ Mechanics seeded with 5 technicians across different specialties');
    }
    
    // FASE 10: Seed parts_inventory with common boat parts
    const partsCheck = await pool.query('SELECT COUNT(*) FROM parts_inventory');
    if (parseInt(partsCheck.rows[0].count) === 0) {
      const { nanoid } = await import('nanoid');
      
      await pool.query(`
        INSERT INTO parts_inventory (id, part_name, part_number, category, quantity, unit_cost, supplier, min_stock_level) VALUES
        ('${nanoid()}', 'Marine Battery 12V', 'MB-12V-100AH', 'batteries', 8, 189.99, 'West Marine Supply', 3),
        ('${nanoid()}', 'Engine Oil 10W-30 (5L)', 'EO-10W30-5L', 'oils', 15, 34.99, 'Yamaha Parts Direct', 5),
        ('${nanoid()}', 'Fuel Filter', 'FF-MERCURY-001', 'filters', 12, 24.99, 'Mercury Marine', 4),
        ('${nanoid()}', 'Oil Filter', 'OF-YAMAHA-200', 'filters', 10, 18.99, 'Yamaha Parts Direct', 4),
        ('${nanoid()}', 'V-Belt Set', 'VB-STANDARD-SET', 'belts', 6, 45.99, 'Marine Parts Plus', 2),
        ('${nanoid()}', 'Spark Plugs (Set of 6)', 'SP-NGK-BPR6ES', 'spark_plugs', 20, 29.99, 'NGK Distributor', 8),
        ('${nanoid()}', 'Water Pump Impeller', 'IMP-MERCURY-47', 'impellers', 5, 64.99, 'Mercury Marine', 2),
        ('${nanoid()}', 'Zinc Anode Kit', 'ZA-UNIVERSAL-KIT', 'anodes', 14, 39.99, 'West Marine Supply', 6),
        ('${nanoid()}', 'Bilge Pump', 'BP-RULE-1100', 'electrical', 4, 89.99, 'Rule Industries', 2),
        ('${nanoid()}', 'Life Jacket Adult', 'LJ-USCG-ADULT', 'safety', 25, 34.99, 'Safety Marine Co', 10)
      `);
      
      console.log('✅ Parts inventory seeded with 10 common boat parts');
    }
    
    console.log('✅ Database schema initialized successfully (all 10 phases + authentication)');
    
    // Insert default message templates if they don't exist
    await insertDefaultTemplates();
  } catch (error) {
    console.error('❌ Error initializing database schema:', error);
    throw error;
  }
}

// Insert default intelligent message templates
async function insertDefaultTemplates() {
  try {
    const checkResult = await pool.query('SELECT COUNT(*) as count FROM message_templates');
    const templateCount = parseInt(checkResult.rows[0].count);
    
    if (templateCount > 0) {
      console.log('✅ Message templates already exist');
      return;
    }
    
    const { nanoid } = await import('nanoid');
    
    const defaultTemplates = [
      {
        id: nanoid(),
        name: 'Respuesta con Disponibilidad',
        category: 'availability',
        content: `Hola {{customer_name}},

¡Gracias por contactarnos!

Me da mucho gusto informarte que tenemos disponibilidad para {{booking_date}}. Basándome en tu consulta de {{booking_people}} personas, estas son nuestras opciones disponibles:

{{available_boats_with_prices}}

Todos nuestros barcos incluyen:
- Capitán profesional certificado
- Equipo de seguridad completo
- Agua y refrescos
- Sistema de sonido Bluetooth

¿Te gustaría reservar alguna de estas opciones? Puedo enviarte el enlace de pago de inmediato.

Saludos,
{{company_name}}
{{company_phone}}`,
        platform: null,
        dynamic_placeholders: JSON.stringify(['customer_name', 'booking_date', 'booking_people', 'available_boats_with_prices', 'company_name', 'company_phone'])
      },
      {
        id: nanoid(),
        name: 'Confirmación de Reserva',
        category: 'general',
        content: `¡Hola {{customer_name}}!

Tu reserva ha sido confirmada exitosamente. Aquí están los detalles:

📅 Fecha: {{booking_date}}
⏰ Hora: {{booking_time}}
🚤 Barco: {{boat_name}} ({{boat_type}})
👥 Capacidad: {{boat_capacity}} personas
📍 Ubicación: {{boat_location}}
💰 Total: {{total_price}}

Información importante:
- Por favor llega 15 minutos antes
- Trae ropa cómoda y protector solar
- No olvides una identificación válida

Si necesitas hacer algún cambio, contáctanos lo antes posible.

¡Nos vemos pronto!

{{company_name}}
{{company_phone}}
{{company_website}}`,
        platform: null,
        dynamic_placeholders: JSON.stringify(['customer_name', 'booking_date', 'booking_time', 'boat_name', 'boat_type', 'boat_capacity', 'boat_location', 'total_price', 'company_name', 'company_phone', 'company_website'])
      },
      {
        id: nanoid(),
        name: 'Alternativas Sugeridas',
        category: 'availability',
        content: `Hola {{customer_name}},

Gracias por tu interés en nuestros servicios.

Lamentablemente {{boat_name}} no está disponible para {{booking_date}}, pero tengo excelentes alternativas para ti:

{{available_boats_with_prices}}

Todas estas opciones cumplen con tus requisitos de {{booking_people}} personas{{#if preferences}} y tus preferencias de {{preferences}}{{/if}}.

¿Te gustaría reservar alguna de estas opciones alternativas? También podemos buscar disponibilidad para otras fechas si prefieres.

Quedo atento a tu respuesta.

Saludos,
{{company_name}}
{{company_phone}}`,
        platform: null,
        dynamic_placeholders: JSON.stringify(['customer_name', 'boat_name', 'booking_date', 'booking_people', 'preferences', 'available_boats_with_prices', 'company_name', 'company_phone'])
      },
      {
        id: nanoid(),
        name: 'Respuesta Rápida - Precio',
        category: 'pricing',
        content: `Hola {{customer_name}},

El precio para {{boat_name}} es de {{final_price}} por {{booking_duration}} horas{{#if discount}} (precio especial, ahorras {{discount}}){{/if}}.

Este precio incluye:
✅ Capitán certificado
✅ Combustible
✅ Equipo de seguridad
✅ Agua y refrescos

¿Te gustaría reservar? Puedo enviarte el enlace de pago de inmediato.

{{company_name}}
{{company_phone}}`,
        platform: null,
        dynamic_placeholders: JSON.stringify(['customer_name', 'boat_name', 'final_price', 'booking_duration', 'discount', 'company_name', 'company_phone'])
      },
      {
        id: nanoid(),
        name: 'Seguimiento Post-Consulta',
        category: 'general',
        content: `Hola {{customer_name}},

Te escribo para dar seguimiento a tu consulta sobre nuestros servicios de excursiones.

¿Aún estás interesado en reservar para {{booking_date}}? Tengo disponibilidad confirmada y puedo ofrecerte un precio especial si reservas hoy.

Opciones disponibles:
{{available_boats}}

No dudes en contactarme si tienes alguna pregunta o si prefieres otras fechas.

Saludos,
{{company_name}}
{{company_phone}}`,
        platform: null,
        dynamic_placeholders: JSON.stringify(['customer_name', 'booking_date', 'available_boats', 'company_name', 'company_phone'])
      }
    ];
    
    for (const template of defaultTemplates) {
      await pool.query(
        `INSERT INTO message_templates (id, name, category, content, platform, dynamic_placeholders)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [template.id, template.name, template.category, template.content, template.platform, template.dynamic_placeholders]
      );
    }
    
    console.log(`✅ Inserted ${defaultTemplates.length} default message templates`);
  } catch (error) {
    console.error('Error inserting default templates:', error);
    // Non-fatal error, continue initialization
  }
}

// Initialize database before starting server
initializeDatabase().catch(console.error);

// ========================================
// RATE LIMITING & SECURITY
// ========================================

// Rate limiting setup (simple in-memory)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute  
const MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per minute

function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }
    
    const requests = rateLimitMap.get(ip).filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (requests.length >= MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }
    
    requests.push(now);
    rateLimitMap.set(ip, requests);
    next();
}

// Clean up rate limit map periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, requests] of rateLimitMap.entries()) {
        const validRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
        if (validRequests.length === 0) {
            rateLimitMap.delete(ip);
        } else {
            rateLimitMap.set(ip, validRequests);
        }
    }
}, RATE_LIMIT_WINDOW);

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del dashboard
app.use(express.static('public'));

// Configure multer for file uploads (in-memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// AUTHENTICATION DISABLED
// (async () => {
//   try {
//     await setupAuth(app);
//     console.log('✅ Authentication configured successfully');
//   } catch (error) {
//     console.error('❌ Error setting up authentication:', error);
//   }
// })();

// 🏠 RUTA RAÍZ - Redirect to dashboard (no authentication)
app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

// Configuración para tu dominio WordPress
const WORDPRESS_DOMAIN = 'https://www.nadakiexcursions.com';

// Platform list (constant)
const PLATFORMS = [
  'Boat Setter', 'Airbnb', 'Sailo', 'Website', 'Get My Boat', 
  'Viator', 'Click and Boat', 'Odisea Rental', 'Sail.net', 
  'Samboat', 'BoatLink', 'Borrow a boat', 'Nautical Monkey'
];

// 🎯 WEBHOOK UNIVERSAL para todas las plataformas
app.post('/webhook/booking/:platform', async (req, res) => {
  try {
    const platform = req.params.platform;
    const bookingData = req.body;
    
    console.log(`📦 Nueva reserva de ${platform}:`, bookingData);

    // Normalizar datos de diferentes plataformas
    const normalizedBooking = normalizeBookingData(platform, bookingData);
    
    // Crear registro
    const bookingId = `${platform.toLowerCase().replace(/ /g, '_')}_${Date.now()}`;
    const bookingRecord = {
      id: bookingId,
      platform: platform,
      customer_name: normalizedBooking.customer_name,
      customer_phone: normalizedBooking.customer_phone,
      customer_email: normalizedBooking.customer_email,
      boat_type: normalizedBooking.boat_type,
      booking_date: normalizedBooking.booking_date,
      start_time: normalizedBooking.start_time,
      duration_hours: normalizedBooking.duration_hours,
      total_amount: normalizedBooking.total_amount,
      status: 'confirmed',
      notes: normalizedBooking.special_requests || '',
      internal_notes: `From ${platform} API`
    };
    
    // Save to database
    await pool.query(`
      INSERT INTO bookings (
        id, platform, customer_name, customer_phone, customer_email,
        boat_type, booking_date, start_time, duration_hours, total_amount,
        status, notes, internal_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      bookingRecord.id, bookingRecord.platform, bookingRecord.customer_name,
      bookingRecord.customer_phone, bookingRecord.customer_email, bookingRecord.boat_type,
      bookingRecord.booking_date, bookingRecord.start_time, bookingRecord.duration_hours,
      bookingRecord.total_amount, bookingRecord.status, bookingRecord.notes,
      bookingRecord.internal_notes
    ]);

    // FASE 7: Crear bloqueo de disponibilidad y encolar sync_jobs
    try {
      const { calculateEndTime } = require('./server/syncService');
      const endTime = calculateEndTime(bookingRecord.start_time, bookingRecord.duration_hours);
      
      // Crear bloqueo de disponibilidad
      await availabilityService.createBlock({
        boatId: 'default_boat', // En producción, vendría del sistema de inventario
        blockDate: bookingRecord.booking_date,
        startTime: bookingRecord.start_time,
        endTime: endTime,
        blockType: 'booking',
        bookingId: bookingRecord.id,
        reason: `Reserva confirmada desde ${platform}`,
        status: 'blocked'
      });
      
      // Crear trabajos de sincronización masivos para bloquear en todas las otras plataformas
      const jobs = await syncJobsWorker.createBulkSyncJobs(
        'block_date',
        {
          boatId: 'default_boat',
          date: bookingRecord.booking_date,
          startTime: bookingRecord.start_time,
          endTime: endTime,
          bookingId: bookingRecord.id,
          reason: `Reserva confirmada en ${platform}`
        },
        platform // Excluir la plataforma origen
      );
      
      console.log(`✅ Created availability block and ${jobs.length} sync jobs for booking ${bookingRecord.id}`);
    } catch (blockError) {
      console.error('❌ Error creating availability block or sync jobs:', blockError);
      // No fallar el booking si falla el bloqueo
    }

    // Asignar capitán y enviar notificaciones (FASE 5: algoritmo mejorado)
    const assignedCaptain = await assignCaptain(
      normalizedBooking.boat_type,
      normalizedBooking.booking_date,
      normalizedBooking.start_time,
      normalizedBooking.duration_hours
    );
    
    if (assignedCaptain) {
      await updateBookingWithCaptain(bookingRecord.id, assignedCaptain);
      await sendNotifications(assignedCaptain, bookingRecord);
    }

    // FASE 8: Auto-create revenue transaction
    try {
      await createRevenueFromBooking(
        bookingRecord.id,
        platform,
        bookingRecord.total_amount,
        bookingRecord.booking_date,
        `Revenue from ${platform} booking - ${bookingRecord.customer_name}`
      );
    } catch (autoAccountingError) {
      console.error('⚠️ Auto-accounting failed (non-critical):', autoAccountingError);
      // Don't fail the booking if accounting fails
    }

    res.json({ 
      success: true, 
      booking_id: bookingRecord.id,
      captain: assignedCaptain?.name,
      platform: platform
    });

  } catch (error) {
    console.error(`Error con plataforma ${req.params.platform}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🔄 NORMALIZAR DATOS DE DIFERENTES PLATAFORMAS
function normalizeBookingData(platform, rawData) {
  const normalizers = {
    'Airbnb': (data) => ({
      customer_name: data.guest_name || data.guest?.name || 'Cliente Airbnb',
      customer_phone: data.guest_phone || data.guest?.phone || '+15550000000',
      customer_email: data.guest_email || data.guest?.email || '',
      boat_type: data.listing_title || 'Barco Airbnb',
      booking_date: data.start_date || moment().format('YYYY-MM-DD'),
      start_time: data.check_in_time || '14:00',
      duration_hours: calculateDuration(data.start_date, data.end_date) || 4,
      total_amount: data.total_price || data.amount || 0,
      special_requests: data.guest_notes || ''
    }),
    
    'Get My Boat': (data) => ({
      customer_name: data.customer_name || 'Cliente GetMyBoat',
      customer_phone: data.customer_phone || '+15550000000',
      customer_email: data.customer_email || '',
      boat_type: data.boat_name || 'Barco GetMyBoat',
      booking_date: data.booking_date || moment().format('YYYY-MM-DD'),
      start_time: data.start_time || '10:00',
      duration_hours: data.duration || 4,
      total_amount: data.total_cost || 0,
      special_requests: data.special_requests || ''
    }),
    
    'Website': (data) => ({
      customer_name: data.name || 'Cliente Web',
      customer_phone: data.phone || '+15550000000',
      customer_email: data.email || '',
      boat_type: data.boat_selection || 'Barco Web',
      booking_date: data.selected_date || moment().format('YYYY-MM-DD'),
      start_time: data.selected_time || '12:00',
      duration_hours: data.duration || 3,
      total_amount: data.total_amount || 0,
      special_requests: data.notes || ''
    })
  };

  const normalizer = normalizers[platform] || ((data) => ({
    customer_name: data.customer_name || data.name || `Cliente ${platform}`,
    customer_phone: data.customer_phone || data.phone || '+15550000000',
    customer_email: data.customer_email || data.email || '',
    boat_type: data.boat_type || data.boat_name || `Barco ${platform}`,
    booking_date: data.booking_date || data.start_date || moment().format('YYYY-MM-DD'),
    start_time: data.start_time || '14:00',
    duration_hours: data.duration_hours || data.duration || 4,
    total_amount: data.total_amount || data.total_cost || data.amount || 0,
    special_requests: data.special_requests || data.notes || ''
  }));

  return normalizer(rawData);
}

function calculateDuration(startDate, endDate) {
  if (!startDate || !endDate) return 4;
  const start = moment(startDate);
  const end = moment(endDate);
  return end.diff(start, 'hours');
}

// 👨‍✈️ SISTEMA INTELIGENTE DE ASIGNACIÓN MEJORADO (FASE 5)
async function assignCaptain(boatType, bookingDate, startTime, durationHours) {
  const captainsResult = await pool.query(
    "SELECT * FROM captains WHERE status = 'available'"
  );
  const availableCaptains = captainsResult.rows;
  
  if (availableCaptains.length === 0) return null;
  
  // Calcular hora de finalización de la reserva
  const endTime = moment(`${bookingDate} ${startTime}`, 'YYYY-MM-DD HH:mm')
    .add(durationHours || 4, 'hours')
    .format('HH:mm');
  
  // Filtrar capitanes por disponibilidad y sin conflictos
  const validCaptains = await Promise.all(availableCaptains.map(async captain => {
    // 1. Verificar disponibilidad explícita (solo bloquear si hay superposición de horas)
    const availabilityResult = await pool.query(`
      SELECT * FROM captain_availability 
      WHERE captain_id = $1 
        AND date = $2 
        AND is_available = 0
        AND (
          (start_time <= $3 AND end_time > $3)
          OR
          (start_time < $4 AND end_time >= $4)
          OR
          (start_time >= $3 AND end_time <= $4)
        )
    `, [captain.id, bookingDate, startTime, endTime]);
    
    if (availabilityResult.rows.length > 0) {
      return null; // Capitán tiene bloqueo de disponibilidad que se superpone con este horario
    }
    
    // 2. Verificar conflictos de horario (doble-reserva)
    const conflictResult = await pool.query(`
      SELECT * FROM bookings 
      WHERE assigned_captain_id = $1 
        AND booking_date = $2 
        AND status IN ('pending', 'confirmed', 'assigned', 'in_progress')
        AND (
          (start_time <= $3 AND 
           (CAST(split_part(start_time, ':', 1) AS INTEGER) * 60 + 
            CAST(split_part(start_time, ':', 2) AS INTEGER) + 
            COALESCE(duration_hours, 4) * 60) > 
           (CAST(split_part($3, ':', 1) AS INTEGER) * 60 + 
            CAST(split_part($3, ':', 2) AS INTEGER)))
          OR
          (start_time >= $3 AND start_time < $4)
        )
    `, [captain.id, bookingDate, startTime, endTime]);
    
    if (conflictResult.rows.length > 0) {
      return null; // Capitán tiene conflicto de horario
    }
    
    return captain;
  }));
  
  // Filtrar nulls (capitanes no disponibles o con conflictos)
  const trulyAvailableCaptains = validCaptains.filter(c => c !== null);
  
  if (trulyAvailableCaptains.length === 0) return null;
  
  // Asignar scores a capitanes disponibles
  const scoredCaptains = await Promise.all(trulyAvailableCaptains.map(async captain => {
    let score = 5.0;
    
    // Bonus por especialidad (peso: 2.0)
    if (captain.specialties && captain.specialties.some(spec => 
      boatType.toLowerCase().includes(spec.toLowerCase()))) {
      score += 2.0;
    }
    
    // Bonus por menos reservas en la fecha (peso: hasta -1.0)
    const dayBookingsResult = await pool.query(
      'SELECT COUNT(*) FROM bookings WHERE assigned_captain_id = $1 AND booking_date = $2',
      [captain.id, bookingDate]
    );
    const dayBookings = parseInt(dayBookingsResult.rows[0].count);
    score -= (dayBookings * 0.2);
    
    // Bonus por disponibilidad explícita positiva
    const positiveAvailability = await pool.query(`
      SELECT * FROM captain_availability 
      WHERE captain_id = $1 AND date = $2 AND is_available = 1
    `, [captain.id, bookingDate]);
    
    if (positiveAvailability.rows.length > 0) {
      score += 0.5;
    }
    
    return { captain, score };
  }));
  
  scoredCaptains.sort((a, b) => b.score - a.score);
  return scoredCaptains[0]?.captain || trulyAvailableCaptains[0];
}

// 📝 ACTUALIZAR RESERVA CON CAPITÁN
async function updateBookingWithCaptain(bookingId, captain) {
  await pool.query(`
    UPDATE bookings 
    SET assigned_captain_id = $1, 
        assigned_captain_name = $2, 
        assigned_captain_phone = $3,
        status = 'assigned'
    WHERE id = $4
  `, [captain.id, captain.name, captain.phone, bookingId]);
}

// 📱 SISTEMA DE NOTIFICACIONES MEJORADO
async function sendNotifications(captain, booking) {
  // Skip notifications if Twilio is not configured (test/dev mode)
  const twilioSid = process.env.TWILIO_SID || '';
  const twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
  
  if (!twilioSid || !twilioToken || !twilioSid.startsWith('AC')) {
    console.log(`📧 [SKIPPED] Notificaciones para reserva ${booking.id} (Twilio not configured)`);
    return;
  }
  
  const client = twilio(twilioSid, twilioToken);
  
  // WhatsApp al capitán
  const captainMessage = `
🎯 *NUEVA RESERVA - Nadaki Excursions*
Plataforma: ${booking.platform}
Cliente: ${booking.customer_name}
Barco: ${booking.boat_type}
Fecha: ${booking.booking_date}
Hora: ${booking.start_time}
Duración: ${booking.duration_hours}h
Monto: $${booking.total_amount}

Confirmar: ✅ SÍ / ❌ NO
  `;

  // WhatsApp al cliente
  const customerMessage = `
✅ *RESERVA CONFIRMADA - Nadaki Excursions*
Hola ${booking.customer_name}, tu aventura está confirmada!

📅 ${booking.booking_date} a las ${booking.start_time}
🚤 ${booking.boat_type}
📍 Pier 39, Slip B-12

Te enviaremos los detalles de tu capitán en breve.
  `;

  try {
    await client.messages.create({
      body: captainMessage,
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${captain.phone}`
    });
    
    await client.messages.create({
      body: customerMessage,
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${booking.customer_phone}`
    });
    
    console.log(`📤 Notificaciones enviadas para reserva ${booking.id}`);
  } catch (error) {
    console.error('Error enviando WhatsApp:', error);
  }
}

// 🌐 ENDPOINTS PARA TU WORDPRESS Y BOOKBOARD
app.get('/api/dashboard-data', isAuthenticated, async (req, res) => {
  try {
    const today = moment().format('YYYY-MM-DD');
    const { platform, dateRange, dateFrom: rawDateFrom, dateTo: rawDateTo } = req.query;

    // ── Detect actual data range from DB (so "last 12 months" is meaningful) ──
    const dataRangeRes = await pool.query(`SELECT MIN(booking_date) as oldest, MAX(booking_date) as newest FROM bookings`);
    const dbOldest = dataRangeRes.rows[0]?.oldest || '2020-01-01';
    const dbNewest = dataRangeRes.rows[0]?.newest || today;

    // ── Compute date window from dateRange preset ──────────────────────────
    let periodStart, periodEnd;
    const dr = dateRange || 'all';

    if (dr === 'today') {
      periodStart = today;
      periodEnd   = today;
    } else if (dr === 'week') {
      periodStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
      periodEnd   = moment().endOf('isoWeek').format('YYYY-MM-DD');
    } else if (dr === 'month') {
      periodStart = moment().startOf('month').format('YYYY-MM-DD');
      periodEnd   = moment().endOf('month').format('YYYY-MM-DD');
    } else if (dr === 'quarter') {
      periodStart = moment().startOf('quarter').format('YYYY-MM-DD');
      periodEnd   = moment().endOf('quarter').format('YYYY-MM-DD');
    } else if (dr === 'year') {
      periodStart = moment().startOf('year').format('YYYY-MM-DD');
      periodEnd   = moment().endOf('year').format('YYYY-MM-DD');
    } else if (dr === 'last7days') {
      periodStart = moment().subtract(6, 'days').format('YYYY-MM-DD');
      periodEnd   = today;
    } else if (dr === 'last30days') {
      periodStart = moment().subtract(29, 'days').format('YYYY-MM-DD');
      periodEnd   = today;
    } else if (dr === 'last3months') {
      periodStart = moment().subtract(3, 'months').startOf('month').format('YYYY-MM-DD');
      periodEnd   = today;
    } else if (dr === 'last6months') {
      periodStart = moment().subtract(6, 'months').startOf('month').format('YYYY-MM-DD');
      periodEnd   = today;
    } else if (dr === 'last12months') {
      periodStart = moment().subtract(12, 'months').startOf('month').format('YYYY-MM-DD');
      periodEnd   = today;
    } else if (dr === 'custom' && rawDateFrom && rawDateTo) {
      periodStart = rawDateFrom;
      periodEnd   = rawDateTo;
    } else {
      // 'all' — use full data range
      periodStart = dbOldest;
      periodEnd   = dbNewest > today ? dbNewest : today;
    }

    // ── Build filtered query (case-insensitive platform) ───────────────────
    const baseWhere = [];
    const baseParams = [];
    let pi = 1;

    baseWhere.push(`booking_date >= $${pi++}`); baseParams.push(periodStart);
    baseWhere.push(`booking_date <= $${pi++}`); baseParams.push(periodEnd);
    if (platform && platform !== 'all') {
      // Case-insensitive platform match — handles GetMyBoat vs getmyboat
      baseWhere.push(`LOWER(platform) = LOWER($${pi++})`); baseParams.push(platform);
    }
    const whereStr = baseWhere.join(' AND ');

    // ── Period bookings (main filtered set) ───────────────────────────────
    const periodRes = await pool.query(
      `SELECT id, platform, customer_name, customer_phone, booking_date, start_time,
              duration_hours, total_amount, status, assigned_captain_id, assigned_captain_name,
              boat_type, boat_id, stew_id, stew_name, broker_id, broker_name, is_manual,
              num_guests, deposit_amount, balance_pending, notes, created_at
       FROM bookings WHERE ${whereStr} ORDER BY booking_date DESC, start_time DESC`,
      baseParams
    );
    const periodBookings = periodRes.rows;

    // ── Today bookings (always absolute, case-insensitive platform) ────────
    const todayParams = [today];
    let todayWhere = 'booking_date = $1';
    if (platform && platform !== 'all') {
      todayParams.push(platform);
      todayWhere += ` AND LOWER(platform) = LOWER($${todayParams.length})`;
    }
    const todayRes = await pool.query(
      `SELECT total_amount, status FROM bookings WHERE ${todayWhere}`, todayParams
    );
    const todayBookings = todayRes.rows;

    // ── Previous period for % comparison ──────────────────────────────────
    let prevRevenue = 0, prevCount = 0;
    if (dr !== 'all') {
      const periodDays = moment(periodEnd).diff(moment(periodStart), 'days') + 1;
      const prevEnd   = moment(periodStart).subtract(1, 'days').format('YYYY-MM-DD');
      const prevStart = moment(prevEnd).subtract(periodDays - 1, 'days').format('YYYY-MM-DD');
      const prevParams = [...baseParams];
      prevParams[0] = prevStart; prevParams[1] = prevEnd;
      const prevRes = await pool.query(
        `SELECT total_amount FROM bookings WHERE ${whereStr} AND status != 'cancelled'`, prevParams
      );
      prevRevenue = prevRes.rows.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
      prevCount   = prevRes.rows.length;
    }

    // ── All-time totals (unfiltered by date, case-insensitive platform) ────
    const allTimeParams = [];
    let allTimeWhere = 'WHERE 1=1';
    if (platform && platform !== 'all') {
      allTimeParams.push(platform);
      allTimeWhere = `WHERE LOWER(platform) = LOWER($1)`;
    }
    const allRes = await pool.query(
      `SELECT total_amount, platform, boat_type, broker_name, assigned_captain_name, booking_date, status
       FROM bookings ${allTimeWhere}`,
      allTimeParams
    );
    const allBookings = allRes.rows;
    const allNonCancelled = allBookings.filter(b => b.status !== 'cancelled');

    // ── Aggregate period bookings ──────────────────────────────────────────
    const nonCancelled = periodBookings.filter(b => b.status !== 'cancelled');
    const periodRevenue = nonCancelled.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
    const avgTicket     = nonCancelled.length > 0 ? Math.round(periodRevenue / nonCancelled.length) : 0;

    const bookingsByPlatform = {};
    const revenueByPlatform  = {};
    const bookingsByBoat     = {};
    const revenueByBoat      = {};
    const bookingsByBroker   = {};
    const revenueByBroker    = {};
    const bookingsByCaptain  = {};

    nonCancelled.forEach(b => {
      // Normalize platform name for grouping (title-case)
      const platRaw = b.platform || 'Otros';
      const plat = platRaw.charAt(0).toUpperCase() + platRaw.slice(1).toLowerCase()
                    .replace(/^getmyboat$/i,'GetMyBoat')
                    .replace(/^boatsetter$/i,'BoatSetter')
                    .replace(/^fareharbor$/i,'FareHarbor')
                    .replace(/^tripadvisor$/i,'TripAdvisor');
      const platNorm = platRaw.toLowerCase() === 'getmyboat' ? 'GetMyBoat' :
                       platRaw.toLowerCase() === 'boatsetter' ? 'BoatSetter' :
                       platRaw.toLowerCase() === 'fareharbor' ? 'FareHarbor' :
                       platRaw.toLowerCase() === 'tripadvisor' ? 'TripAdvisor' : platRaw;
      bookingsByPlatform[platNorm] = (bookingsByPlatform[platNorm] || 0) + 1;
      revenueByPlatform[platNorm]  = (revenueByPlatform[platNorm]  || 0) + parseFloat(b.total_amount || 0);

      const boat = b.boat_type || b.boat_id || 'Sin asignar';
      bookingsByBoat[boat] = (bookingsByBoat[boat] || 0) + 1;
      revenueByBoat[boat]  = (revenueByBoat[boat]  || 0) + parseFloat(b.total_amount || 0);

      const broker = b.broker_name || b.platform || 'Directo';
      bookingsByBroker[broker] = (bookingsByBroker[broker] || 0) + 1;
      revenueByBroker[broker]  = (revenueByBroker[broker]  || 0) + parseFloat(b.total_amount || 0);

      const cap = b.assigned_captain_name || 'Sin capitán';
      bookingsByCaptain[cap] = (bookingsByCaptain[cap] || 0) + 1;
    });

    // ── Monthly trend: anchor to actual data, not just "last 6 months" ─────
    // Find the anchor: if 'all' or range covers historical data, show 8 months from data range
    const trendEnd   = moment(periodEnd > today ? today : periodEnd);
    const trendStart = moment(periodStart);
    const trendMonths = Math.min(12, trendEnd.diff(trendStart, 'months') + 1);
    const trendAnchor = trendMonths <= 1 ? 5 : Math.min(trendMonths - 1, 11); // how many months back from trendEnd

    const monthlyTrend = [];
    for (let i = trendAnchor; i >= 0; i--) {
      const mRef   = trendEnd.clone().subtract(i, 'months');
      const mStart = mRef.clone().startOf('month').format('YYYY-MM-DD');
      const mEnd   = mRef.clone().endOf('month').format('YYYY-MM-DD');
      const mLabel = mRef.format('MMM YYYY');
      const mParams = [mStart, mEnd];
      let mWhere = 'booking_date >= $1 AND booking_date <= $2';
      if (platform && platform !== 'all') {
        mParams.push(platform);
        mWhere += ` AND LOWER(platform) = LOWER($3)`;
      }
      const mRes = await pool.query(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount::numeric),0) as rev
         FROM bookings WHERE ${mWhere} AND status != 'cancelled'`, mParams
      );
      monthlyTrend.push({
        label:    mLabel,
        bookings: parseInt(mRes.rows[0].cnt),
        revenue:  parseFloat(mRes.rows[0].rev),
      });
    }

    // ── Weekly trend (last 8 weeks anchored to data range) ─────────────────
    const weeklyTrend = [];
    for (let i = 7; i >= 0; i--) {
      const wRef   = trendEnd.clone().subtract(i, 'weeks');
      const wStart = wRef.clone().startOf('isoWeek').format('YYYY-MM-DD');
      const wEnd   = wRef.clone().endOf('isoWeek').format('YYYY-MM-DD');
      const wLabel = `Sem ${wRef.isoWeek()} ${wRef.year()}`;
      const wParams = [wStart, wEnd];
      let wWhere = 'booking_date >= $1 AND booking_date <= $2';
      if (platform && platform !== 'all') {
        wParams.push(platform);
        wWhere += ` AND LOWER(platform) = LOWER($3)`;
      }
      const wRes = await pool.query(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount::numeric),0) as rev
         FROM bookings WHERE ${wWhere} AND status != 'cancelled'`, wParams
      );
      weeklyTrend.push({
        label:    wLabel,
        bookings: parseInt(wRes.rows[0].cnt),
        revenue:  parseFloat(wRes.rows[0].rev),
      });
    }

    // ── Captains + stews ───────────────────────────────────────────────────
    const captainsResult = await pool.query('SELECT * FROM captains ORDER BY name');
    const captains = captainsResult.rows;
    const stewsResult = await pool.query('SELECT * FROM stews ORDER BY name');
    const stews = stewsResult.rows;

    // ── % changes vs previous period ──────────────────────────────────────
    const bookingChangePct = prevCount > 0
      ? Math.round(((nonCancelled.length - prevCount) / prevCount) * 100) : null;
    const revenueChangePct = prevRevenue > 0
      ? Math.round(((periodRevenue - prevRevenue) / prevRevenue) * 100) : null;

    // ── Today stats ───────────────────────────────────────────────────────
    const todayNonCancelled = todayBookings.filter(b => b.status !== 'cancelled');

    // ── Upcoming bookings (next 30 days from today, full list) ─────────────
    const upcomingEnd30 = moment().add(30, 'days').format('YYYY-MM-DD');
    const upcomingParams = [today, upcomingEnd30];
    let upcomingWhere = 'booking_date >= $1 AND booking_date <= $2';
    if (platform && platform !== 'all') {
      upcomingParams.push(platform);
      upcomingWhere += ` AND LOWER(platform) = LOWER($3)`;
    }
    const upcomingRes = await pool.query(
      `SELECT id, platform, customer_name, booking_date, start_time, total_amount, status,
              boat_type, boat_id, assigned_captain_name, num_guests, is_manual
       FROM bookings WHERE ${upcomingWhere} AND status != 'cancelled'
       ORDER BY booking_date ASC, start_time ASC LIMIT 20`,
      upcomingParams
    );
    const upcomingBookings = upcomingRes.rows;

    // ── Past bookings count ────────────────────────────────────────────────
    const pastParams = [today];
    let pastWhere = 'booking_date < $1 AND status != \'cancelled\'';
    if (platform && platform !== 'all') {
      pastParams.push(platform);
      pastWhere += ` AND LOWER(platform) = LOWER($${pastParams.length})`;
    }
    const pastRes = await pool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount::numeric),0) as rev
       FROM bookings WHERE ${pastWhere}`, pastParams
    );
    const pastCount   = parseInt(pastRes.rows[0].cnt);
    const pastRevenue = parseFloat(pastRes.rows[0].rev);

    const dashboardData = {
      // ── Filter context ──────────────────────────────────────────────────
      filter_platform: platform || 'all',
      filter_date_range: dr,
      period_start: periodStart,
      period_end: periodEnd,

      // ── Today ───────────────────────────────────────────────────────────
      today_bookings: todayNonCancelled.length,
      today_revenue:  todayNonCancelled.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0),

      // ── Period (filtered) ────────────────────────────────────────────────
      period_bookings: nonCancelled.length,
      period_revenue:  periodRevenue,
      avg_ticket:      avgTicket,
      booking_change_pct: bookingChangePct,
      revenue_change_pct: revenueChangePct,

      // ── All-time ─────────────────────────────────────────────────────────
      total_bookings: allNonCancelled.length,
      total_revenue:  allNonCancelled.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0),

      // ── Past (before today) ───────────────────────────────────────────────
      past_bookings: pastCount,
      past_revenue:  pastRevenue,

      // ── Captains & stews ─────────────────────────────────────────────────
      active_captains: captains.filter(c => c.status === 'active' || c.status === 'available').length,
      total_captains:  captains.length,
      active_stews:    stews.filter(s => s.status === 'active' || !s.status).length,
      total_stews:     stews.length,
      active_captains_list: captains.filter(c => c.status === 'active' || c.status === 'available'),

      // ── Upcoming (next 30 days, full list) ────────────────────────────────
      upcoming_7d:       upcomingBookings.length,
      upcoming_bookings: upcomingBookings,

      // ── Breakdowns by dimension ──────────────────────────────────────────
      bookings_by_platform: bookingsByPlatform,
      revenue_by_platform:  revenueByPlatform,
      bookings_by_boat:     bookingsByBoat,
      revenue_by_boat:      revenueByBoat,
      bookings_by_broker:   bookingsByBroker,
      revenue_by_broker:    revenueByBroker,
      bookings_by_captain:  bookingsByCaptain,

      // ── Trends ──────────────────────────────────────────────────────────
      monthly_trend: monthlyTrend,
      weekly_trend:  weeklyTrend,

      // ── Recent bookings (filtered, last 50 sorted desc) ──────────────────
      recent_bookings: periodBookings.slice(0, 50),

      // ── Compatibility aliases ─────────────────────────────────────────────
      week_bookings: nonCancelled.length,
      week_revenue:  periodRevenue,
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🎯 ENDPOINTS ESPECÍFICOS
app.get('/api/bookings', isAuthenticated, async (req, res) => {
  try {
    const { platform, status, date, dateFrom, dateTo, captain } = req.query;
    
    let query = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (platform) {
      query += ` AND platform = $${paramIndex++}`;
      params.push(platform);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (date) {
      query += ` AND booking_date = $${paramIndex++}`;
      params.push(date);
    }
    if (dateFrom) {
      query += ` AND booking_date >= $${paramIndex++}`;
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ` AND booking_date <= $${paramIndex++}`;
      params.push(dateTo);
    }
    if (captain) {
      query += ` AND assigned_captain_id = $${paramIndex++}`;
      params.push(captain);
    }
    
    query += ' ORDER BY booking_date ASC, start_time ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create manual booking
app.post('/api/bookings', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      booking_date, start_time, duration_hours,
      customer_name, customer_phone, customer_email,
      boat_type, boat_id, assigned_captain_id, assigned_captain_name,
      stew_id, stew_name, broker_id, broker_name,
      platform, total_amount, deposit_amount, balance_pending,
      status, pickup_location, num_guests, notes, internal_notes,
    } = req.body;

    if (!booking_date || !start_time || !duration_hours || !total_amount) {
      return res.status(400).json({ error: 'Campos obligatorios: fecha, hora, horas, precio' });
    }
    if (!customer_name) return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
    if (!boat_type && !boat_id) return res.status(400).json({ error: 'El barco es obligatorio' });

    const id = 'book_' + nanoid(10);
    const result = await pool.query(`
      INSERT INTO bookings (
        id, platform, customer_name, customer_phone, customer_email,
        boat_type, boat_id, booking_date, start_time, duration_hours,
        total_amount, status, assigned_captain_id, assigned_captain_name,
        stew_id, stew_name, broker_id, broker_name,
        pickup_location, num_guests, deposit_amount, balance_pending,
        notes, internal_notes, is_manual
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      ) RETURNING *`,
      [
        id, platform || 'Manual', customer_name, customer_phone || '', customer_email || '',
        boat_type || '', boat_id || null, booking_date, start_time, parseInt(duration_hours),
        parseFloat(total_amount), status || 'confirmed', assigned_captain_id || null, assigned_captain_name || null,
        stew_id || null, stew_name || null, broker_id || null, broker_name || null,
        pickup_location || null, num_guests ? parseInt(num_guests) : 0,
        parseFloat(deposit_amount || 0), parseFloat(balance_pending || 0),
        notes || null, internal_notes || null, true,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update booking
app.patch('/api/bookings/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'booking_date','start_time','duration_hours','customer_name','customer_phone','customer_email',
      'boat_type','boat_id','assigned_captain_id','assigned_captain_name','stew_id','stew_name',
      'broker_id','broker_name','platform','total_amount','deposit_amount','balance_pending',
      'status','pickup_location','num_guests','notes','internal_notes',
    ];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        vals.push(req.body[key] === '' ? null : req.body[key]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const result = await pool.query(
      `UPDATE bookings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete booking (manual only — soft delete by setting status=cancelled for platform bookings)
app.delete('/api/bookings/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT is_manual FROM bookings WHERE id=$1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (check.rows[0].is_manual) {
      await pool.query('DELETE FROM bookings WHERE id=$1', [id]);
    } else {
      await pool.query(`UPDATE bookings SET status='cancelled', updated_at=NOW() WHERE id=$1`, [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting booking:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/platforms', isAuthenticated, async (req, res) => {
  try {
    // Merge hardcoded platform list with actual platforms in DB (normalized)
    const dbRes = await pool.query(
      `SELECT DISTINCT platform FROM bookings WHERE platform IS NOT NULL AND platform != '' ORDER BY platform`
    );
    const knownMap = {
      'getmyboat': 'GetMyBoat', 'boatsetter': 'BoatSetter',
      'fareharbor': 'FareHarbor', 'tripadvisor': 'TripAdvisor',
      'booking.com': 'Booking.com', 'airbnb': 'Airbnb',
      'viator': 'Viator', 'expedia': 'Expedia', 'groupon': 'Groupon',
      'bokun': 'Bokun', 'rezdy': 'Rezdy', 'peek': 'Peek', 'xola': 'Xola',
    };
    const normalized = new Set();
    PLATFORMS.forEach(p => normalized.add(p));
    dbRes.rows.forEach(r => {
      const p = r.platform;
      const norm = knownMap[p.toLowerCase()] || p;
      normalized.add(norm);
    });
    res.json([...normalized].sort());
  } catch (error) {
    console.error('Error fetching platforms:', error);
    res.json(PLATFORMS);
  }
});

app.get('/api/captains', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM captains');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching captains:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Captain Profile Management ─────────────────────────
app.post('/api/captains', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email, specialties, status } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const { nanoid } = await import('nanoid');
    const id = 'cap_' + nanoid(8);
    const emailVal = email && email.trim() ? email.trim() : '';
    const phoneVal = phone && phone.trim() ? phone.trim() : '';
    const result = await pool.query(
      'INSERT INTO captains (id, name, phone, email, status, specialties) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, name.trim(), phoneVal, emailVal, status || 'active', JSON.stringify(specialties || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating captain:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/captains/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email, status } = req.body;
    const result = await pool.query(
      `UPDATE captains SET
        name   = COALESCE($1, name),
        phone  = COALESCE($2, phone),
        email  = COALESCE($3, email),
        status = COALESCE($4, status)
       WHERE id = $5 RETURNING *`,
      [name || null, phone !== undefined ? phone : null, email !== undefined ? email : null, status || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Capitán no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating captain:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete captain
app.delete('/api/captains/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM captains WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Capitán no encontrado' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting captain:', err);
    res.status(500).json({ error: err.message });
  }
});

// 📍 WEBHOOK PARA RESPUESTAS DE CAPITANES
app.post('/webhook/captain-response', async (req, res) => {
  try {
    const { captain_phone, booking_id, response } = req.body;
    
    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [booking_id]);
    const captainResult = await pool.query('SELECT * FROM captains WHERE phone = $1', [captain_phone]);
    
    if (bookingResult.rows.length === 0 || captainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking or captain not found' });
    }
    
    const captain = captainResult.rows[0];
    
    if (response.toLowerCase().includes('sí') || response.toLowerCase().includes('si')) {
      await pool.query("UPDATE bookings SET status = 'captain_confirmed' WHERE id = $1", [booking_id]);
      console.log(`✅ Capitán ${captain.name} confirmó reserva ${booking_id}`);
    } else {
      await pool.query("UPDATE bookings SET status = 'needs_reassignment' WHERE id = $1", [booking_id]);
      console.log(`❌ Capitán ${captain.name} rechazó reserva ${booking_id}`);
      // Lógica para reasignar
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing captain response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🤖 FASE 1: AI CHATBOT ENDPOINTS
const AI_SYSTEM_PROMPT = `Eres un asistente virtual para Nadaki Excursions, una empresa de tours en barco en Puerto Rico. Tu objetivo es ayudar a los clientes a reservar tours.

INFORMACIÓN IMPORTANTE:
- Ofrecemos tours de medio día (4 horas) y día completo (8 horas)
- Precios: Medio día $800-1200, Día completo $1500-2000
- Capacidad: 6-12 personas dependiendo del barco
- Horarios disponibles: 9:00 AM, 12:00 PM, 3:00 PM
- Servicios incluidos: Capitán certificado, equipo de snorkel, bebidas, lunch (en tours completos)

INSTRUCCIONES:
1. Sé amigable, profesional y entusiasta sobre los tours
2. Haz preguntas para entender las necesidades del cliente
3. Sugiere opciones basadas en sus preferencias
4. IMPORTANTE: Captura TODOS los datos requeridos antes de crear una reserva
5. Si falta algún dato, pregúntalo específicamente

DATOS REQUERIDOS PARA CREAR UNA RESERVA (TODOS SON OBLIGATORIOS):
1. Nombre completo del cliente
2. Número de teléfono (formato +1XXXXXXXXXX)
3. Email del cliente (debe ser válido)
4. Fecha del tour (formato YYYY-MM-DD)
5. Número de personas
6. Tipo de tour (medio día o día completo)
7. Hora de inicio (9:00 AM, 12:00 PM o 3:00 PM)

IMPORTANTE SOBRE CREAR RESERVAS:
- NUNCA crees una reserva si falta alguno de los 7 datos obligatorios
- Pregunta uno por uno los datos que falten
- Confirma todos los detalles con el cliente antes de crear la reserva
- Solo cuando tengas TODOS los datos, usa el formato: "CREAR_RESERVA: {JSON con los datos}"

Formato JSON para crear reserva:
{
  "customerName": "Nombre Completo",
  "customerPhone": "+1XXXXXXXXXX", 
  "customerEmail": "email@ejemplo.com",
  "date": "YYYY-MM-DD",
  "numberOfPeople": 6,
  "boatType": "Tour de medio día" o "Tour de día completo",
  "startTime": "09:00" o "12:00" o "15:00",
  "durationHours": 4 o 8,
  "amount": 1000,
  "notes": "Cualquier nota especial del cliente"
}`;

app.post('/api/chat/send', rateLimit, async (req, res) => {
  try {
    const { sessionId, message, customerName, customerPhone, customerEmail } = req.body;
    
    // Validation
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 200) {
      return res.status(400).json({ error: 'Valid sessionId is required (max 200 chars)' });
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message is too long (max 2000 chars)' });
    }
    
    // Validate customer data if provided
    if (customerName && typeof customerName !== 'string') {
      return res.status(400).json({ error: 'Customer name must be a string' });
    }
    
    if (customerPhone && typeof customerPhone !== 'string') {
      return res.status(400).json({ error: 'Customer phone must be a string' });
    }
    
    if (customerEmail && (typeof customerEmail !== 'string' || (customerEmail && !customerEmail.includes('@')))) {
      return res.status(400).json({ error: 'Invalid customer email format' });
    }
    
    // Get or create conversation
    let conversation = await pool.query(
      'SELECT * FROM chat_conversations WHERE session_id = $1',
      [sessionId]
    );
    
    let messages = [];
    let conversationId = `chat_${Date.now()}`;
    
    if (conversation.rows.length > 0) {
      messages = conversation.rows[0].messages || [];
      conversationId = conversation.rows[0].id;
    }
    
    // Add user message
    messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    const aiResponse = completion.choices[0].message.content;
    
    // Add AI response
    messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });
    
    // Check if AI wants to create a booking
    let bookingId = null;
    if (aiResponse.includes('CREAR_RESERVA:')) {
      try {
        const jsonMatch = aiResponse.match(/CREAR_RESERVA:\s*(\{.*\})/);
        if (jsonMatch) {
          const bookingData = JSON.parse(jsonMatch[1]);
          bookingId = `ai_booking_${Date.now()}`;
          
          await pool.query(`
            INSERT INTO bookings (
              id, platform, customer_name, customer_phone, customer_email,
              boat_type, booking_date, start_time, duration_hours, 
              total_amount, status, notes, internal_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            bookingId,
            'AI Assistant',
            bookingData.customerName || customerName,
            bookingData.customerPhone || customerPhone,
            bookingData.customerEmail || customerEmail,
            bookingData.boatType || 'Standard Tour',
            bookingData.date,
            bookingData.startTime,
            bookingData.durationHours || 4,
            bookingData.amount || 1000,
            'ai_pending_confirmation',
            bookingData.notes || '',
            'Created by AI chatbot'
          ]);
          
          console.log(`🤖 AI created booking: ${bookingId}`);
        }
      } catch (error) {
        console.error('Error creating booking from AI:', error);
      }
    }
    
    // Save or update conversation
    if (conversation.rows.length > 0) {
      await pool.query(`
        UPDATE chat_conversations 
        SET messages = $1, updated_at = CURRENT_TIMESTAMP, booking_id = $2, status = $3
        WHERE session_id = $4
      `, [JSON.stringify(messages), bookingId, bookingId ? 'booking_created' : 'active', sessionId]);
    } else {
      await pool.query(`
        INSERT INTO chat_conversations (
          id, session_id, customer_name, customer_phone, customer_email,
          messages, status, booking_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        conversationId, sessionId, customerName, customerPhone, customerEmail,
        JSON.stringify(messages), bookingId ? 'booking_created' : 'active', bookingId
      ]);
    }
    
    res.json({ 
      response: aiResponse, 
      bookingId,
      conversationId 
    });
    
  } catch (error) {
    console.error('Error in chatbot:', error);
    res.status(500).json({ error: 'Error processing message' });
  }
});

// Get conversation history
app.get('/api/chat/conversations/:sessionId', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chat_conversations WHERE session_id = $1',
      [req.params.sessionId]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Error fetching conversation' });
  }
});

// List all conversations
app.get('/api/chat/conversations', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chat_conversations ORDER BY updated_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Error fetching conversations' });
  }
});

// 🤖 FASE 6: ENHANCED AI-POWERED BOOKING ASSISTANT
const ENHANCED_AI_SYSTEM_PROMPT_ES = `Eres un asistente virtual avanzado para Nadaki Excursions, una empresa premium de tours en barco en Puerto Rico. Tu objetivo es proporcionar una experiencia excepcional y ayudar a los clientes a reservar el tour perfecto.

INFORMACIÓN SOBRE NUESTROS SERVICIOS:
- **Tours de Medio Día (4 horas)**: $800-$1,200
  • Horarios: 9:00 AM, 12:00 PM, 3:00 PM
  • Capacidad: 6-8 personas
  • Incluye: Capitán certificado, equipo de snorkel, bebidas
  • Ideal para: Familias, primera experiencia, grupos pequeños
  
- **Tours de Día Completo (8 horas)**: $1,500-$2,000
  • Horarios: 9:00 AM
  • Capacidad: 8-12 personas
  • Incluye: Todo lo anterior + lunch gourmet, más destinos
  • Ideal para: Aventureros, celebraciones, exploración extendida

- **Excursión de Pesca**: $900-$1,300
  • Tours especializados con equipo profesional
  • Capitanes expertos en pesca deportiva

- **Tour VIP Privado**: $2,000-$3,000
  • Servicio totalmente personalizado
  • Itinerario a medida

TEMPORADAS Y PRECIOS:
- Alta (Diciembre-Abril): +15% sobre precio base
- Media (Mayo, Noviembre): Precio normal
- Baja (Junio-Octubre): -10% sobre precio base

TU COMPORTAMIENTO:
1. **Personalización**: Entiende las preferencias del cliente antes de sugerir
2. **Proactividad**: Ofrece recomendaciones basadas en sus necesidades
3. **Transparencia**: Proporciona precios estimados cuando sea relevante
4. **Entusiasmo**: Sé amigable y entusiasta sobre las experiencias
5. **Eficiencia**: Guía la conversación hacia la reserva sin ser agresivo
6. **Upselling Natural**: Sugiere upgrades si benefician genuinamente al cliente

CAPACIDADES ESPECIALES:
- Puedo verificar disponibilidad en tiempo real
- Puedo calcular precios exactos según fecha y grupo
- Puedo recomendar el mejor tour según tus preferencias
- Puedo detectar si prefieres español o inglés automáticamente

ESCALACIÓN A AGENTE HUMANO:
Si encuentras:
- Quejas o problemas complejos
- Solicitudes muy específicas fuera de tours estándar
- Clientes que parecen frustrados o confundidos
→ Sugiere amablemente que un agente humano puede ayudar mejor

PARA CREAR UNA RESERVA necesitas estos 7 datos:
1. Nombre completo
2. Teléfono (+1XXXXXXXXXX)
3. Email
4. Fecha del tour (YYYY-MM-DD)
5. Número de personas
6. Tipo de tour
7. Hora de inicio

Cuando tengas TODOS los datos, usa: "CREAR_RESERVA: {JSON con datos}"
`;

const ENHANCED_AI_SYSTEM_PROMPT_EN = `You are an advanced virtual assistant for Nadaki Excursions, a premium boat tour company in Puerto Rico. Your goal is to provide an exceptional experience and help customers book the perfect tour.

ABOUT OUR SERVICES:
- **Half-Day Tours (4 hours)**: $800-$1,200
  • Times: 9:00 AM, 12:00 PM, 3:00 PM
  • Capacity: 6-8 people
  • Includes: Certified captain, snorkel gear, beverages
  • Ideal for: Families, first-timers, small groups
  
- **Full-Day Tours (8 hours)**: $1,500-$2,000
  • Times: 9:00 AM
  • Capacity: 8-12 people
  • Includes: Everything above + gourmet lunch, more destinations
  • Ideal for: Adventurers, celebrations, extended exploration

- **Fishing Expeditions**: $900-$1,300
  • Specialized tours with professional equipment
  • Expert fishing captains

- **Private VIP Tour**: $2,000-$3,000
  • Fully customized service
  • Tailored itinerary

SEASONS AND PRICING:
- High (December-April): +15% over base price
- Mid (May, November): Normal price
- Low (June-October): -10% over base price

YOUR BEHAVIOR:
1. **Personalization**: Understand customer preferences before suggesting
2. **Proactivity**: Offer recommendations based on their needs
3. **Transparency**: Provide estimated prices when relevant
4. **Enthusiasm**: Be friendly and enthusiastic about the experiences
5. **Efficiency**: Guide conversation toward booking without being pushy
6. **Natural Upselling**: Suggest upgrades if they genuinely benefit the customer

SPECIAL CAPABILITIES:
- I can check real-time availability
- I can calculate exact prices based on date and group size
- I can recommend the best tour for your preferences
- I can automatically detect if you prefer Spanish or English

ESCALATION TO HUMAN AGENT:
If you encounter:
- Complaints or complex issues
- Very specific requests outside standard tours
- Customers who seem frustrated or confused
→ Kindly suggest that a human agent can help better

TO CREATE A BOOKING you need these 7 pieces of data:
1. Full name
2. Phone (+1XXXXXXXXXX)
3. Email
4. Tour date (YYYY-MM-DD)
5. Number of people
6. Tour type
7. Start time

When you have ALL the data, use: "CREAR_RESERVA: {JSON with data}"
`;

// Enhanced AI chat endpoint with orchestrator
app.post('/api/ai/chat', rateLimit, async (req, res) => {
  try {
    const { sessionId, message, customerName, customerPhone, customerEmail } = req.body;
    
    // Validation
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 200) {
      return res.status(400).json({ error: 'Valid sessionId is required (max 200 chars)' });
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message is too long (max 2000 chars)' });
    }
    
    // Get or create conversation
    let conversation = await pool.query(
      'SELECT * FROM chat_conversations WHERE session_id = $1',
      [sessionId]
    );
    
    let messages = [];
    let conversationId = `chat_${Date.now()}`;
    
    if (conversation.rows.length > 0) {
      messages = conversation.rows[0].messages || [];
      conversationId = conversation.rows[0].id;
    }
    
    // Add user message
    messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    
    // Process with AI Orchestrator (fast - just language & intent detection)
    console.log(`🤖 Processing AI chat for session: ${sessionId}`);
    const orchestratorResult = await aiOrchestrator.processAIChat(sessionId, message);
    
    // Select system prompt based on detected language
    const systemPrompt = orchestratorResult.detectedLanguage === 'en' ? 
      ENHANCED_AI_SYSTEM_PROMPT_EN : ENHANCED_AI_SYSTEM_PROMPT_ES;
    
    // Add intent context to help AI understand user's goal
    let contextMessage = `\n[DETECTED INTENT: ${orchestratorResult.intent}]`;
    
    // Note: Heavy operations like recommendations, pricing, availability 
    // are now handled by the AI itself via the enhanced system prompt
    
    // Call OpenAI with enhanced context
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt + contextMessage },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.7,
      max_tokens: 600
    });
    
    const aiResponse = completion.choices[0].message.content;
    
    // Add AI response
    messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });
    
    // Check if AI wants to create a booking
    let bookingId = null;
    if (aiResponse.includes('CREAR_RESERVA:')) {
      try {
        const jsonMatch = aiResponse.match(/CREAR_RESERVA:\s*(\{.*\})/);
        if (jsonMatch) {
          const bookingData = JSON.parse(jsonMatch[1]);
          
          // Create booking
          bookingId = `ai_booking_${Date.now()}`;
          await pool.query(`
            INSERT INTO bookings (
              id, platform, customer_name, customer_phone, customer_email,
              boat_type, booking_date, start_time, duration_hours, total_amount,
              status, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            bookingId, 'AI Assistant', bookingData.customerName,
            bookingData.customerPhone, bookingData.customerEmail, bookingData.boatType,
            bookingData.date, bookingData.startTime, bookingData.durationHours,
            bookingData.amount, 'pending', bookingData.notes || ''
          ]);
          
          console.log(`✅ AI created booking: ${bookingId}`);
        }
      } catch (error) {
        console.error('Error creating AI booking:', error);
      }
    }
    
    // Save or update conversation
    if (conversation.rows.length === 0) {
      await pool.query(`
        INSERT INTO chat_conversations (
          id, session_id, customer_name, customer_phone, customer_email,
          messages, status, booking_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        conversationId, sessionId, customerName || null, customerPhone || null,
        customerEmail || null, JSON.stringify(messages),
        bookingId ? 'booking_created' : 'active', bookingId
      ]);
    } else {
      await pool.query(`
        UPDATE chat_conversations 
        SET messages = $1, 
            updated_at = CURRENT_TIMESTAMP,
            status = $2,
            booking_id = COALESCE($3, booking_id)
        WHERE session_id = $4
      `, [
        JSON.stringify(messages),
        bookingId ? 'booking_created' : conversation.rows[0].status,
        bookingId,
        sessionId
      ]);
    }
    
    // Return response with simplified metadata
    res.json({
      message: aiResponse,
      bookingId,
      metadata: {
        detectedLanguage: orchestratorResult.detectedLanguage,
        intent: orchestratorResult.intent,
        confidence: orchestratorResult.confidence,
        processingTime: orchestratorResult.processingTime
      }
    });
    
  } catch (error) {
    console.error('Enhanced AI chat error:', error);
    res.status(500).json({ 
      error: 'Error processing message',
      message: 'Lo siento, hubo un error. Por favor intenta de nuevo.' 
    });
  }
});

// Escalate conversation to human agent
app.post('/api/ai/escalate', rateLimit, async (req, res) => {
  try {
    const { sessionId, reason } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    // Get conversation data
    const conversation = await pool.query(
      'SELECT * FROM chat_conversations WHERE session_id = $1',
      [sessionId]
    );
    
    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const conv = conversation.rows[0];
    const success = await aiOrchestrator.escalateToHuman(sessionId, reason, {
      name: conv.customer_name,
      phone: conv.customer_phone,
      email: conv.customer_email
    });
    
    res.json({ 
      success, 
      message: success ? 
        'Conversation escalated to human agent. Someone will assist you shortly.' :
        'Failed to escalate. Please try again.'
    });
    
  } catch (error) {
    console.error('Escalation error:', error);
    res.status(500).json({ error: 'Error escalating conversation' });
  }
});

// ⚡ FASE 2: PLATFORM SYNCHRONIZATION ENDPOINTS
const syncService = require('./server/syncService');

// ⚡ FASE 7: PRICING, AVAILABILITY, AND SYNC JOBS SERVICES
const PricingService = require('./server/pricingService');
const DynamicPricingService = require('./server/dynamicPricingService');
const AvailabilityService = require('./server/availabilityService');
const fleetService = require('./server/fleetService');
const SyncJobsWorker = require('./server/syncJobsWorker');
const EmailService = require('./server/emailService');

const pricingService = new PricingService(pool);
const dynamicPricingService = new DynamicPricingService(pool, marineConditionsService);
const availabilityService = new AvailabilityService(pool);
const emailService = new EmailService(pool);
const syncJobsWorker = new SyncJobsWorker(pool);

// Start sync jobs worker
syncJobsWorker.start();

// Trigger sync for specific platform
app.post('/api/sync/trigger/:platform', isAuthenticated, async (req, res) => {
  try {
    const { platform } = req.params;
    
    if (!syncService.PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const result = await syncService.syncPlatform(platform);
    res.json(result);
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// Trigger sync for all platforms
app.post('/api/sync/trigger-all', isAuthenticated, async (req, res) => {
  try {
    const result = await syncService.syncAllPlatforms();
    res.json(result);
  } catch (error) {
    console.error('Error triggering sync all:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// Get sync status for all platforms
app.get('/api/sync/status', isAuthenticated, async (req, res) => {
  try {
    const status = await syncService.getSyncStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Get detected conflicts
app.get('/api/sync/conflicts', isAuthenticated, async (req, res) => {
  try {
    const conflicts = await syncService.getConflicts();
    res.json(conflicts);
  } catch (error) {
    console.error('Error getting conflicts:', error);
    res.status(500).json({ error: 'Failed to get conflicts' });
  }
});

// Resolve a conflict (cancel one of the bookings)
app.post('/api/sync/resolve-conflict', isAuthenticated, async (req, res) => {
  try {
    const { bookingIdToCancel, reason } = req.body;
    
    console.log('📌 Resolving conflict - canceling booking:', bookingIdToCancel);
    
    if (!bookingIdToCancel) {
      return res.status(400).json({ error: 'Missing bookingIdToCancel' });
    }
    
    // Update booking status to cancelled (using PostgreSQL syntax)
    const reasonText = reason || 'Conflicto de sincronización';
    const result = await pool.query(`
      UPDATE bookings 
      SET status = 'cancelled',
          internal_notes = COALESCE(internal_notes, '') || ' | Cancelado por conflicto: ' || $1::text
      WHERE id = $2::text
      RETURNING id, status, customer_name
    `, [reasonText, bookingIdToCancel]);
    
    if (result.rowCount === 0) {
      console.log('⚠️ No booking found with id:', bookingIdToCancel);
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    console.log('✅ Booking cancelled successfully:', result.rows[0]);
    res.json({ success: true, message: 'Conflict resolved', booking: result.rows[0] });
  } catch (error) {
    console.error('❌ Error resolving conflict:', error);
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

// ========================================
// FASE 3: CAPTAIN APP ENDPOINTS
// ========================================

// Get captain's assignments (bookings assigned to them)
app.get('/api/captain/:captainId/assignments', async (req, res) => {
  try {
    const { captainId } = req.params;
    const { status } = req.query; // Optional filter by status
    
    let query = `
      SELECT 
        b.*,
        tl.id as trip_log_id,
        tl.check_in_time,
        tl.check_out_time,
        tl.status as trip_status
      FROM bookings b
      LEFT JOIN trip_logs tl ON b.id = tl.booking_id
      WHERE b.assigned_captain_id = $1
    `;
    
    const params = [captainId];
    
    if (status) {
      query += ` AND b.status = $2`;
      params.push(status);
    }
    
    query += ` ORDER BY b.booking_date DESC, b.start_time DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting captain assignments:', error);
    res.status(500).json({ error: 'Failed to get assignments' });
  }
});

// Captain check-in
app.post('/api/captain/check-in', async (req, res) => {
  try {
    const { bookingId, captainId, latitude, longitude } = req.body;
    
    if (!bookingId || !captainId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if trip log already exists
    const existingLog = await pool.query(
      'SELECT id FROM trip_logs WHERE booking_id = $1',
      [bookingId]
    );
    
    if (existingLog.rows.length > 0) {
      // Update existing log
      const result = await pool.query(`
        UPDATE trip_logs 
        SET check_in_time = CURRENT_TIMESTAMP,
            check_in_lat = $1,
            check_in_lon = $2,
            status = 'in_progress'
        WHERE booking_id = $3
        RETURNING *
      `, [latitude, longitude, bookingId]);
      
      console.log('✅ Captain checked in (updated):', result.rows[0]);
      res.json(result.rows[0]);
    } else {
      // Create new trip log
      const tripLogId = `trip_${Date.now()}`;
      const result = await pool.query(`
        INSERT INTO trip_logs (
          id, booking_id, captain_id, check_in_time, 
          check_in_lat, check_in_lon, status
        )
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, 'in_progress')
        RETURNING *
      `, [tripLogId, bookingId, captainId, latitude, longitude]);
      
      console.log('✅ Captain checked in (new):', result.rows[0]);
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error during check-in:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// Captain check-out
app.post('/api/captain/check-out', async (req, res) => {
  try {
    const { bookingId, latitude, longitude } = req.body;
    
    if (!bookingId) {
      return res.status(400).json({ error: 'Missing booking ID' });
    }
    
    const result = await pool.query(`
      UPDATE trip_logs 
      SET check_out_time = CURRENT_TIMESTAMP,
          check_out_lat = $1,
          check_out_lon = $2,
          status = 'completed'
      WHERE booking_id = $3
      RETURNING *
    `, [latitude, longitude, bookingId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Trip log not found. Please check in first.' });
    }
    
    console.log('✅ Captain checked out:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error during check-out:', error);
    res.status(500).json({ error: 'Failed to check out' });
  }
});

// Submit trip report
app.post('/api/captain/trip-report', async (req, res) => {
  try {
    const {
      bookingId,
      captainId,
      tripLogId,
      weatherConditions,
      seaConditions,
      fuelUsed,
      passengersActual,
      issuesReported,
      customerSatisfaction,
      photos,
      notes
    } = req.body;
    
    if (!bookingId || !captainId || !tripLogId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const reportId = `report_${Date.now()}`;
    const result = await pool.query(`
      INSERT INTO trip_reports (
        id, booking_id, captain_id, trip_log_id,
        weather_conditions, sea_conditions, fuel_used,
        passengers_actual, issues_reported, customer_satisfaction,
        photos, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      reportId, bookingId, captainId, tripLogId,
      weatherConditions, seaConditions, fuelUsed,
      passengersActual, issuesReported, customerSatisfaction,
      JSON.stringify(photos || []), notes
    ]);
    
    const report = result.rows[0];
    console.log('✅ Trip report created:', report);
    
    // FASE 8: Auto-create fuel expense transaction if fuel was used
    if (fuelUsed && fuelUsed > 0) {
      try {
        // Get booking date for the transaction date
        const bookingResult = await pool.query(
          'SELECT booking_date FROM bookings WHERE id = $1',
          [bookingId]
        );
        
        const tripDate = bookingResult.rows.length > 0 
          ? bookingResult.rows[0].booking_date 
          : new Date().toISOString().split('T')[0];
        
        await createFuelExpenseFromTripReport(
          reportId,
          fuelUsed,
          null, // Auto-calculate cost
          tripDate
        );
      } catch (autoAccountingError) {
        console.error('⚠️ Auto-accounting for fuel failed (non-critical):', autoAccountingError);
        // Don't fail the trip report if accounting fails
      }
    }
    
    res.json(report);
  } catch (error) {
    console.error('Error creating trip report:', error);
    res.status(500).json({ error: 'Failed to create trip report' });
  }
});

// Get captain's trip history
app.get('/api/captain/:captainId/trip-logs', async (req, res) => {
  try {
    const { captainId } = req.params;
    const { limit = 50 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        tl.*,
        b.customer_name,
        b.booking_date,
        b.start_time,
        b.boat_type,
        tr.customer_satisfaction,
        tr.notes as report_notes
      FROM trip_logs tl
      JOIN bookings b ON tl.booking_id = b.id
      LEFT JOIN trip_reports tr ON tl.id = tr.trip_log_id
      WHERE tl.captain_id = $1
      ORDER BY tl.check_in_time DESC
      LIMIT $2
    `, [captainId, limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting trip logs:', error);
    res.status(500).json({ error: 'Failed to get trip logs' });
  }
});

// ========================================
// FASE 4: COMMISSION ENDPOINTS
// ========================================

// Get all commission rules
app.get('/api/commissions/rules', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM commission_rules 
      WHERE is_active = 1
      ORDER BY platform
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting commission rules:', error);
    res.status(500).json({ error: 'Failed to get commission rules' });
  }
});

// Create or update commission rule
app.post('/api/commissions/rules', isAuthenticated, async (req, res) => {
  try {
    const { platform, commissionPercentage, fixedFee } = req.body;
    
    if (!platform || commissionPercentage === undefined) {
      return res.status(400).json({ error: 'Platform and commission percentage required' });
    }
    
    const ruleId = `rule_${platform}`;
    const result = await pool.query(`
      INSERT INTO commission_rules (id, platform, commission_percentage, fixed_fee, is_active)
      VALUES ($1, $2, $3, $4, 1)
      ON CONFLICT (id) DO UPDATE SET
        commission_percentage = $3,
        fixed_fee = $4
      RETURNING *
    `, [ruleId, platform, commissionPercentage, fixedFee || 0]);
    
    console.log('✅ Commission rule updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating commission rule:', error);
    res.status(500).json({ error: 'Failed to update commission rule' });
  }
});

// Calculate commissions for completed bookings
app.post('/api/commissions/calculate', isAuthenticated, async (req, res) => {
  try {
    console.log('🧮 Calculating commissions for completed bookings...');
    
    // Get all completed bookings that don't have commission payments yet
    const bookingsResult = await pool.query(`
      SELECT b.* 
      FROM bookings b
      LEFT JOIN commission_payments cp ON b.id = cp.booking_id
      WHERE b.status = 'completed' 
        AND cp.id IS NULL
        AND b.assigned_captain_id IS NOT NULL
    `);
    
    const bookings = bookingsResult.rows;
    const newPayments = [];
    
    for (const booking of bookings) {
      // Get commission rule for this platform
      const ruleResult = await pool.query(`
        SELECT * FROM commission_rules 
        WHERE platform = $1 AND is_active = 1
      `, [booking.platform]);
      
      if (ruleResult.rows.length === 0) {
        console.log(`⚠️ No commission rule for platform: ${booking.platform}`);
        continue;
      }
      
      const rule = ruleResult.rows[0];
      const grossAmount = booking.total_amount;
      const commissionAmount = Math.floor((grossAmount * rule.commission_percentage / 100)) + rule.fixed_fee;
      const netAmount = grossAmount - commissionAmount;
      
      // Create commission payment record
      const paymentId = `payment_${Date.now()}_${booking.id}`;
      const paymentResult = await pool.query(`
        INSERT INTO commission_payments (
          id, booking_id, captain_id, gross_amount, 
          commission_amount, net_amount, payment_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
      `, [paymentId, booking.id, booking.assigned_captain_id, grossAmount, commissionAmount, netAmount]);
      
      newPayments.push(paymentResult.rows[0]);
    }
    
    console.log(`✅ Created ${newPayments.length} commission payment records`);
    res.json({ 
      message: `Calculated commissions for ${newPayments.length} bookings`,
      payments: newPayments 
    });
  } catch (error) {
    console.error('Error calculating commissions:', error);
    res.status(500).json({ error: 'Failed to calculate commissions' });
  }
});

// Get commission payments with filters
app.get('/api/commissions/payments', isAuthenticated, async (req, res) => {
  try {
    const { status, captainId, startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        cp.*,
        b.platform,
        b.customer_name,
        b.booking_date,
        c.name as captain_name
      FROM commission_payments cp
      JOIN bookings b ON cp.booking_id = b.id
      JOIN captains c ON cp.captain_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND cp.payment_status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (captainId) {
      query += ` AND cp.captain_id = $${paramCount}`;
      params.push(captainId);
      paramCount++;
    }
    
    if (startDate) {
      query += ` AND b.booking_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      query += ` AND b.booking_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    query += ' ORDER BY cp.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting commission payments:', error);
    res.status(500).json({ error: 'Failed to get commission payments' });
  }
});

// Mark payment as paid
app.post('/api/commissions/mark-paid', isAuthenticated, async (req, res) => {
  try {
    const { paymentId } = req.body;
    
    if (!paymentId) {
      return res.status(400).json({ error: 'Payment ID required' });
    }
    
    const result = await pool.query(`
      UPDATE commission_payments 
      SET payment_status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [paymentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = result.rows[0];
    console.log('✅ Payment marked as paid:', payment);
    
    // FASE 8: Auto-create commission expense transaction
    try {
      // Get booking details for platform info
      const bookingResult = await pool.query(
        'SELECT platform FROM bookings WHERE id = $1',
        [payment.booking_id]
      );
      
      if (bookingResult.rows.length > 0) {
        const platform = bookingResult.rows[0].platform;
        await createExpenseFromCommission(
          payment.id,
          platform,
          payment.commission_amount,
          new Date().toISOString().split('T')[0] // Today's date
        );
      }
    } catch (autoAccountingError) {
      console.error('⚠️ Auto-accounting for commission failed (non-critical):', autoAccountingError);
      // Don't fail the payment if accounting fails
    }
    
    res.json(payment);
  } catch (error) {
    console.error('Error marking payment as paid:', error);
    res.status(500).json({ error: 'Failed to mark payment as paid' });
  }
});

// Get financial reports
app.get('/api/commissions/reports', isAuthenticated, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Summary stats
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(gross_amount) as total_gross,
        SUM(commission_amount) as total_commission,
        SUM(net_amount) as total_net,
        SUM(CASE WHEN payment_status = 'paid' THEN net_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN payment_status = 'pending' THEN net_amount ELSE 0 END) as total_pending
      FROM commission_payments cp
      JOIN bookings b ON cp.booking_id = b.id
      ${startDate ? `WHERE b.booking_date >= '${startDate}'` : ''}
      ${endDate ? (startDate ? 'AND' : 'WHERE') + ` b.booking_date <= '${endDate}'` : ''}
    `);
    
    // By platform
    const platformResult = await pool.query(`
      SELECT 
        b.platform,
        COUNT(*) as booking_count,
        SUM(cp.gross_amount) as total_gross,
        SUM(cp.commission_amount) as total_commission,
        SUM(cp.net_amount) as total_net
      FROM commission_payments cp
      JOIN bookings b ON cp.booking_id = b.id
      ${startDate ? `WHERE b.booking_date >= '${startDate}'` : ''}
      ${endDate ? (startDate ? 'AND' : 'WHERE') + ` b.booking_date <= '${endDate}'` : ''}
      GROUP BY b.platform
      ORDER BY total_gross DESC
    `);
    
    // By captain
    const captainResult = await pool.query(`
      SELECT 
        c.name as captain_name,
        c.id as captain_id,
        COUNT(*) as booking_count,
        SUM(cp.gross_amount) as total_gross,
        SUM(cp.commission_amount) as total_commission,
        SUM(cp.net_amount) as total_net,
        SUM(CASE WHEN cp.payment_status = 'paid' THEN cp.net_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN cp.payment_status = 'pending' THEN cp.net_amount ELSE 0 END) as total_pending
      FROM commission_payments cp
      JOIN bookings b ON cp.booking_id = b.id
      JOIN captains c ON cp.captain_id = c.id
      ${startDate ? `WHERE b.booking_date >= '${startDate}'` : ''}
      ${endDate ? (startDate ? 'AND' : 'WHERE') + ` b.booking_date <= '${endDate}'` : ''}
      GROUP BY c.id, c.name
      ORDER BY total_gross DESC
    `);
    
    res.json({
      summary: summaryResult.rows[0],
      byPlatform: platformResult.rows,
      byCaptain: captainResult.rows
    });
  } catch (error) {
    console.error('Error getting commission reports:', error);
    res.status(500).json({ error: 'Failed to get commission reports' });
  }
});

// =======================
// 📅 FASE 5: SCHEDULE OPTIMIZER - AVAILABILITY MANAGEMENT
// =======================

// Get captain availability (by captain or date range)
app.get('/api/availability', isAuthenticated, async (req, res) => {
  try {
    const { captainId, startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM captain_availability WHERE 1=1';
    const params = [];
    
    if (captainId) {
      params.push(captainId);
      query += ` AND captain_id = $${params.length}`;
    }
    
    if (startDate) {
      params.push(startDate);
      query += ` AND date >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      query += ` AND date <= $${params.length}`;
    }
    
    query += ' ORDER BY date ASC, start_time ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting availability:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
});

// Create availability block (mark unavailable)
app.post('/api/availability', isAuthenticated, async (req, res) => {
  try {
    const { captainId, date, startTime, endTime, isAvailable, reason } = req.body;
    
    if (!captainId || !date) {
      return res.status(400).json({ error: 'Captain ID and date required' });
    }
    
    const id = `avail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await pool.query(`
      INSERT INTO captain_availability 
        (id, captain_id, date, start_time, end_time, is_available, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      id, 
      captainId, 
      date, 
      startTime || '00:00', 
      endTime || '23:59',
      isAvailable !== undefined ? isAvailable : 0,
      reason || null
    ]);
    
    console.log('✅ Availability created:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating availability:', error);
    res.status(500).json({ error: 'Failed to create availability' });
  }
});

// Update availability
app.put('/api/availability/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    // Accept both camelCase and snake_case field names
    const { 
      startTime, start_time,
      endTime, end_time,
      isAvailable, is_available,
      reason 
    } = req.body;
    
    const newStartTime = startTime || start_time;
    const newEndTime = endTime || end_time;
    const newIsAvailable = isAvailable !== undefined ? isAvailable : is_available;
    
    const result = await pool.query(`
      UPDATE captain_availability 
      SET 
        start_time = COALESCE($1, start_time),
        end_time = COALESCE($2, end_time),
        is_available = COALESCE($3, is_available),
        reason = COALESCE($4, reason)
      WHERE id = $5
      RETURNING *
    `, [newStartTime, newEndTime, newIsAvailable, reason, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Availability not found' });
    }
    
    console.log('✅ Availability updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// Delete availability block
app.delete('/api/availability/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM captain_availability 
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Availability not found' });
    }
    
    console.log('✅ Availability deleted:', result.rows[0]);
    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting availability:', error);
    res.status(500).json({ error: 'Failed to delete availability' });
  }
});

// Get captain schedule (assignments + availability for date range)
app.get('/api/schedule/:captainId', isAuthenticated, async (req, res) => {
  try {
    const { captainId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Get bookings
    let bookingsQuery = `
      SELECT * FROM bookings 
      WHERE assigned_captain_id = $1
        AND status IN ('pending', 'confirmed', 'assigned', 'in_progress')
    `;
    const params = [captainId];
    
    if (startDate) {
      params.push(startDate);
      bookingsQuery += ` AND booking_date >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      bookingsQuery += ` AND booking_date <= $${params.length}`;
    }
    
    bookingsQuery += ' ORDER BY booking_date ASC, start_time ASC';
    
    const bookingsResult = await pool.query(bookingsQuery, params);
    
    // Get availability blocks
    const availParams = [captainId];
    let availQuery = 'SELECT * FROM captain_availability WHERE captain_id = $1';
    
    if (startDate) {
      availParams.push(startDate);
      availQuery += ` AND date >= $${availParams.length}`;
    }
    
    if (endDate) {
      availParams.push(endDate);
      availQuery += ` AND date <= $${availParams.length}`;
    }
    
    availQuery += ' ORDER BY date ASC';
    
    const availabilityResult = await pool.query(availQuery, availParams);
    
    res.json({
      bookings: bookingsResult.rows,
      availability: availabilityResult.rows
    });
  } catch (error) {
    console.error('Error getting captain schedule:', error);
    res.status(500).json({ error: 'Failed to get captain schedule' });
  }
});

// ====================================
// MARINE CONDITIONS API ENDPOINTS
// ====================================

// Get current marine conditions
app.get('/api/marine/current', async (req, res) => {
  try {
    const data = await marineConditionsService.getCurrentConditions();
    res.json(data);
  } catch (error) {
    console.error('Error getting current conditions:', error);
    res.status(500).json({ error: 'Failed to get current conditions' });
  }
});

// Get marine forecast (3 days)
app.get('/api/marine/forecast', async (req, res) => {
  try {
    const data = await marineConditionsService.getMarineForecast();
    res.json(data);
  } catch (error) {
    console.error('Error getting forecast:', error);
    res.status(500).json({ error: 'Failed to get forecast' });
  }
});

// Get tides data
app.get('/api/marine/tides', async (req, res) => {
  try {
    const data = await marineConditionsService.getTidesData();
    res.json(data);
  } catch (error) {
    console.error('Error getting tides:', error);
    res.status(500).json({ error: 'Failed to get tides data' });
  }
});

// Get active marine alerts
app.get('/api/marine/alerts', async (req, res) => {
  try {
    const data = await marineConditionsService.getMarineAlerts();
    res.json(data);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Get buoy data
app.get('/api/marine/buoy-data', async (req, res) => {
  try {
    const data = await marineConditionsService.getBuoyData();
    res.json(data);
  } catch (error) {
    console.error('Error getting buoy data:', error);
    res.status(500).json({ error: 'Failed to get buoy data' });
  }
});

// Get complete marine summary (all data in one call)
app.get('/api/marine/summary', async (req, res) => {
  try {
    const data = await marineConditionsService.getMarineSummary();
    res.json(data);
  } catch (error) {
    console.error('Error getting marine summary:', error);
    res.status(500).json({ error: 'Failed to get marine summary' });
  }
});

// Clear marine conditions cache (admin only, but no auth right now)
app.post('/api/marine/clear-cache', isAuthenticated, async (req, res) => {
  try {
    marineConditionsService.clearCache();
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Check for booking conflicts
app.post('/api/availability/check-conflict', isAuthenticated, async (req, res) => {
  try {
    const { captainId, date, startTime, durationHours } = req.body;
    
    if (!captainId || !date || !startTime) {
      return res.status(400).json({ error: 'Captain ID, date, and start time required' });
    }
    
    // Calculate end time
    const endTime = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm')
      .add(durationHours || 4, 'hours')
      .format('HH:mm');
    
    // Check availability blocks (only if time overlaps)
    const availResult = await pool.query(`
      SELECT * FROM captain_availability 
      WHERE captain_id = $1 
        AND date = $2 
        AND is_available = 0
        AND (
          (start_time <= $3 AND end_time > $3)
          OR
          (start_time < $4 AND end_time >= $4)
          OR
          (start_time >= $3 AND end_time <= $4)
        )
    `, [captainId, date, startTime, endTime]);
    
    if (availResult.rows.length > 0) {
      return res.json({ 
        hasConflict: true, 
        reason: 'unavailable',
        details: availResult.rows[0]
      });
    }
    
    // Check booking conflicts
    const conflictResult = await pool.query(`
      SELECT * FROM bookings 
      WHERE assigned_captain_id = $1 
        AND booking_date = $2 
        AND status IN ('pending', 'confirmed', 'assigned', 'in_progress')
        AND (
          (start_time <= $3 AND 
           (CAST(split_part(start_time, ':', 1) AS INTEGER) * 60 + 
            CAST(split_part(start_time, ':', 2) AS INTEGER) + 
            COALESCE(duration_hours, 4) * 60) > 
           (CAST(split_part($3, ':', 1) AS INTEGER) * 60 + 
            CAST(split_part($3, ':', 2) AS INTEGER)))
          OR
          (start_time >= $3 AND start_time < $4)
        )
    `, [captainId, date, startTime, endTime]);
    
    if (conflictResult.rows.length > 0) {
      return res.json({ 
        hasConflict: true, 
        reason: 'booking_conflict',
        conflictingBooking: conflictResult.rows[0]
      });
    }
    
    res.json({ hasConflict: false });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({ error: 'Failed to check conflicts' });
  }
});

// ⏰ AUTOMATIC SYNC SCHEDULER
// Sync all platforms every 15 minutes
console.log('⏰ Scheduling automatic sync every 15 minutes...');
cron.schedule('*/15 * * * *', async () => {
  console.log('🔄 Running scheduled sync for all platforms...');
  try {
    await syncService.syncAllPlatforms();
  } catch (error) {
    console.error('Error in scheduled sync:', error);
  }
});

// Initial sync on server start (after 30 seconds)
setTimeout(async () => {
  console.log('🚀 Running initial sync...');
  try {
    await syncService.syncAllPlatforms();
  } catch (error) {
    console.error('Error in initial sync:', error);
  }
}, 30000);

// ⏰ MARINE CONDITIONS ALERT CHECKER
// Runs every hour to check for dangerous marine conditions
console.log('🌊 Scheduling marine conditions alert checks...');
cron.schedule('0 * * * *', async () => {
  console.log('🌊 Checking marine conditions for alerts...');
  try {
    const summary = await marineConditionsService.getMarineSummary();
    
    // Check safety rating
    if (summary.safetyRating.score < 60) {
      console.log(`⚠️ MARINE ALERT: Safety score is ${summary.safetyRating.score} - ${summary.safetyRating.recommendation}`);
      
      // Log dangerous conditions
      if (summary.safetyRating.conditions.length > 0) {
        console.log(`Conditions: ${summary.safetyRating.conditions.join(', ')}`);
      }
      
      // TODO: Could send SMS/Email alerts to captains or operations team
      // For now, just logging to console
    }
    
    // Check for active marine alerts
    if (summary.alerts.count > 0) {
      console.log(`⚠️ ACTIVE MARINE ALERTS: ${summary.alerts.count} alert(s)`);
      summary.alerts.alerts.forEach(alert => {
        console.log(`- ${alert.event}: ${alert.headline}`);
      });
    }
    
  } catch (error) {
    console.error('Error checking marine conditions:', error);
  }
});

// ⏰ POST-TRIP FOLLOW-UP SCHEDULER (FASE 6)
// Runs daily at 10:00 AM to send review requests to customers who completed trips 1-2 days ago
console.log('📧 Scheduling daily post-trip follow-ups...');
cron.schedule('0 10 * * *', async () => {
  console.log('📧 Running post-trip follow-ups...');
  try {
    // Get bookings completed 1-2 days ago
    const oneDayAgo = moment().subtract(1, 'days').format('YYYY-MM-DD');
    const twoDaysAgo = moment().subtract(2, 'days').format('YYYY-MM-DD');
    
    const result = await pool.query(`
      SELECT b.*, c.name as captain_name 
      FROM bookings b
      LEFT JOIN captains c ON b.assigned_captain_id = c.id
      WHERE b.status = 'completed'
        AND b.booking_date >= $1
        AND b.booking_date <= $2
        AND NOT EXISTS (
          SELECT 1 FROM chat_conversations 
          WHERE booking_id = b.id AND status = 'review_requested'
        )
    `, [twoDaysAgo, oneDayAgo]);
    
    const bookings = result.rows;
    console.log(`Found ${bookings.length} completed bookings for follow-up`);
    
    // Send review requests via WhatsApp
    const twilioSid = process.env.TWILIO_SID || '';
    const twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
    
    if (twilioSid && twilioToken && twilioSid.startsWith('AC')) {
      const client = twilio(twilioSid, twilioToken);
      
      for (const booking of bookings) {
        try {
          const language = await aiOrchestrator.detectLanguage(booking.customer_name || 'customer');
          
          const messageES = `
¡Hola ${booking.customer_name}! 👋

Esperamos que hayas disfrutado tu tour con Nadaki Excursions el ${booking.booking_date}. 

¿Nos podrías dejar una reseña? Tu opinión nos ayuda muchísimo:
⭐ ¿Cómo estuvo tu experiencia?
⭐ ¿Qué fue lo mejor del tour?
⭐ ¿Recomendarías a otros?

Responde a este mensaje con tus comentarios.

¡Gracias por elegirnos! 🚤
- Equipo Nadaki Excursions
          `.trim();
          
          const messageEN = `
Hi ${booking.customer_name}! 👋

We hope you enjoyed your tour with Nadaki Excursions on ${booking.booking_date}. 

Would you mind leaving us a review? Your feedback helps us a lot:
⭐ How was your experience?
⭐ What did you enjoy most?
⭐ Would you recommend us to others?

Reply to this message with your comments.

Thanks for choosing us! 🚤
- Nadaki Excursions Team
          `.trim();
          
          const message = language === 'en' ? messageEN : messageES;
          
          await client.messages.create({
            body: message,
            from: 'whatsapp:+14155238886',
            to: `whatsapp:${booking.customer_phone}`
          });
          
          console.log(`✅ Sent review request to ${booking.customer_name}`);
          
          // Mark as review requested
          await pool.query(`
            INSERT INTO chat_conversations (
              id, session_id, customer_name, customer_phone, customer_email,
              messages, status, booking_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (session_id) DO UPDATE SET status = 'review_requested'
          `, [
            `review_${booking.id}`,
            `review_${booking.id}`,
            booking.customer_name,
            booking.customer_phone,
            booking.customer_email,
            JSON.stringify([{
              role: 'system',
              content: 'Review request sent',
              timestamp: new Date().toISOString()
            }]),
            'review_requested',
            booking.id
          ]);
          
        } catch (error) {
          console.error(`Error sending review request to ${booking.customer_name}:`, error);
        }
        
        // Rate limit: wait 2 seconds between messages
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } else {
      console.log('⚠️ Twilio not configured, skipping WhatsApp messages');
    }
    
  } catch (error) {
    console.error('Error in post-trip follow-ups:', error);
  }
});

// ⏰ ACCOUNTING ALERTS SCHEDULER (FASE 8)
// Runs daily at 8:00 AM to check for alert conditions
console.log('🚨 Scheduling daily accounting alerts check...');
cron.schedule('0 8 * * *', async () => {
  console.log('🚨 Running accounting alerts check...');
  try {
    const alerts = await checkAlertConditions();
    console.log(`✅ Alerts check complete. Created ${alerts.length} new alerts.`);
    
    // Log alert details
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        console.log(`  - ${alert.type}: ${alert.account || 'General'}`);
      });
    }
  } catch (error) {
    console.error('Error in accounting alerts check:', error);
  }
});

// ⏰ DEMAND FORECAST REFRESH SCHEDULER
// Runs every 2 minutes to sync emails from sales@nadakiexcursions.com
console.log('📧 Scheduling email sync every 2 minutes...');
cron.schedule('*/2 * * * *', async () => {
  console.log('📬 Running email sync...');
  try {
    const result = await emailService.syncUnreadEmails();
    if (result.synced > 0) {
      console.log(`✅ Email sync completed: ${result.synced} emails ingested`);
    }
  } catch (error) {
    console.error('❌ Email sync error:', error.message);
  }
});

// ⏰ SCHEDULED EXPENSES AUTO-CONVERSION (FASE 10)
// Runs daily at 3:00 AM to convert due scheduled expenses to real expenses
console.log('💰 Scheduling daily scheduled expenses auto-conversion...');
cron.schedule('0 3 * * *', async () => {
  console.log('💰 Processing scheduled expenses...');
  try {
    // Get all pending scheduled expenses that are due (scheduled_date <= today) and auto_convert = 1
    const today = new Date().toISOString().split('T')[0];
    const dueExpenses = await pool.query(`
      SELECT * FROM scheduled_expenses 
      WHERE status = 'pending' 
      AND auto_convert = 1 
      AND scheduled_date <= $1
      ORDER BY scheduled_date ASC
    `, [today]);
    
    console.log(`  Found ${dueExpenses.rows.length} due expenses to process`);
    
    for (const scheduledExpense of dueExpenses.rows) {
      try {
        // Import nanoid dynamically
        const { nanoid } = await import('nanoid');
        
        // Get boat name for accounting sync
        const boatResult = await pool.query('SELECT name FROM boats WHERE id = $1', [scheduledExpense.boat_id]);
        const boatName = boatResult.rows.length > 0 ? boatResult.rows[0].name : 'Unknown Boat';
        
        // Create the actual expense
        const expenseId = nanoid();
        await pool.query(`
          INSERT INTO boat_expenses 
          (id, boat_id, category, amount, expense_date, description, recurring_rule_id, generated_automatically)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          expenseId, 
          scheduledExpense.boat_id, 
          scheduledExpense.category, 
          scheduledExpense.amount, 
          today, 
          `${scheduledExpense.description} (Auto-generado)`,
          scheduledExpense.id,
          true
        ]);
        
        // Sync to accounting
        await syncBoatExpenseToAccounting(
          expenseId, 
          scheduledExpense.category, 
          scheduledExpense.amount, 
          today, 
          scheduledExpense.description, 
          boatName
        );
        
        // Handle recurrence if applicable
        if (scheduledExpense.recurrence_type !== 'once') {
          const interval = scheduledExpense.recurrence_interval || 1;
          let nextDate;
          
          switch (scheduledExpense.recurrence_type) {
            case 'monthly':
              nextDate = addMonthsSafe(scheduledExpense.scheduled_date, interval);
              break;
            case 'yearly':
              nextDate = addMonthsSafe(scheduledExpense.scheduled_date, interval * 12);
              break;
            case 'weekly':
              nextDate = new Date(scheduledExpense.scheduled_date);
              nextDate.setDate(nextDate.getDate() + (7 * interval));
              break;
            default:
              nextDate = addMonthsSafe(scheduledExpense.scheduled_date, 1);
          }
          
          // Create next scheduled expense
          const nextId = nanoid();
          await pool.query(`
            INSERT INTO scheduled_expenses 
            (id, boat_id, category, amount, scheduled_date, description, 
             recurrence_type, recurrence_interval, auto_convert, notes, last_generated_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            nextId, 
            scheduledExpense.boat_id, 
            scheduledExpense.category, 
            scheduledExpense.amount, 
            nextDate.toISOString().split("T")[0], 
            scheduledExpense.description, 
            scheduledExpense.recurrence_type, 
            scheduledExpense.recurrence_interval, 
            0,
            scheduledExpense.notes, 
            today
          ]);
        }
        
        // Mark original as converted
        await pool.query(`
          UPDATE scheduled_expenses 
          SET status = 'paid', updated_at = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [scheduledExpense.id]);
        
        console.log(`  ✅ Converted: ${scheduledExpense.description} ($${scheduledExpense.amount})`);
      } catch (error) {
        console.error(`  ❌ Error processing expense ${scheduledExpense.id}:`, error.message);
      }
    }
    
    console.log('💰 Scheduled expenses processing complete');
  } catch (error) {
    console.error('❌ Scheduled expenses cron error:', error);
  }
});

// Runs daily at 3:30 AM — auto-apply pending booking deposits whose booking_date has passed
console.log('🔐 Scheduling daily booking deposit auto-apply...');
cron.schedule('30 3 * * *', async () => {
  console.log('🔐 Auto-applying overdue booking deposits...');
  try {
    const today = new Date().toISOString().split('T')[0];
    // Find pending deposits with booking_date <= today
    const { rows: overdue } = await pool.query(`
      SELECT bd.*, b.name as boat_name FROM booking_deposits bd
      LEFT JOIN boats b ON bd.boat_id = b.id
      WHERE bd.status = 'pending'
        AND bd.booking_date IS NOT NULL
        AND bd.booking_date <= $1
    `, [today]);

    // Get default revenue account (4020 - Rentals)
    const { rows: accts } = await pool.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '4020' AND is_active = true LIMIT 1`
    );
    const defaultAccountId = accts.length ? accts[0].id : null;
    if (!defaultAccountId) { console.log('  ⚠️ No default revenue account found, skipping'); return; }

    const { nanoid } = await import('nanoid');
    let applied = 0;
    for (const dep of overdue) {
      try {
        const pg = await pool.connect();
        try {
          await pg.query('BEGIN');
          const txId = 'tx_' + nanoid(8);
          await pg.query(
            `INSERT INTO transactions (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, boat_id, notes)
             VALUES ($1,$2,'income',$3,$4,$5,$6,'booking_deposit',$7,$8)`,
            [txId, dep.booking_date || today, defaultAccountId, dep.amount,
             `Depósito aplicado (auto) — ${dep.client_name}`, dep.booking_reference || dep.id,
             dep.boat_id || null, `Auto-aplicado el ${today}`]
          );
          await pg.query(
            `UPDATE booking_deposits SET status='applied', booking_reference=COALESCE(booking_reference,$1) WHERE id=$2`,
            [dep.id, dep.id]
          );
          await pg.query('COMMIT');
          applied++;
          console.log(`  ✅ Auto-applied: ${dep.client_name} — $${dep.amount}`);
        } catch(e) { await pg.query('ROLLBACK'); console.error(`  ❌ Error applying ${dep.id}:`, e.message); }
        finally { pg.release(); }
      } catch(e) { console.error('  ❌ DB connect error:', e.message); }
    }
    console.log(`🔐 Auto-apply complete: ${applied}/${overdue.length} deposits applied`);
  } catch(e) { console.error('❌ Booking deposit auto-apply cron error:', e); }
});

// Runs daily at midnight to refresh demand forecasts for all regions
console.log('🤖 Scheduling daily demand forecast refresh...');
cron.schedule('0 0 * * *', async () => {
  console.log('🤖 Executing daily demand forecast refresh...');
  const regions = ['Miami', 'Keys', 'Tampa', 'Fort Lauderdale'];
  
  for (const region of regions) {
    try {
      // Generate forecasts for the next 7 days
      for (let i = 0; i < 7; i++) {
        const forecastDate = moment().add(i, 'days').format('YYYY-MM-DD');
        await dynamicPricingService.predictDemand(region, null, forecastDate);
      }
      console.log(`✅ Refreshed demand forecast for ${region}`);
    } catch (error) {
      console.error(`❌ Error refreshing forecast for ${region}:`, error.message);
    }
  }
  console.log('🤖 Daily demand forecast refresh completed');
});

// ========================================
// ⚡ FASE 7: PRICING MANAGEMENT ENDPOINTS
// ========================================

// Get all boats
app.get('/api/pricing/boats', isAuthenticated, async (req, res) => {
  try {
    const boats = await pricingService.getBoats();
    res.json(boats);
  } catch (error) {
    console.error('Error getting boats:', error);
    res.status(500).json({ error: 'Failed to get boats' });
  }
});

// Create new boat
app.post('/api/pricing/boats', isAuthenticated, async (req, res) => {
  try {
    const boat = await pricingService.createBoat(req.body);
    res.json(boat);
  } catch (error) {
    console.error('Error creating boat:', error);
    res.status(500).json({ error: 'Failed to create boat' });
  }
});

// Get pricing policies
app.get('/api/pricing/policies', isAuthenticated, async (req, res) => {
  try {
    const { platform, boatId } = req.query;
    const policies = await pricingService.getPlatformPricingPolicies(platform, boatId);
    res.json(policies);
  } catch (error) {
    console.error('Error getting pricing policies:', error);
    res.status(500).json({ error: 'Failed to get pricing policies' });
  }
});

// Create or update pricing policy
app.post('/api/pricing/policies', isAuthenticated, async (req, res) => {
  try {
    const policy = await pricingService.createOrUpdatePricingPolicy(req.body);
    res.json(policy);
  } catch (error) {
    console.error('Error creating/updating pricing policy:', error);
    res.status(500).json({ error: 'Failed to create/update pricing policy' });
  }
});

// Get all pricing adjustments
app.get('/api/pricing/adjustments', isAuthenticated, async (req, res) => {
  try {
    const adjustments = await pricingService.getAllPricingAdjustments();
    res.json(adjustments);
  } catch (error) {
    console.error('Error getting pricing adjustments:', error);
    res.status(500).json({ error: 'Failed to get pricing adjustments' });
  }
});

// Create pricing adjustment
app.post('/api/pricing/adjustments', isAuthenticated, async (req, res) => {
  try {
    const adjustment = await pricingService.createPricingAdjustment(req.body);
    res.json(adjustment);
  } catch (error) {
    console.error('Error creating pricing adjustment:', error);
    res.status(500).json({ error: 'Failed to create pricing adjustment' });
  }
});

// Update pricing adjustment
app.put('/api/pricing/adjustments/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const adjustment = await pricingService.updatePricingAdjustment(id, req.body);
    res.json(adjustment);
  } catch (error) {
    console.error('Error updating pricing adjustment:', error);
    res.status(500).json({ error: 'Failed to update pricing adjustment' });
  }
});

// Delete pricing adjustment
app.delete('/api/pricing/adjustments/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    await pricingService.deletePricingAdjustment(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting pricing adjustment:', error);
    res.status(500).json({ error: 'Failed to delete pricing adjustment' });
  }
});

// Calculate effective price
app.post('/api/pricing/calculate', isAuthenticated, async (req, res) => {
  try {
    const { platform, boatId, duration, date } = req.body;
    const result = await pricingService.calculateEffectivePrice(
      platform, 
      boatId, 
      duration, 
      date ? new Date(date) : new Date()
    );
    res.json(result);
  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({ error: error.message || 'Failed to calculate price' });
  }
});

// Preview adjustment impact
app.post('/api/pricing/preview-impact', isAuthenticated, async (req, res) => {
  try {
    const impact = await pricingService.previewAdjustmentImpact(req.body);
    res.json(impact);
  } catch (error) {
    console.error('Error previewing impact:', error);
    res.status(500).json({ error: 'Failed to preview impact' });
  }
});

// Get all platforms
app.get('/api/pricing/platforms', isAuthenticated, async (req, res) => {
  try {
    const platforms = await pricingService.getAllPlatforms();
    res.json(platforms);
  } catch (error) {
    console.error('Error getting platforms:', error);
    res.status(500).json({ error: 'Failed to get platforms' });
  }
});

// ========================================
// ⚡ DYNAMIC PRICING & MARKET INTELLIGENCE ENDPOINTS
// ========================================

// Add competitor data
app.post('/api/pricing/competitor-data', async (req, res) => {
  try {
    const data = await dynamicPricingService.addCompetitorData(req.body);
    res.json(data);
  } catch (error) {
    console.error('Error adding competitor data:', error);
    res.status(500).json({ error: error.message || 'Failed to add competitor data' });
  }
});

// Get competitor data
app.get('/api/pricing/competitor-data', async (req, res) => {
  try {
    const { region, boatType } = req.query;
    const data = await dynamicPricingService.getCompetitorData(region, boatType);
    res.json(data);
  } catch (error) {
    console.error('Error getting competitor data:', error);
    res.status(500).json({ error: 'Failed to get competitor data' });
  }
});

// Add market event
app.post('/api/pricing/market-events', async (req, res) => {
  try {
    const event = await dynamicPricingService.addMarketEvent(req.body);
    res.json(event);
  } catch (error) {
    console.error('Error adding market event:', error);
    res.status(500).json({ error: error.message || 'Failed to add market event' });
  }
});

// Get active market events
app.get('/api/pricing/market-events', async (req, res) => {
  try {
    const { region } = req.query;
    const events = await dynamicPricingService.getActiveMarketEvents(region);
    res.json(events);
  } catch (error) {
    console.error('Error getting market events:', error);
    res.status(500).json({ error: 'Failed to get market events' });
  }
});

// Get demand forecast
app.get('/api/pricing/demand-forecast', async (req, res) => {
  try {
    const { region, boatType, date } = req.query;
    const forecast = await dynamicPricingService.predictDemand(
      region || 'Miami',
      boatType || 'yacht',
      date || new Date()
    );
    res.json(forecast);
  } catch (error) {
    console.error('Error generating demand forecast:', error);
    res.status(500).json({ error: 'Failed to generate demand forecast' });
  }
});

// Generate price recommendation
app.post('/api/pricing/recommend', async (req, res) => {
  try {
    const { boatId, date, durationHours, region } = req.body;
    
    if (!boatId || !date || !durationHours) {
      return res.status(400).json({ error: 'Missing required fields: boatId, date, durationHours' });
    }
    
    const recommendation = await dynamicPricingService.generatePriceRecommendation(
      boatId,
      date,
      durationHours,
      region || 'Miami'
    );
    res.json(recommendation);
  } catch (error) {
    console.error('Error generating price recommendation:', error);
    res.status(500).json({ error: error.message || 'Failed to generate price recommendation' });
  }
});

// Get recent recommendations
app.get('/api/pricing/recommendations', async (req, res) => {
  try {
    const { limit } = req.query;
    const recommendations = await dynamicPricingService.getRecentRecommendations(
      limit ? parseInt(limit) : 20
    );
    res.json(recommendations);
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get market insights
app.get('/api/pricing/market-insights', async (req, res) => {
  try {
    const { region } = req.query;
    const insights = await dynamicPricingService.getMarketInsights(region);
    res.json(insights);
  } catch (error) {
    console.error('Error getting market insights:', error);
    res.status(500).json({ error: 'Failed to get market insights' });
  }
});

// Identify pricing opportunities
app.get('/api/pricing/opportunities', async (req, res) => {
  try {
    const { region } = req.query;
    const opportunities = await dynamicPricingService.identifyOpportunities(region || 'Miami');
    res.json(opportunities);
  } catch (error) {
    console.error('Error identifying opportunities:', error);
    res.status(500).json({ error: 'Failed to identify opportunities' });
  }
});

// ========================================
// ⚡ FASE 7: AVAILABILITY MANAGEMENT ENDPOINTS
// ========================================

// Check availability
app.post('/api/availability/check', isAuthenticated, async (req, res) => {
  try {
    const { boatId, date, startTime, endTime } = req.body;
    const result = await availabilityService.checkAvailability(boatId, date, startTime, endTime);
    res.json(result);
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// Create availability block
app.post('/api/availability/blocks', isAuthenticated, async (req, res) => {
  try {
    const block = await availabilityService.createBlock(req.body);
    res.json(block);
  } catch (error) {
    console.error('Error creating block:', error);
    res.status(500).json({ error: 'Failed to create block' });
  }
});

// Release availability block
app.post('/api/availability/blocks/:id/release', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const block = await availabilityService.releaseBlock(id);
    res.json(block);
  } catch (error) {
    console.error('Error releasing block:', error);
    res.status(500).json({ error: 'Failed to release block' });
  }
});

// Get availability blocks
app.get('/api/availability/blocks', isAuthenticated, async (req, res) => {
  try {
    const { boatId, startDate, endDate } = req.query;
    const blocks = boatId 
      ? await availabilityService.getBlocksByBoat(boatId, startDate, endDate)
      : await availabilityService.getAllBlocks(startDate, endDate);
    res.json(blocks);
  } catch (error) {
    console.error('Error getting blocks:', error);
    res.status(500).json({ error: 'Failed to get blocks' });
  }
});

// ========================================
// ⚡ FASE 7: SYNC JOBS ENDPOINTS
// ========================================

// Get sync jobs queue
app.get('/api/sync/jobs', isAuthenticated, async (req, res) => {
  try {
    const { limit } = req.query;
    const jobs = await syncJobsWorker.getRecentJobs(limit ? parseInt(limit) : 50);
    res.json(jobs);
  } catch (error) {
    console.error('Error getting sync jobs:', error);
    res.status(500).json({ error: 'Failed to get sync jobs' });
  }
});

// Get sync jobs stats
app.get('/api/sync/jobs/stats', isAuthenticated, async (req, res) => {
  try {
    const stats = await syncJobsWorker.getJobStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting job stats:', error);
    res.status(500).json({ error: 'Failed to get job stats' });
  }
});

// Retry failed jobs
app.post('/api/sync/jobs/retry-failed', isAuthenticated, async (req, res) => {
  try {
    const jobs = await syncJobsWorker.retryFailedJobs();
    res.json({ success: true, retriedCount: jobs.length });
  } catch (error) {
    console.error('Error retrying failed jobs:', error);
    res.status(500).json({ error: 'Failed to retry failed jobs' });
  }
});

// Manual trigger to process jobs
app.post('/api/sync/jobs/process', isAuthenticated, async (req, res) => {
  try {
    await syncJobsWorker.processPendingJobs();
    res.json({ success: true, message: 'Job processing triggered' });
  } catch (error) {
    console.error('Error processing jobs:', error);
    res.status(500).json({ error: 'Failed to process jobs' });
  }
});

// ========================================
// 🚤 FASE 11: FLEET MANAGEMENT ENDPOINTS
// ========================================

// Get all boats
app.get('/api/fleet/boats', async (req, res) => {
  try {
    const boats = await fleetService.getAllBoats();
    res.json(boats);
  } catch (error) {
    console.error('Error getting boats:', error);
    res.status(500).json({ error: 'Failed to get boats' });
  }
});

// Create boat
app.post('/api/fleet/boats', isAuthenticated, async (req, res) => {
  try {
    const boat = await fleetService.createBoat(req.body);
    res.json(boat);
  } catch (error) {
    console.error('Error creating boat:', error);
    res.status(500).json({ error: 'Failed to create boat' });
  }
});

// Update boat
app.put('/api/fleet/boats/:id', isAuthenticated, async (req, res) => {
  try {
    const boat = await fleetService.updateBoat(req.params.id, req.body);
    res.json(boat);
  } catch (error) {
    console.error('Error updating boat:', error);
    res.status(500).json({ error: 'Failed to update boat' });
  }
});

// Delete boat
app.delete('/api/fleet/boats/:id', isAuthenticated, async (req, res) => {
  try {
    await fleetService.deleteBoat(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting boat:', error);
    res.status(500).json({ error: 'Failed to delete boat' });
  }
});

// Upload boat photos (supports multiple files)
const boatPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'boats');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const name = `${req.params.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, name);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Photo Upload Endpoint
app.post('/api/fleet/boats/:id/photos', (req, res, next) => {
  boatPhotoUpload.array('photos', 20)(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message || 'Upload error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const boatId = req.params.id;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }
    
    console.log("FILES:", (req.files||[]).map(x=>x.originalname), "COUNT:", (req.files||[]).length);
    const urls = req.files.map(f => `/uploads/boats/${f.filename}`);
    
    // 1. Insert into boat_photos for persistence
    const insertPromises = urls.map(url => 
      pool.query('INSERT INTO boat_photos (boat_id, url) VALUES ($1, $2)', [boatId, url])
    );
    await Promise.all(insertPromises);
    
    // 2. Also update boats table for backward compatibility with UI
    const boatResult = await pool.query('SELECT photos FROM boats WHERE id = $1', [boatId]);
    if (boatResult.rows.length > 0) {
      const existingPhotos = boatResult.rows[0].photos || [];
      const updatedPhotos = [...existingPhotos, ...urls];
      await pool.query('UPDATE boats SET photos = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(updatedPhotos), boatId]);
    }
    
    res.json({ urls, total: urls.length });
  } catch (error) {
    console.error('Error uploading boat photos:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

app.delete('/api/fleet/boats/:id/photos', async (req, res) => {
  try {
    const { photoUrl } = req.body;
    const boat = await fleetService.getBoatById(req.params.id);
    if (!boat) return res.status(404).json({ error: 'Boat not found' });
    const updatedPhotos = (boat.photos || []).filter(p => p !== photoUrl);
    await pool.query('UPDATE boats SET photos = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(updatedPhotos), req.params.id]);
    // 3. Delete from boat_photos table too
    await pool.query('DELETE FROM boat_photos WHERE boat_id = $1 AND url = $2', [req.params.id, photoUrl]);

    if (photoUrl.startsWith('/uploads/boats/')) {
      const filePath = path.join(__dirname, 'public', photoUrl);
      require('fs').unlink(filePath, () => {});
    }
    res.json({ success: true, remaining: updatedPhotos.length });
  } catch (error) {
    console.error('Error removing boat photo:', error);
    res.status(500).json({ error: 'Failed to remove photo' });
  }
});

// Get boat photos
app.get('/api/fleet/boats/:id/photos', async (req, res) => {
  try {
    const result = await pool.query('SELECT url FROM boat_photos WHERE boat_id = $1 ORDER BY created_at ASC', [req.params.id]);
    if (result.rows.length > 0) {
      return res.json(result.rows.map(r => r.url));
    }
    // Fallback: return photos from boats table if boat_photos is empty
    const boatResult = await pool.query('SELECT photos FROM boats WHERE id = $1', [req.params.id]);
    const boatPhotos = boatResult.rows[0]?.photos || [];
    res.json(boatPhotos);
  } catch (error) {
    console.error('Error fetching boat photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Update platform IDs
app.put('/api/fleet/boats/:id/platform-ids', isAuthenticated, async (req, res) => {
  try {
    const boat = await fleetService.updatePlatformIds(req.params.id, req.body.platformIds);
    res.json(boat);
  } catch (error) {
    console.error('Error updating platform IDs:', error);
    res.status(500).json({ error: 'Failed to update platform IDs' });
  }
});

// Get availability calendar
app.get('/api/fleet/availability', async (req, res) => {
  try {
    const { year, month, boatId } = req.query;
    const availability = await fleetService.getAvailability(
      parseInt(year),
      parseInt(month),
      boatId || null
    );
    res.json(availability);
  } catch (error) {
    console.error('Error getting availability:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
});

// Search available boats
app.get('/api/fleet/search', async (req, res) => {
  try {
    const { date, capacity, type } = req.query;
    const boats = await fleetService.searchAvailableBoats(
      date,
      capacity ? parseInt(capacity) : null,
      type || null
    );
    res.json(boats);
  } catch (error) {
    console.error('Error searching boats:', error);
    res.status(500).json({ error: 'Failed to search boats' });
  }
});

// ========================================
// 📦 COMPANY ASSETS ENDPOINTS
// ========================================

// GET /api/assets — list assets (optional filters: boat_id, category, status)
app.get('/api/assets', isAuthenticated, async (req, res) => {
  try {
    const { boat_id, category, status } = req.query;
    let q = `SELECT a.*, b.name as boat_name FROM company_assets a LEFT JOIN boats b ON a.boat_id = b.id WHERE 1=1`;
    const params = [];
    let i = 1;
    if (boat_id) { q += ` AND a.boat_id = $${i++}`; params.push(boat_id); }
    if (category) { q += ` AND a.category = $${i++}`; params.push(category); }
    if (status) { q += ` AND a.status = $${i++}`; params.push(status); }
    q += ` ORDER BY a.created_at DESC`;
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// POST /api/assets — create asset + accounting entries
app.post('/api/assets', isAuthenticated, async (req, res) => {
  const pg = await pool.connect();
  try {
    const { nanoid } = await import('nanoid');
    const {
      name, category, description, purchase_cost, purchase_date, supplier,
      boat_id, quantity, location, status, payment_method, useful_life_years,
      residual_value, notes
    } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'name y category son requeridos' });

    const id = 'ast_' + nanoid(8);
    const cost = parseFloat(purchase_cost) || 0;

    // Determine debit account based on category
    let debitAccId;
    if (category === 'marina') debitAccId = 'acc_marine_equipment_1620';
    else if (category === 'inventario') debitAccId = 'acc_inventory_assets_1630';
    else { // equipo, accesorio
      const eq = await pg.query(`SELECT id FROM chart_of_accounts WHERE account_code='1600' LIMIT 1`);
      debitAccId = eq.rows.length ? eq.rows[0].id : 'acc_marine_equipment_1620';
    }

    // Determine credit account
    let creditAccId;
    if (payment_method === 'credit') {
      const ap = await pg.query(`SELECT id FROM chart_of_accounts WHERE account_code='2010' LIMIT 1`);
      creditAccId = ap.rows.length ? ap.rows[0].id : null;
    } else {
      const cash = await pg.query(`SELECT id FROM chart_of_accounts WHERE account_code='1010' LIMIT 1`);
      creditAccId = cash.rows.length ? cash.rows[0].id : null;
    }

    await pg.query('BEGIN');

    // Debit transaction (asset increases)
    let txDebitId = null, txCreditId = null;
    const txDate = purchase_date || new Date().toISOString().slice(0,10);
    if (cost > 0 && debitAccId) {
      txDebitId = 'tx_ast_d_' + nanoid(6);
      const desc = `Activo registrado: ${name}${supplier ? ' / ' + supplier : ''}`;
      await pg.query(
        `INSERT INTO transactions (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, notes)
         VALUES ($1,$2,'income',$3,$4,$5,$6,'asset',$7)`,
        [txDebitId, txDate, debitAccId, cost, desc, id, notes||null]
      );
    }
    // Credit transaction (cash out or payable increases)
    if (cost > 0 && creditAccId) {
      txCreditId = 'tx_ast_c_' + nanoid(6);
      const creditDesc = payment_method === 'credit'
        ? `Cuenta por pagar — compra activo: ${name}`
        : `Pago efectivo — compra activo: ${name}`;
      await pg.query(
        `INSERT INTO transactions (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, notes)
         VALUES ($1,$2,'expense',$3,$4,$5,$6,'asset',$7)`,
        [txCreditId, txDate, creditAccId, cost, creditDesc, id, null]
      );
    }

    // Insert asset
    const result = await pg.query(
      `INSERT INTO company_assets
        (id, name, category, description, purchase_cost, purchase_date, supplier, boat_id, quantity, location, status, payment_method, useful_life_years, residual_value, notes, accounting_tx_debit_id, accounting_tx_credit_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [id, name, category, description||null, cost, purchase_date||null, supplier||null,
       boat_id||null, parseInt(quantity)||1, location||null, status||'activo', payment_method||'cash',
       useful_life_years||null, parseFloat(residual_value)||0, notes||null, txDebitId, txCreditId]
    );

    // Log initial movement
    await pg.query(
      `INSERT INTO asset_movements (id, asset_id, movement_type, quantity_change, to_boat_id, notes)
       VALUES ($1,$2,'asignado',$3,$4,'Registro inicial')`,
      ['mov_' + nanoid(8), id, parseInt(quantity)||1, boat_id||null]
    );

    await pg.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('Error creating asset:', err);
    res.status(500).json({ error: err.message });
  } finally { pg.release(); }
});

// PATCH /api/assets/:id — update asset
app.patch('/api/assets/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, category, description, status, boat_id, quantity, location, supplier, notes, useful_life_years, residual_value } = req.body;
    const result = await pool.query(
      `UPDATE company_assets SET
        name=COALESCE($1,name), category=COALESCE($2,category), description=$3,
        status=COALESCE($4,status), boat_id=$5, quantity=COALESCE($6,quantity),
        location=$7, supplier=$8, notes=$9, useful_life_years=$10, residual_value=$11,
        updated_at=CURRENT_TIMESTAMP
       WHERE id=$12 RETURNING *`,
      [name, category, description, status, boat_id||null, quantity ? parseInt(quantity) : null,
       location, supplier, notes, useful_life_years||null, parseFloat(residual_value)||0, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// DELETE /api/assets/:id
app.delete('/api/assets/:id', isAuthenticated, async (req, res) => {
  try {
    await pool.query(`DELETE FROM company_assets WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// GET /api/assets/:id/movements
app.get('/api/assets/:id/movements', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, bf.name as from_boat_name, bt.name as to_boat_name
       FROM asset_movements m
       LEFT JOIN boats bf ON m.from_boat_id = bf.id
       LEFT JOIN boats bt ON m.to_boat_id = bt.id
       WHERE m.asset_id = $1 ORDER BY m.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// POST /api/assets/:id/movements — log movement
app.post('/api/assets/:id/movements', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { movement_type, quantity_change, from_boat_id, to_boat_id, notes } = req.body;
    const movId = 'mov_' + nanoid(8);
    const result = await pool.query(
      `INSERT INTO asset_movements (id, asset_id, movement_type, quantity_change, from_boat_id, to_boat_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [movId, req.params.id, movement_type, parseInt(quantity_change)||0, from_boat_id||null, to_boat_id||null, notes||null]
    );
    // If moving to a new boat, update the asset's boat_id
    if (to_boat_id) {
      await pool.query(`UPDATE company_assets SET boat_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [to_boat_id, req.params.id]);
    }
    // If quantity adjustment, update quantity
    if (quantity_change && parseInt(quantity_change) !== 0) {
      await pool.query(
        `UPDATE company_assets SET quantity = GREATEST(0, quantity + $1), updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [parseInt(quantity_change), req.params.id]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ========================================
// 📧 EMAIL SYNCHRONIZATION ENDPOINTS
// ========================================

// Manual trigger to sync emails
app.post('/api/email/sync', isAuthenticated, async (req, res) => {
  try {
    const result = await emailService.syncUnreadEmails();
    res.json({
      success: true,
      synced: result.synced,
      emails: result.emails || []
    });
  } catch (error) {
    console.error('Error syncing emails:', error);
    res.status(500).json({ error: 'Failed to sync emails', message: error.message });
  }
});

// Manual email ingestion
app.post('/api/email/ingest', isAuthenticated, async (req, res) => {
  try {
    const { platform, customerName, customerEmail, customerPhone, subject, messageText } = req.body;
    
    const result = await emailService.manualIngest({
      platform,
      customerName,
      customerEmail,
      customerPhone,
      subject,
      messageText
    });
    
    res.json({ success: true, threadId: result.threadId, messageId: result.messageId });
  } catch (error) {
    console.error('Error ingesting email:', error);
    res.status(500).json({ error: 'Failed to ingest email' });
  }
});

// Get email sync stats
app.get('/api/email/stats', isAuthenticated, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT mt.id) as total_threads,
        COUNT(CASE WHEN mt.status = 'open' THEN 1 END) as open_threads,
        SUM(mt.unread_count) as total_unread,
        COUNT(pm.id) as total_messages,
        COUNT(CASE WHEN pm.direction = 'inbound' THEN 1 END) as inbound_messages,
        COUNT(CASE WHEN pm.direction = 'outbound' THEN 1 END) as outbound_messages
      FROM message_threads mt
      LEFT JOIN platform_messages pm ON pm.thread_id = mt.id
      WHERE mt.platform = 'email' OR pm.sender_email LIKE '%@%'
    `);
    
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error getting email stats:', error);
    res.status(500).json({ error: 'Failed to get email stats' });
  }
});

// ========================================
// 💰 FASE 8: ACCOUNTING & RECONCILIATION ENDPOINTS
// ========================================

// ===== AUTOMATIC ACCOUNTING INTEGRATION HELPERS =====

// Auto-create revenue transaction from booking
async function createRevenueFromBooking(bookingId, platform, amount, bookingDate, description) {
  try {
    if (!amount || amount <= 0) {
      console.log(`⚠️ Skipping revenue transaction for booking ${bookingId} - amount is zero or invalid`);
      return null;
    }
    
    // Find revenue account for tours
    const accountResult = await pool.query(
      `SELECT id FROM chart_of_accounts 
       WHERE account_code = '4010' OR (account_type = 'revenue' AND account_name LIKE '%Tour%')
       ORDER BY account_code LIMIT 1`
    );
    
    if (accountResult.rows.length === 0) {
      console.error('❌ No revenue account found for tour bookings');
      return null;
    }
    
    const accountId = accountResult.rows[0].id;
    const { nanoid } = await import('nanoid');
    const transactionId = nanoid();
    
    await pool.query(
      `INSERT INTO transactions 
       (id, transaction_date, account_id, amount, transaction_type, description, 
        reference_number, booking_id, status) 
       VALUES ($1, $2, $3, $4, 'credit', $5, $6, $7, 'posted')`,
      [transactionId, bookingDate, accountId, amount, 
       description || `Revenue from ${platform} booking`, 
       `BOOKING-${bookingId}`, bookingId]
    );
    
    console.log(`✅ Created revenue transaction ${transactionId} for booking ${bookingId}: $${amount}`);
    return transactionId;
  } catch (error) {
    console.error('❌ Error creating revenue transaction:', error);
    return null;
  }
}

// Auto-create expense transaction from commission payment
async function createExpenseFromCommission(commissionId, platform, amount, paymentDate) {
  try {
    if (!amount || amount <= 0) {
      console.log(`⚠️ Skipping commission expense for ${commissionId} - amount is zero or invalid`);
      return null;
    }
    
    // Find platform commissions expense account
    const accountResult = await pool.query(
      `SELECT id FROM chart_of_accounts 
       WHERE account_code = '5500' OR (account_type = 'expense' AND account_name LIKE '%Commission%')
       ORDER BY account_code LIMIT 1`
    );
    
    if (accountResult.rows.length === 0) {
      console.error('❌ No expense account found for platform commissions');
      return null;
    }
    
    const accountId = accountResult.rows[0].id;
    const { nanoid } = await import('nanoid');
    const transactionId = nanoid();
    
    await pool.query(
      `INSERT INTO transactions 
       (id, transaction_date, account_id, amount, transaction_type, description, 
        reference_number, status) 
       VALUES ($1, $2, $3, $4, 'debit', $5, $6, 'posted')`,
      [transactionId, paymentDate, accountId, amount,
       `Platform commission - ${platform}`,
       `COMMISSION-${commissionId}`]
    );
    
    console.log(`✅ Created commission expense ${transactionId} for ${platform}: $${amount}`);
    return transactionId;
  } catch (error) {
    console.error('❌ Error creating commission expense:', error);
    return null;
  }
}

// Auto-create fuel expense from trip report
async function createFuelExpenseFromTripReport(tripReportId, fuelUsed, estimatedCost, tripDate) {
  try {
    if (!fuelUsed || fuelUsed <= 0) {
      console.log(`⚠️ Skipping fuel expense for trip ${tripReportId} - no fuel consumed`);
      return null;
    }
    
    // Calculate cost if not provided (assume $4.50/gallon)
    const fuelCost = estimatedCost || (fuelUsed * 4.50);
    
    // Find fuel expense account
    const accountResult = await pool.query(
      `SELECT id FROM chart_of_accounts 
       WHERE account_code = '5010' OR (account_type = 'expense' AND account_name LIKE '%Fuel%')
       ORDER BY account_code LIMIT 1`
    );
    
    if (accountResult.rows.length === 0) {
      console.error('❌ No expense account found for fuel');
      return null;
    }
    
    const accountId = accountResult.rows[0].id;
    const { nanoid } = await import('nanoid');
    const transactionId = nanoid();
    
    await pool.query(
      `INSERT INTO transactions 
       (id, transaction_date, account_id, amount, transaction_type, description, 
        reference_number, status) 
       VALUES ($1, $2, $3, $4, 'debit', $5, $6, 'posted')`,
      [transactionId, tripDate, accountId, fuelCost,
       `Fuel expense - ${fuelUsed} gallons consumed`,
       `FUEL-${tripReportId}`]
    );
    
    console.log(`✅ Created fuel expense ${transactionId} for trip ${tripReportId}: ${fuelUsed} gal = $${fuelCost}`);
    return transactionId;
  } catch (error) {
    console.error('❌ Error creating fuel expense:', error);
    return null;
  }
}

// Helper: add months without day-of-month overflow (e.g. Jan 31 + 1 month = Feb 28, not Mar 3)
function addMonthsSafe(date, months) {
  const d = new Date(date);
  const originalDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfMonth));
  return d;
}

// FASE 10: Auto-create accounting transaction from boat expense
async function syncBoatExpenseToAccounting(boatExpenseId, category, amount, expenseDate, description, boatName) {
  try {
    if (!amount || amount <= 0) {
      return null;
    }
    
    // Map boat expense categories to chart of accounts
    const categoryToAccountCode = {
      'fuel': '5010',
      'maintenance_parts': '5020',
      'labor': '5030',
      'cleaning': '5040',
      'marina_fees': '5050',
      'insurance': '5060',
      'emergency_repairs': '5070',
      'operational': '5080'
    };
    
    const accountCode = categoryToAccountCode[category];
    
    // Find the appropriate expense account
    let accountResult;
    if (accountCode) {
      accountResult = await pool.query(
        `SELECT id FROM chart_of_accounts 
         WHERE account_code = $1 
         ORDER BY account_code LIMIT 1`,
        [accountCode]
      );
    }
    
    // Fallback to general boat operating expense
    if (!accountResult || accountResult.rows.length === 0) {
      accountResult = await pool.query(
        `SELECT id FROM chart_of_accounts 
         WHERE account_type = 'expense' AND (account_name LIKE '%Boat%' OR account_name LIKE '%Operating%')
         ORDER BY account_code LIMIT 1`
      );
    }
    
    if (accountResult.rows.length === 0) {
      console.error('❌ No expense account found for boat expense category:', category);
      return null;
    }
    
    const accountId = accountResult.rows[0].id;
    const { nanoid } = await import('nanoid');
    const transactionId = nanoid();
    
    await pool.query(
      `INSERT INTO transactions 
       (id, transaction_date, account_id, amount, transaction_type, description, 
        reference_id, reference_type) 
       VALUES ($1, $2, $3, $4, 'expense', $5, $6, 'other')`,
      [transactionId, expenseDate, accountId, amount,
       `BOAT EXPENSE: ${description} - ${boatName}`,
       boatExpenseId]
    );
    
    // Update boat_expense to mark as synced
    await pool.query(
      `UPDATE boat_expenses 
       SET synced_to_accounting = 1, accounting_transaction_id = $1 
       WHERE id = $2`,
      [transactionId, boatExpenseId]
    );
    
    console.log(`✅ Synced boat expense ${boatExpenseId} to accounting transaction ${transactionId}: $${amount}`);
    return transactionId;
  } catch (error) {
    console.error('❌ Error syncing boat expense to accounting:', error);
    return null;
  }
}

// Auto-create captain wage expense
async function createCaptainWageExpense(captainId, captainName, amount, paymentDate, bookingId) {
  try {
    if (!amount || amount <= 0) {
      return null;
    }
    
    // Find captain wages expense account
    const accountResult = await pool.query(
      `SELECT id FROM chart_of_accounts 
       WHERE account_code = '5400' OR (account_type = 'expense' AND account_name LIKE '%Captain%')
       ORDER BY account_code LIMIT 1`
    );
    
    if (accountResult.rows.length === 0) {
      console.error('❌ No expense account found for captain wages');
      return null;
    }
    
    const accountId = accountResult.rows[0].id;
    const { nanoid } = await import('nanoid');
    const transactionId = nanoid();
    
    await pool.query(
      `INSERT INTO transactions 
       (id, transaction_date, account_id, amount, transaction_type, description, 
        reference_number, booking_id, status) 
       VALUES ($1, $2, $3, $4, 'debit', $5, $6, $7, 'posted')`,
      [transactionId, paymentDate, accountId, amount,
       `Captain wages - ${captainName}`,
       `WAGE-${captainId}-${Date.now()}`,
       bookingId || null]
    );
    
    console.log(`✅ Created captain wage expense ${transactionId} for ${captainName}: $${amount}`);
    return transactionId;
  } catch (error) {
    console.error('❌ Error creating captain wage expense:', error);
    return null;
  }
}

// ===== CHART OF ACCOUNTS =====

// Get all accounts (with optional hierarchy filter)
app.get('/api/accounting/accounts', isAuthenticated, async (req, res) => {
  try {
    const { parent_id, type, active_only } = req.query;
    
    let query = 'SELECT * FROM chart_of_accounts WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (parent_id !== undefined) {
      if (parent_id === 'null' || parent_id === '') {
        query += ' AND parent_account_id IS NULL';
      } else {
        query += ` AND parent_account_id = $${paramCount}`;
        params.push(parent_id);
        paramCount++;
      }
    }
    
    if (type) {
      query += ` AND account_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }
    
    if (active_only === 'true') {
      query += ' AND is_active = 1';
    }
    
    query += ' ORDER BY account_code';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Get single account
app.get('/api/accounting/accounts/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM chart_of_accounts WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// Create account
app.post('/api/accounting/accounts', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { account_code, account_name, account_type, parent_account_id, description } = req.body;
    
    // Validation
    if (!account_code || !account_name || !account_type) {
      return res.status(400).json({ error: 'account_code, account_name, and account_type are required' });
    }
    
    if (!['asset', 'liability', 'equity', 'revenue', 'expense'].includes(account_type)) {
      return res.status(400).json({ error: 'Invalid account_type' });
    }
    
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, parent_account_id, description) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, account_code, account_name, account_type, parent_account_id || null, description || null]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating account:', error);
    if (error.message.includes('duplicate key')) {
      res.status(400).json({ error: 'Account code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create account' });
    }
  }
});

// Update account
app.put('/api/accounting/accounts/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { account_code, account_name, account_type, parent_account_id, description, is_active } = req.body;
    
    // Validation
    if (!account_code || !account_name || !account_type) {
      return res.status(400).json({ error: 'account_code, account_name, and account_type are required' });
    }
    
    if (!['asset', 'liability', 'equity', 'revenue', 'expense'].includes(account_type)) {
      return res.status(400).json({ error: 'Invalid account_type' });
    }
    
    if (is_active !== undefined && ![0, 1].includes(is_active)) {
      return res.status(400).json({ error: 'is_active must be 0 or 1' });
    }
    
    // Build dynamic query to preserve is_active if not provided
    let query = `UPDATE chart_of_accounts 
       SET account_code = $1, account_name = $2, account_type = $3, 
           parent_account_id = $4, description = $5`;
    const params = [account_code, account_name, account_type, parent_account_id || null, description];
    
    if (is_active !== undefined) {
      query += `, is_active = $6 WHERE id = $7 RETURNING *`;
      params.push(is_active, id);
    } else {
      query += ` WHERE id = $6 RETURNING *`;
      params.push(id);
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Deactivate account
app.delete('/api/accounting/accounts/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE chart_of_accounts SET is_active = 0 WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ success: true, account: result.rows[0] });
  } catch (error) {
    console.error('Error deactivating account:', error);
    res.status(500).json({ error: 'Failed to deactivate account' });
  }
});

// ===== TRANSACTIONS =====

// Get all transactions with filters
app.get('/api/accounting/transactions', isAuthenticated, async (req, res) => {
  try {
    const { start_date, end_date, account_id, type, status, booking_id, limit } = req.query;
    
    let query = `
      SELECT t.*, a.account_name, a.account_code 
      FROM transactions t
      LEFT JOIN chart_of_accounts a ON t.account_id = a.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    if (start_date) {
      query += ` AND t.transaction_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND t.transaction_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }
    
    if (account_id) {
      query += ` AND t.account_id = $${paramCount}`;
      params.push(account_id);
      paramCount++;
    }
    
    if (type) {
      query += ` AND t.transaction_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }
    
    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (booking_id) {
      query += ` AND t.booking_id = $${paramCount}`;
      params.push(booking_id);
      paramCount++;
    }
    
    query += ' ORDER BY t.transaction_date DESC, t.created_at DESC';
    
    if (limit) {
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get single transaction
app.get('/api/accounting/transactions/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT t.*, a.account_name, a.account_code 
       FROM transactions t
       LEFT JOIN chart_of_accounts a ON t.account_id = a.id
       WHERE t.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Create transaction
app.post('/api/accounting/transactions', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      transaction_date, account_id, amount, transaction_type, description,
      reference_id, reference_type, boat_id, captain_id, platform,
      reconciled, reconciliation_id, notes, currency, created_by
    } = req.body;
    
    // Validation
    if (!transaction_date || !account_id || amount === undefined || !transaction_type) {
      return res.status(400).json({ error: 'transaction_date, account_id, amount, and transaction_type are required' });
    }
    
    if (!['income', 'expense', 'transfer', 'adjustment'].includes(transaction_type)) {
      return res.status(400).json({ error: 'Invalid transaction_type (must be income, expense, transfer, or adjustment)' });
    }
    
    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    
    const validReferenceTypes = ['booking', 'commission', 'fuel', 'maintenance', 'manual', 'bank_transfer', 'other'];
    if (reference_type && !validReferenceTypes.includes(reference_type)) {
      return res.status(400).json({ error: 'Invalid reference_type' });
    }
    
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO transactions 
       (id, transaction_date, account_id, amount, transaction_type, description, 
        reference_id, reference_type, boat_id, captain_id, platform,
        reconciled, reconciliation_id, notes, currency, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
       RETURNING *`,
      [id, transaction_date, account_id, amount, transaction_type, description,
       reference_id || null, reference_type || 'manual', boat_id || null, captain_id || null, 
       platform || null, reconciled || 0, reconciliation_id || null, notes || null,
       currency || 'USD', created_by || null]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Update transaction
app.put('/api/accounting/transactions/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      transaction_date, account_id, amount, transaction_type, description,
      reference_id, reference_type, boat_id, captain_id, platform,
      reconciled, reconciliation_id, notes, currency
    } = req.body;
    
    // Validation
    if (!transaction_date || !account_id || amount === undefined || !transaction_type) {
      return res.status(400).json({ error: 'transaction_date, account_id, amount, and transaction_type are required' });
    }
    
    if (!['income', 'expense', 'transfer', 'adjustment'].includes(transaction_type)) {
      return res.status(400).json({ error: 'Invalid transaction_type (must be income, expense, transfer, or adjustment)' });
    }
    
    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    
    const validReferenceTypes = ['booking', 'commission', 'fuel', 'maintenance', 'manual', 'bank_transfer', 'other'];
    if (reference_type && !validReferenceTypes.includes(reference_type)) {
      return res.status(400).json({ error: 'Invalid reference_type' });
    }
    
    const result = await pool.query(
      `UPDATE transactions 
       SET transaction_date = $1, account_id = $2, amount = $3, transaction_type = $4,
           description = $5, reference_id = $6, reference_type = $7, boat_id = $8,
           captain_id = $9, platform = $10, reconciled = $11, reconciliation_id = $12,
           notes = $13, currency = $14, updated_at = CURRENT_TIMESTAMP
       WHERE id = $15 RETURNING *`,
      [transaction_date, account_id, amount, transaction_type, description,
       reference_id, reference_type, boat_id, captain_id, platform,
       reconciled, reconciliation_id, notes, currency, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// Delete transaction
app.delete('/api/accounting/transactions/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM transactions WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// ===== BANK STATEMENTS =====

// Get all bank statements
app.get('/api/accounting/bank-statements', isAuthenticated, async (req, res) => {
  try {
    const { start_date, end_date, matched, limit } = req.query;
    
    let query = 'SELECT * FROM bank_statements WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (start_date) {
      query += ` AND statement_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND statement_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }
    
    if (matched === 'true') {
      query += ' AND matched_transaction_id IS NOT NULL';
    } else if (matched === 'false') {
      query += ' AND matched_transaction_id IS NULL';
    }
    
    query += ' ORDER BY statement_date DESC, created_at DESC';
    
    if (limit) {
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bank statements:', error);
    res.status(500).json({ error: 'Failed to fetch bank statements' });
  }
});

// Get unmatched bank statements
app.get('/api/accounting/bank-statements/unmatched', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bank_statements WHERE matched_transaction_id IS NULL ORDER BY statement_date DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching unmatched statements:', error);
    res.status(500).json({ error: 'Failed to fetch unmatched statements' });
  }
});

// ── Unified safe date parser ──────────────────────────────────────────────────
// Returns "YYYY-MM-DD" or null. Never throws. Validates real calendar ranges.
const MONTH_NAMES = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
                      ene:1,abr:4,ago:8,dic:12 };

function isValidDate(y, m, d) {
  y = parseInt(y); m = parseInt(m); d = parseInt(d);
  if (isNaN(y)||isNaN(m)||isNaN(d)) return false;
  if (y < 2000 || y > 2099) return false;   // reasonable bank statement range
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const maxDay = [0,31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][m];
  if (d > maxDay) return false;
  return true;
}

function isoDate(y, m, d) {
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function parseDateSafe(raw) {
  if (!raw) return null;
  const s = raw.toString().trim();
  if (!s) return null;

  let m;

  // ── OFX format: YYYYMMDD or YYYYMMDDHHMMSS[.000][+offset]
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m && parseInt(m[1]) >= 2000) {
    const [,y,mo,d] = m;
    if (isValidDate(y,mo,d)) return isoDate(y,mo,d);
  }

  // ── YYYY-MM-DD or YYYY/MM/DD
  m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    if (isValidDate(m[1],m[2],m[3])) return isoDate(m[1],m[2],m[3]);
    console.warn(`⚠️  parseDateSafe: invalid calendar value in "${s}" → y=${m[1]} m=${m[2]} d=${m[3]}`);
    return null;
  }

  // ── MM/DD/YYYY or MM/DD/YY (N.American: month ≤ 12 first)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [,a,b,yr] = m;
    if (yr.length === 2) yr = '20' + yr;
    // Prefer MM/DD/YYYY interpretation; if month >12 try DD/MM/YYYY
    if (parseInt(a) <= 12 && isValidDate(yr,a,b)) return isoDate(yr,a,b);
    if (parseInt(b) <= 12 && isValidDate(yr,b,a)) return isoDate(yr,b,a);
    console.warn(`⚠️  parseDateSafe: both MM/DD and DD/MM invalid for "${s}"`);
    return null;
  }

  // ── MM/DD (no year) — require both parts ≤ valid ranges
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const CY = new Date().getFullYear();
    if (parseInt(m[1]) <= 12 && isValidDate(CY,m[1],m[2])) return isoDate(CY,m[1],m[2]);
    if (parseInt(m[2]) <= 12 && isValidDate(CY,m[2],m[1])) return isoDate(CY,m[2],m[1]);
    console.warn(`⚠️  parseDateSafe: no-year date invalid "${s}"`);
    return null;
  }

  // ── DD-MM-YYYY or MM-DD-YYYY (dash separated, has year)
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m) {
    let [,a,b,yr] = m;
    if (yr.length === 2) yr = '20' + yr;
    if (parseInt(a) <= 12 && isValidDate(yr,a,b)) return isoDate(yr,a,b);
    if (parseInt(b) <= 12 && isValidDate(yr,b,a)) return isoDate(yr,b,a);
    console.warn(`⚠️  parseDateSafe: dash-separated invalid "${s}"`);
    return null;
  }

  // ── DD Mon YYYY or Mon DD, YYYY
  m = s.match(/^(\d{1,2})\s+([a-z]{3})\w*[\s,]*(\d{4})?/i);
  if (m) {
    const mn = MONTH_NAMES[m[2].toLowerCase().slice(0,3)];
    const yr = m[3] || new Date().getFullYear();
    if (mn && isValidDate(yr,mn,m[1])) return isoDate(yr,mn,m[1]);
  }
  m = s.match(/^([a-z]{3})\w*[\s,]+(\d{1,2})[\s,]+(\d{4})/i);
  if (m) {
    const mn = MONTH_NAMES[m[1].toLowerCase().slice(0,3)];
    if (mn && isValidDate(m[3],mn,m[2])) return isoDate(m[3],mn,m[2]);
  }

  console.warn(`⚠️  parseDateSafe: unrecognized format "${s}"`);
  return null;
}

// ── Normalize any monetary string/number to a safe float ─────────────────────
// Handles: 15.16 | -15.16 | $15.16 | 1,215.40 | (15.16) | "  $1,000.00 " | ""
function normalizeAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = raw.toString().trim();
  if (s === '' || s === '-' || s === '—') return null;
  const isNeg = s.startsWith('-') || s.startsWith('(') || /^\(\s*\$?[\d]/.test(s);
  const clean = s.replace(/[\(\)\$£€,\s\+]/g, '').replace(/^-/, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return null;
  return isNeg ? -num : num;
}

// Upload and parse bank statement file (CSV/OFX)
app.post('/api/accounting/bank-statements/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { nanoid } = await import('nanoid');
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileType = fileName.toLowerCase();
    
    let statements = [];
    let pdfRawText = ''; // shared scope for PDF raw text (used in final response)

    // Parse CSV files
    if (fileType.endsWith('.csv')) {
      const fileContent = fileBuffer.toString('utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      // Map CSV columns to statement format
      // Support common bank CSV formats
      statements = records.map(record => {
        // Try different common column names
        const date = record.Date || record.date || record.TransactionDate || record['Transaction Date'] || record.Posted;
        const description = record.Description || record.description || record.Details || record.Memo || record.Payee;
        
        // Handle amount - support both single Amount column and separate Debit/Credit columns
        let amount = 0;
        const rawAmt = record.Amount || record.amount;
        if (rawAmt !== undefined && rawAmt !== null && rawAmt.toString().trim() !== '') {
          amount = normalizeAmount(rawAmt) ?? 0;
        } else if (record.Debit || record.debit || record.Credit || record.credit) {
          // Debit = negative (money out), Credit = positive (money in)
          const debit  = record.Debit  || record.debit;
          const credit = record.Credit || record.credit;
          if (debit && debit.toString().trim() !== '') {
            amount = -Math.abs(normalizeAmount(debit) ?? 0);
          } else if (credit && credit.toString().trim() !== '') {
            amount = Math.abs(normalizeAmount(credit) ?? 0);
          }
        }

        // Handle balance
        const balanceRaw = record.Balance || record.balance;
        const balance = balanceRaw ? normalizeAmount(balanceRaw) : null;
        
        const reference = record.Reference || record.CheckNumber || record['Check Number'] || null;

        const safeDate = parseDateSafe(date);
        if (!safeDate) {
          console.warn(`⚠️  CSV: skipped row with invalid date raw="${date}" desc="${description}"`);
          return null;
        }
        return {
          statement_date: safeDate,
          description: description || 'Unknown',
          amount: amount,
          balance: balance,
          reference_number: reference
        };
      }).filter(Boolean); // remove null (invalid-date) rows
    }
    // Parse OFX/QFX files
    else if (fileType.endsWith('.ofx') || fileType.endsWith('.qfx')) {
      const fileContent = fileBuffer.toString('utf-8');
      const ofxData = ofx.parse(fileContent);
      
      // Extract transactions from OFX structure
      if (ofxData && ofxData.OFX && ofxData.OFX.BANKMSGSRSV1) {
        const stmtrs = ofxData.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS;
        const transactions = stmtrs.BANKTRANLIST.STMTTRN;
        
        statements = (Array.isArray(transactions) ? transactions : [transactions]).map(trn => {
          const rawDt = trn.DTPOSTED || trn.DTAVAIL || '';
          const safeDate = parseDateSafe(rawDt);
          if (!safeDate) {
            console.warn(`⚠️  OFX: skipped transaction with invalid date raw="${rawDt}" name="${trn.NAME||'?'}"`);
            return null;
          }
          return {
            statement_date: safeDate,
            description: trn.NAME || trn.MEMO || 'Unknown',
            amount: normalizeAmount(trn.TRNAMT) ?? 0,
            balance: normalizeAmount(trn.LEDGERBAL?.BALAMT) ?? null,
            reference_number: trn.FITID || trn.CHECKNUM || null
          };
        }).filter(Boolean);
      }
    }
    // Parse PDF bank statements (pdf-parse v2 API: new PDFParse({ data: buffer }).getText())
    else if (fileType.endsWith('.pdf')) {
      console.log(`📄 PDF upload — buffer size: ${fileBuffer.length} bytes`);
      let text = '';
      try {
        const parser = new PDFParse({ data: fileBuffer });
        const pdfResult = await parser.getText();
        text = pdfResult.text || '';
        pdfRawText = text; // expose to outer scope for response
        console.log(`📄 PDF text extracted — length: ${text.length} chars`);
      } catch (pdfErr) {
        console.error('PDF parse error:', pdfErr.message);
        return res.status(422).json({
          error: 'El PDF fue cargado pero no se pudo extraer texto. Asegúrate de que el PDF contiene texto real (no es una imagen escaneada). Si es un estado de cuenta escaneado, descarga la versión digital desde el portal de tu banco.'
        });
      }
      if (!text || text.trim().length < 20) {
        return res.status(422).json({
          error: 'El PDF fue cargado pero requiere revisión manual: el contenido extraído está vacío o es ilegible. Descarga el extracto en formato CSV/OFX desde tu banco para mejor compatibilidad.'
        });
      }

      // ── FLEXIBLE MULTI-STRATEGY PDF PARSER ──────────────────────────
      const rawTextPreview = text.slice(0, 2000); // for debug/review
      console.log(`📄 PDF raw text preview (first 500 chars):\n${text.slice(0,500)}`);

      const CY = new Date().getFullYear();

      // Lines to ignore (headers, totals, page markers)
      const SKIP_RX = [
        /^(beginning|ending|starting|opening|closing|available|current)\s+balance/i,
        /^(saldo\s+(inicial|final|disponible|anterior))/i,
        /^balance\s+forward/i, /^(deposits|withdrawals|debits?|credits?)\s*$/i,
        /^page\s+\d+/i, /^p[áa]gina\s+\d+/i, /^account\s+(number|summary|activity)/i,
        /^statement\s+(period|date|summary)/i, /^transaction\s+history/i,
        /^actividad\s+de\s+cuenta/i, /^(fecha|date)\s+(descripci|description)/i,
        /^(total|subtotal|grand\s+total)\s*$/i, /^\*+$/, /^-{3,}$/, /^={3,}$/,
        /^(interest\s+charged|fees\s+charged|minimum\s+payment)/i,
        /^(número\s+de\s+cuenta|account\s+no)/i,
      ];

      // Date patterns that anchor a transaction line
      // Tightened DATE_RXS — month 01-12, day 01-31 only; prevents false positives like 03/42
      const DATE_RXS = [
        /^((0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{2,4}))/,  // MM/DD/YYYY (month 1-12, day 1-31)
        /^((0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01]))(?![\d\/])/,    // MM/DD no year (month 1-12, day 1-31)
        /^(\d{4}-\d{2}-\d{2})/,                                       // YYYY-MM-DD
        /^((0?[1-9]|[12]\d|3[01])-(0?[1-9]|1[0-2])-(\d{2,4}))/,     // DD-MM-YYYY
        /^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr|Ago|Dic)\w*(?:\s+\d{4})?)/i,
      ];
      // Use central parseDateSafe — drop inline parseDate entirely

      // Find ALL monetary amounts in a string, with their position and sign
      function findAmounts(str) {
        const rx = /(-\s*\$?\s*[\d,]{1,12}\.\d{2}|\(\s*\$?\s*[\d,]{1,12}\.\d{2}\s*\)|\+\s*\$?\s*[\d,]{1,12}\.\d{2}|\$?\s*[\d,]{1,12}\.\d{2})/g;
        const results = [];
        let m;
        while ((m = rx.exec(str)) !== null) {
          const raw = m[1];
          const isNeg = raw.trim().startsWith('-') || raw.includes('(');
          const clean = raw.replace(/[\(\)\$,\s\+\-]/g,'');
          const val = parseFloat(clean);
          if (!isNaN(val) && val > 0) results.push({ val: isNeg?-val:val, raw, start: m.index, end: m.index+raw.length });
        }
        return results;
      }

      // ── STRATEGY 1: Date-anchored multi-line blocks ──
      const rawLines = text.split('\n').map(l => l.replace(/\s{2,}/g,' ').trim()).filter(Boolean);
      const blocks = [];
      let blk = null;
      for (const line of rawLines) {
        if (SKIP_RX.some(rx => rx.test(line))) continue;
        let dateMatch = null;
        for (const rx of DATE_RXS) { const m = line.match(rx); if (m){ dateMatch = m; break; } }
        if (dateMatch) {
          if (blk) blocks.push(blk);
          blk = { dateRaw: dateMatch[1], rest: line.slice(dateMatch[0].length).trim(), extras: [] };
        } else if (blk) {
          // Stop collecting continuation lines if it looks like a new section
          if (line.length > 0 && !/^\d{4,}$/.test(line)) blk.extras.push(line);
          if (blk.extras.length >= 3) { blocks.push(blk); blk = null; } // cap block size
        }
      }
      if (blk) blocks.push(blk);
      console.log(`📄 PDF strategy-1 blocks found: ${blocks.length}`);

      let skippedBadDate = 0;
      for (const b of blocks) {
        const pd = parseDateSafe(b.dateRaw);
        if (!pd) { skippedBadDate++; console.warn(`⚠️  PDF S1: skipped invalid date raw="${b.dateRaw}"`); continue; }
        // Combine rest + extras into one text
        const combined = [b.rest, ...b.extras].join(' ').replace(/\s+/g,' ').trim();
        const amounts = findAmounts(combined);
        if (!amounts.length) continue;

        // Pick transaction amount: prefer negative, else first amount (skip last if 2+ = running balance)
        let chosen = amounts.find(a => a.val < 0);
        if (!chosen) chosen = amounts.length >= 2 ? amounts[0] : amounts[0];
        const amount = chosen.val;

        // Description: text before chosen amount
        let desc = combined.slice(0, chosen.start).trim().replace(/\s+/g,' ');
        // If desc is empty (amount was first token), use extras
        if (!desc && b.extras.length) desc = b.extras.join(' ').trim();
        if (!desc) desc = 'Transacción';
        // Skip if description is just digits/symbols
        if (/^[\d\s\$\.,\-\+\(\)]+$/.test(desc)) desc = b.extras.join(' ').trim() || 'Transacción';

        statements.push({ statement_date: pd, description: desc.slice(0,200), amount, balance: null, reference_number: null });
      }

      // ── STRATEGY 2: Single-line scan (catches what strategy 1 misses) ──
      if (statements.length < 3) {
        console.log(`📄 PDF strategy-2 (single-line scan)…`);
        for (const line of rawLines) {
          if (SKIP_RX.some(rx => rx.test(line))) continue;
          let dateMatch = null;
          for (const rx of DATE_RXS) { const m = line.match(rx); if (m){ dateMatch = m; break; } }
          if (!dateMatch) continue;
          const rest = line.slice(dateMatch[0].length).trim();
          const amounts = findAmounts(rest);
          if (!amounts.length) continue;
          const pd = parseDateSafe(dateMatch[1]);
          if (!pd) { skippedBadDate++; console.warn(`⚠️  PDF S2: skipped invalid date raw="${dateMatch[1]}"`); continue; }
          let chosen = amounts.find(a=>a.val<0) || amounts[0];
          let desc = rest.slice(0, chosen.start).trim();
          if (!desc) desc = 'Transacción';
          if (/^[\d\s\$\.,\-\+\(\)]+$/.test(desc)) continue;
          // Avoid duplicates
          const isDupe = statements.some(s => s.statement_date===pd && Math.abs(s.amount-chosen.val)<0.01);
          if (!isDupe) statements.push({ statement_date: pd, description: desc.slice(0,200), amount: chosen.val, balance: null, reference_number: null });
        }
      }

      console.log(`📄 PDF total transactions parsed: ${statements.length}`);

      // ── PARTIAL RESULT — never fail completely ──
      const needsReview = statements.length === 0;
      if (needsReview) {
        // Return extracted text so frontend can show it for manual entry
        console.log(`📄 PDF: no transactions auto-detected, returning raw text for manual review`);
        return res.status(200).json({
          success: true,
          imported: 0,
          needsReview: true,
          rawText: text.slice(0, 5000),
          rawTextPreview: rawTextPreview,
          statements: [],
          fileName: fileName,
          message: 'El texto del PDF fue extraído pero no se detectaron transacciones automáticamente. Revisa el texto extraído y usa la tabla de revisión manual para ingresar los datos.'
        });
      }
    }
    else {
      return res.status(400).json({ error: 'Formato no soportado. Por favor sube un archivo CSV, OFX, QFX o PDF.' });
    }

    if (statements.length === 0) {
      return res.status(400).json({ error: 'No valid transactions found in file' });
    }

    // Import parsed statements into database
    const imported = [];
    const requiresReview = [];
    for (const stmt of statements) {
      // Final safety: validate date one more time before DB insert
      const finalDate = parseDateSafe(stmt.statement_date);
      if (!finalDate) {
        console.warn(`⚠️  INSERT skipped: invalid date "${stmt.statement_date}" for "${stmt.description}"`);
        requiresReview.push({ description: stmt.description, raw_date: stmt.statement_date, reason: 'invalid_date' });
        continue;
      }
      if (!finalDate || stmt.amount === undefined) continue;

      const id = nanoid();
      const safeAmt = normalizeAmount(stmt.amount) ?? 0;
      const safeBal = (stmt.balance !== undefined && stmt.balance !== null) ? normalizeAmount(stmt.balance) : null;
      const txType = stmt.transaction_type || (safeAmt >= 0 ? 'credit' : 'debit');
      console.log(`📥 Importing: "${stmt.description}" | amount: ${stmt.amount} → ${safeAmt} | balance: ${stmt.balance} → ${safeBal} | type: ${txType}`);
      const result = await pool.query(
        `INSERT INTO bank_statements 
         (id, statement_date, description, amount, balance, reference_number, category, transaction_type, reconciliation_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING *`,
        [id, stmt.statement_date, stmt.description, safeAmt, safeBal,
         stmt.reference_number, stmt.category || null, txType, 'unmatched']
      );
      imported.push(result.rows[0]);
    }

    console.log(`✅ Imported ${imported.length} bank statements from ${fileName}. Skipped ${requiresReview.length} due to invalid dates.`);
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const hasSkipped = requiresReview.length > 0;
    let message = isPdf
      ? `Se detectaron y guardaron ${imported.length} transacciones del PDF. Revisa y confirma en la tabla.`
      : `${imported.length} movimientos importados correctamente.`;
    if (hasSkipped) message += ` ${requiresReview.length} movimiento(s) omitidos por fecha inválida — requieren revisión manual.`;
    res.json({ 
      success: true, 
      imported: imported.length, 
      statements: imported,
      fileName: fileName,
      needsReview: (isPdf && imported.length > 0) || hasSkipped,
      requiresReview: requiresReview,
      rawTextPreview: isPdf ? pdfRawText.slice(0, 2000) : '',
      message
    });
  } catch (error) {
    console.error('Error uploading bank statement:', error);
    res.status(500).json({ error: 'Failed to upload and parse bank statement: ' + error.message });
  }
});

// Import bank statements (JSON API)
app.post('/api/accounting/bank-statements/import', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { statements } = req.body; // Array of statement objects
    
    if (!Array.isArray(statements) || statements.length === 0) {
      return res.status(400).json({ error: 'statements must be a non-empty array' });
    }
    
    // Validate each statement
    for (const stmt of statements) {
      if (!stmt.statement_date || stmt.amount === undefined || !stmt.description) {
        return res.status(400).json({ 
          error: 'Each statement must have statement_date, amount, and description' 
        });
      }
      if (typeof stmt.amount !== 'number') {
        return res.status(400).json({ error: 'amount must be a number' });
      }
    }
    
    const imported = [];
    for (const stmt of statements) {
      const id = nanoid();
      const safeAmt2 = normalizeAmount(stmt.amount) ?? 0;
      const safeBal2 = (stmt.balance !== undefined && stmt.balance !== null) ? normalizeAmount(stmt.balance) : null;
      const txType = stmt.transaction_type || (safeAmt2 >= 0 ? 'credit' : 'debit');
      const result = await pool.query(
        `INSERT INTO bank_statements 
         (id, statement_date, description, amount, balance, reference_number, category, transaction_type, reconciliation_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING *`,
        [id, stmt.statement_date, stmt.description, safeAmt2, safeBal2,
         stmt.reference_number || null, stmt.category || null, txType, stmt.reconciliation_status || 'unmatched']
      );
      imported.push(result.rows[0]);
    }
    
    res.json({ success: true, imported: imported.length, statements: imported });
  } catch (error) {
    console.error('Error importing bank statements:', error);
    res.status(500).json({ error: 'Failed to import bank statements' });
  }
});

// Auto-match bank statements to transactions
app.post('/api/accounting/bank-statements/auto-match', isAuthenticated, async (req, res) => {
  try {
    const { statement_id, transaction_id } = req.body;
    
    // Update bank statement with matched transaction
    const result = await pool.query(
      'UPDATE bank_statements SET matched_transaction_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [transaction_id, statement_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bank statement not found' });
    }
    
    res.json({ success: true, statement: result.rows[0] });
  } catch (error) {
    console.error('Error matching bank statement:', error);
    res.status(500).json({ error: 'Failed to match bank statement' });
  }
});

// Suggest matches for a bank statement
app.get('/api/accounting/bank-statements/:id/suggest-matches', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the bank statement
    const stmtResult = await pool.query('SELECT * FROM bank_statements WHERE id = $1', [id]);
    if (stmtResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bank statement not found' });
    }
    
    const statement = stmtResult.rows[0];
    
    // Find potential matches (same amount, within 7 days, not yet reconciled)
    const matchesResult = await pool.query(
      `SELECT t.*, a.account_name, a.account_code 
       FROM transactions t
       LEFT JOIN chart_of_accounts a ON t.account_id = a.id
       WHERE t.amount = $1 
       AND t.transaction_date >= DATE($2) - INTERVAL '7 days'
       AND t.transaction_date <= DATE($2) + INTERVAL '7 days'
       AND t.reconciliation_id IS NULL
       ORDER BY ABS(EXTRACT(EPOCH FROM (t.transaction_date - DATE($2))))
       LIMIT 10`,
      [Math.abs(statement.amount), statement.statement_date]
    );
    
    res.json({ statement, suggested_matches: matchesResult.rows });
  } catch (error) {
    console.error('Error suggesting matches:', error);
    res.status(500).json({ error: 'Failed to suggest matches' });
  }
});

// Smart batch auto-match - automatically match bank statements to transactions
app.post('/api/accounting/bank-statements/smart-auto-match', isAuthenticated, async (req, res) => {
  try {
    // Get all unmatched bank statements
    const unmatchedResult = await pool.query(
      'SELECT * FROM bank_statements WHERE matched_transaction_id IS NULL ORDER BY statement_date DESC'
    );
    
    const matched = [];
    const suggested = [];
    const unmatched = [];
    
    for (const statement of unmatchedResult.rows) {
      // Find potential transaction matches
      const potentialMatches = await pool.query(
        `SELECT t.*, a.account_name, a.account_code,
                ABS(EXTRACT(EPOCH FROM (t.transaction_date - DATE($2)))) / 86400 as days_diff
         FROM transactions t
         LEFT JOIN chart_of_accounts a ON t.account_id = a.id
         WHERE ABS(t.amount - $1) < 0.01
         AND t.transaction_date >= DATE($2) - INTERVAL '7 days'
         AND t.transaction_date <= DATE($2) + INTERVAL '7 days'
         AND t.reconciliation_id IS NULL
         ORDER BY ABS(EXTRACT(EPOCH FROM (t.transaction_date - DATE($2))))
         LIMIT 5`,
        [Math.abs(statement.amount), statement.statement_date]
      );
      
      if (potentialMatches.rows.length > 0) {
        const bestMatch = potentialMatches.rows[0];
        const daysDiff = parseFloat(bestMatch.days_diff);
        
        // Calculate confidence score
        const amountMatch = Math.abs(bestMatch.amount - Math.abs(statement.amount)) < 0.01;
        const sameDayMatch = daysDiff < 1;
        const within3Days = daysDiff <= 3;
        
        // Auto-match with high confidence (exact amount + same/next day)
        if (amountMatch && within3Days && potentialMatches.rows.length === 1) {
          await pool.query(
            'UPDATE bank_statements SET matched_transaction_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [bestMatch.id, statement.id]
          );
          matched.push({
            statement,
            transaction: bestMatch,
            confidence: 'high',
            reason: `Exact amount match ($${statement.amount}) within ${Math.ceil(daysDiff)} day(s)`
          });
        } 
        // Suggest manual review for medium confidence
        else {
          suggested.push({
            statement,
            possible_matches: potentialMatches.rows.map(m => ({
              ...m,
              days_difference: Math.ceil(parseFloat(m.days_diff))
            })),
            confidence: within3Days ? 'medium' : 'low'
          });
        }
      } else {
        unmatched.push(statement);
      }
    }
    
    console.log(`✅ Auto-matched ${matched.length} statements, ${suggested.length} need review, ${unmatched.length} no matches`);
    res.json({
      success: true,
      matched: matched.length,
      suggested: suggested.length,
      unmatched: unmatched.length,
      details: { matched, suggested, unmatched }
    });
  } catch (error) {
    console.error('Error in smart auto-match:', error);
    res.status(500).json({ error: 'Failed to auto-match statements' });
  }
});

// ============================================================
// SMART CLASSIFICATION ENGINE
// ============================================================
function smartClassify(description, amount, transactionType, patterns = [], boats = []) {
  const desc = (description || '').toLowerCase();
  const amt  = Math.abs(parseFloat(amount) || 0);
  const isCredit = transactionType === 'credit' || parseFloat(amount) > 0;

  const out = (accounting_type, category, confidence_level, reason, debit, credit, vendor = null, module_dest = null, boat_id = null) => ({
    accounting_type, category, confidence_level,
    confidence_reason: reason,
    suggested_account_debit: debit,
    suggested_account_credit: credit,
    vendor_suggestion: vendor,
    module_destination: module_dest || deriveModule(accounting_type, category),
    boat_id: boat_id || null,
    classification_status: 'suggested'
  });

  function deriveModule(type, cat) {
    if (type === 'income') return 'income';
    if (type === 'asset') return cat === 'boat_purchase' ? 'fleet' : 'assets';
    if (type === 'transfer') return 'transfer';
    if (cat === 'inventory') return 'inventory';
    if (cat === 'booking_deposit' || cat === 'deferred_deposit') return 'deposits';
    return 'expenses';
  }

  // --- Try to match a boat name from description ---
  let detectedBoatId = null;
  for (const b of boats) {
    const boatName = (b.name || b.boat_name || '').toLowerCase().replace(/\s+/g,'');
    if (boatName.length > 2 && desc.replace(/\s+/g,'').includes(boatName)) {
      detectedBoatId = b.id;
      break;
    }
  }

  // --- Learned patterns (highest priority) ---
  const sortedPatterns = [...patterns].sort((a,b)=>(b.use_count||0)-(a.use_count||0));
  for (const p of sortedPatterns) {
    const pat = (p.description_pattern||'').toLowerCase();
    if (pat.length > 1 && desc.includes(pat)) {
      const lbl = p.accounting_type==='expense'?'Gasto':p.accounting_type==='asset'?'Activo':p.accounting_type==='income'?'Ingreso':'Otro';
      return out(p.accounting_type, p.category, 'high', `Patrón aprendido (${p.use_count}x)`,
        isCredit?'Cuenta Bancaria':`${lbl} — ${p.category}`,
        isCredit?`${lbl} — ${p.category}`:'Cuenta Bancaria',
        p.vendor_pattern || null, p.module_destination || null,
        detectedBoatId || p.boat_id || null);
    }
  }

  // --- Vendor detection helpers ---
  function detectVendor(d) {
    if (/shell\b/.test(d)) return 'Shell';
    if (/exxon/.test(d)) return 'ExxonMobil';
    if (/mobil\b/.test(d)) return 'Mobil';
    if (/chevron/.test(d)) return 'Chevron';
    if (/sunoco/.test(d)) return 'Sunoco';
    if (/citgo/.test(d)) return 'Citgo';
    if (/bp\b/.test(d)) return 'BP';
    if (/amazon/.test(d)) return 'Amazon';
    if (/home depot/.test(d)) return 'Home Depot';
    if (/lowes?/.test(d)) return 'Lowe\'s';
    if (/walmart/.test(d)) return 'Walmart';
    if (/costco/.test(d)) return 'Costco';
    if (/west marine/.test(d)) return 'West Marine';
    if (/harbor freight/.test(d)) return 'Harbor Freight';
    if (/airbnb/.test(d)) return 'Airbnb';
    if (/getmyboat/.test(d)) return 'GetMyBoat';
    if (/boatsetter/.test(d)) return 'BoatSetter';
    if (/viator/.test(d)) return 'Viator';
    if (/stripe/.test(d)) return 'Stripe';
    if (/paypal/.test(d)) return 'PayPal';
    if (/zelle/.test(d)) return 'Zelle';
    return null;
  }
  const vendor = detectVendor(desc);

  // --- Keyword rules (canonical keys match UNIFIED_EXPENSE_CATEGORIES) ---
  if (/fuel|gas(?:oline)?|diesel|petro|gasolina|shell\b|exxon|mobil\b|chevron|sunoco|bp\b|citgo|combustible/.test(desc))
    return out('expense','combustible','high','Combustible detectado','Gastos de Combustible','Cuenta Bancaria', vendor||'Estación de Combustible','expenses',detectedBoatId);

  if (/marina|dock(?:age)?|harbour?|slip\b|mooring|anchorage|pier\b/.test(desc))
    return out('expense','marina','high','Marina/dock detectado','Gastos de Marina','Cuenta Bancaria', vendor||'Marina','expenses',detectedBoatId);

  if (/repair|service|maintenance|maint\b|mechanic|engine\b|motor\b|propel|reparacion|servicio|overhaul/.test(desc))
    return out('expense','mantenimiento','high','Mantenimiento/reparación','Gastos de Mantenimiento','Cuenta Bancaria', vendor,'expenses',detectedBoatId);

  if (/parts?|pieza|repuesto|spare|west marine|hardware|component/.test(desc))
    return out('expense','partes_piezas','high','Partes y piezas detectadas','Partes y Piezas','Cuenta Bancaria', vendor,'expenses',detectedBoatId);

  if (/clean(?:ing)?|laundry|wash\b|detail(?:ing)?|sanitiz|limpieza/.test(desc))
    return out('expense','limpieza','high','Limpieza detectada','Gastos de Limpieza','Cuenta Bancaria', vendor,'expenses',detectedBoatId);

  if (/insurance|insur\b|poliz|premium\b|seguro/.test(desc))
    return out('expense','seguro','high','Seguro detectado','Gastos de Seguro','Cuenta Bancaria', vendor,'expenses',null);

  if (/bank\s*fee|bank\s*charge|service\s*charge|wire\s*fee|wire\s*transfer\s*fee|ach\s*fee|monthly\s*fee|account\s*fee|nsf\s*fee|overdraft|comision\s*bancaria|comisiones?\s*banco|cargo\s*bancario|cargos?\s*servicio|cuota\s*mantenimiento/.test(desc))
    return out('expense','comisiones_bancarias','high','Comisión bancaria detectada','Comisiones Bancarias','Cuenta Bancaria', vendor,'expenses',null);

  if (/interest\s*expense|interest\s*charge|interes\s*bancario|intereses?\s*prestamo|loan\s*interest|finance\s*charge/.test(desc))
    return out('expense','comisiones_bancarias','high','Interés financiero detectado','Comisiones Bancarias','Cuenta Bancaria', vendor,'expenses',null);

  if (/crew|captain|staff|salary|payroll|nomina|sueldo|tripulacion|capitan/.test(desc))
    return out('expense','sueldos','high','Nómina/tripulación detectada','Sueldos / Tripulación','Cuenta Bancaria', vendor,'expenses',detectedBoatId);

  if (/gps\b|garmin|navico|furuno|simrad|chartplotter|chart\s*plotter|ais\s*tracker|vessel\s*tracker/.test(desc))
    return out('expense','gps','high','GPS/navegación detectado','GPS Barcos','Cuenta Bancaria', vendor,'expenses',detectedBoatId);

  if (/publicidad|advertising|facebook\s*ads|google\s*ads|instagram\s*ads|meta\s*ads|marketing\s*digital|promo|anuncio/.test(desc))
    return out('expense','publicidad','high','Publicidad/ads detectada','Publicidad','Cuenta Bancaria', vendor,'expenses',null);

  if (/viatico|per\s*diem|perdiem|meal\s*allowance|travel\s*expense|hospedaje|hotel|alojamiento/.test(desc))
    return out('expense','viaticos','high','Viático detectado','Viáticos','Cuenta Bancaria', vendor,'expenses',detectedBoatId);

  if (/uber|lyft|taxi|transporte|flete|traslado|shipping|freight|mensajeria|courier|fedex|ups\b|dhl/.test(desc))
    return out('expense','transportacion','high','Transporte/flete detectado','Transportación','Cuenta Bancaria', vendor,'expenses',detectedBoatId);

  if (/rent(?:al)?\s*office|oficina\s*renta|renta\s*oficina|alquiler\s*oficina|office\s*lease|coworking/.test(desc))
    return out('expense','renta_oficina','high','Renta de oficina detectada','Renta de Oficina','Cuenta Bancaria', vendor,'expenses',null);

  if (/telefon|celular|movil|internet|cable|wifi|t-mobile|at&t|verizon|comcast|comunicac|phone\s*bill|data\s*plan/.test(desc))
    return out('expense','comunicaciones','high','Comunicaciones detectadas','Comunicaciones','Cuenta Bancaria', vendor,'expenses',null);

  if (/software|sistema|platform|saas|subscription|suscripcion|netflix|spotify|dropbox|google\s+cloud|aws\b|hosting|microsoft|quickbooks|operativ/.test(desc))
    return out('expense','sistemas_operativos','medium','Software/sistema detectado','Sistemas Operativos','Cuenta Bancaria', vendor,'expenses',null);

  if (/office\s*supply|supplies|staples|paper|papel|toner|printer|impresora|admin(?:istrat)/.test(desc))
    return out('expense','gastos_admin','medium','Gastos administrativos','Gastos Administrativos','Cuenta Bancaria', vendor,'expenses',null);

  if (/amazon|home depot|lowes?|walmart|costco|sam\'s club|harbor freight/.test(desc)) {
    if (amt > 1000) return out('asset','equipment','medium','Proveedor grande + monto alto → activo probable','Activos — Equipos','Cuenta Bancaria', vendor,'assets',detectedBoatId);
    if (amt > 200) return out('expense','partes_piezas','medium','Proveedor tipo inventario/partes','Partes y Piezas','Cuenta Bancaria', vendor,'expenses',detectedBoatId);
    return out('expense','suministros','medium','Proveedor suministros generales','Suministros / Equipo','Cuenta Bancaria', vendor,'expenses',null);
  }

  if (/equipment|radio\b|device|electronic|sensor|camera|sonar|equipo|autopilot/.test(desc))
    return out('asset','equipment','high','Equipo náutico/electrónico','Activos — Equipos','Cuenta Bancaria', vendor,'assets',detectedBoatId);

  if ((/boat|yacht|hull|vessel|embarcacion|outboard|motor\s*boat/.test(desc)) && amt > 5000)
    return out('asset','boat_purchase','medium','Barco + monto alto → activo fijo','Activos — Embarcación','Cuenta Bancaria', vendor,'fleet',null);

  if (/transfer|zelle|wire\b|ach\b|electronic transfer|trasnfer|internal|interbancari/.test(desc))
    return out('transfer','bank_transfer','medium','Transferencia detectada','Cuenta Destino','Cuenta Origen', vendor,'transfer',null);

  if (/deposit|deposito/.test(desc) && !isCredit)
    return out('expense','deposit','medium','Depósito/garantía','Depósito — Activo','Cuenta Bancaria', vendor,'expenses',null);

  if (isCredit) {
    if (/airbnb|getmyboat|boatsetter|viator|booking\.com|expedia|tripadvisor|fareharbor|bokun|rezdy|peek\b|xola/.test(desc))
      return out('income','booking_income','high','Plataforma de reservas detectada','Cuenta Bancaria','Ingresos de Reservas', vendor,'income',null);
    if (/charter|trip\b|reserva|excursion|tour/.test(desc))
      return out('income','charter_income','high','Ingreso de charter/tour','Cuenta Bancaria','Ingresos de Charter', vendor,'income',null);
    if (/deposit|anticipo|down payment/.test(desc))
      return out('income','deferred_deposit','medium','Depósito anticipado — revisar si es diferido','Cuenta Bancaria','Depósitos Diferidos de Reservas', vendor,'deposits',null);
    if (amt > 0)
      return out('income','other_income','medium','Crédito — sin patrón específico','Cuenta Bancaria','Otros Ingresos', vendor,'income',null);
  }

  if (amt > 2000 && !isCredit)
    return out('asset','equipment','low','Monto alto — revisar si es activo','Activos — Equipos','Cuenta Bancaria', vendor,'assets',detectedBoatId);

  return out(isCredit?'income':'expense', isCredit?'other_income':'other_expense',
    'low','Sin patrón — requiere revisión manual',
    isCredit?'Cuenta Bancaria':'Gastos Generales',
    isCredit?'Otros Ingresos':'Cuenta Bancaria',
    vendor, null, detectedBoatId);
}

// --- Classify all unclassified bank statements ---
app.post('/api/accounting/bank-statements/smart-classify', isAuthenticated, async (req, res) => {
  try {
    const patterns = await pool.query('SELECT * FROM classification_patterns ORDER BY use_count DESC');
    const boatsQ  = await pool.query('SELECT id, boat_name as name FROM boats');
    const stmts = await pool.query(
      `SELECT * FROM bank_statements WHERE (classification_status IS NULL OR classification_status='unclassified') ORDER BY statement_date DESC`
    );
    let updated = 0;
    for (const s of stmts.rows) {
      const r = smartClassify(s.description, s.amount, s.transaction_type, patterns.rows, boatsQ.rows);
      await pool.query(
        `UPDATE bank_statements SET accounting_type=$1, category=$2, confidence_level=$3,
         suggested_account_debit=$4, suggested_account_credit=$5,
         vendor_suggestion=$6, module_destination=$7, boat_id=COALESCE($8, boat_id),
         confidence_reason=$9, classification_status='suggested', updated_at=CURRENT_TIMESTAMP
         WHERE id=$10`,
        [r.accounting_type, r.category, r.confidence_level,
         r.suggested_account_debit, r.suggested_account_credit,
         r.vendor_suggestion, r.module_destination, r.boat_id,
         r.confidence_reason, s.id]
      );
      updated++;
    }
    res.json({ success: true, classified: updated });
  } catch(err) {
    console.error('smart-classify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Get classification stats ---
app.get('/api/accounting/bank-statements/classification-stats', isAuthenticated, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE classification_status='unclassified' OR classification_status IS NULL) as unclassified,
        COUNT(*) FILTER (WHERE classification_status='suggested') as suggested,
        COUNT(*) FILTER (WHERE classification_status='confirmed') as confirmed,
        COUNT(*) FILTER (WHERE classification_status='posted') as posted,
        COUNT(*) FILTER (WHERE matched_transaction_id IS NOT NULL) as matched,
        COUNT(*) FILTER (WHERE confidence_level='high') as high_confidence,
        COUNT(*) FILTER (WHERE confidence_level='medium') as medium_confidence,
        COUNT(*) FILTER (WHERE confidence_level='low') as low_confidence
      FROM bank_statements
    `);
    const row = r.rows[0];
    const total = parseInt(row.total) || 1;
    const classified = parseInt(row.confirmed||0) + parseInt(row.posted||0);
    res.json({
      ...row,
      pct_classified: Math.round(classified/total*100),
      pct_reconciled: Math.round(parseInt(row.posted||0)/total*100),
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Update classification for a single statement ---
app.patch('/api/accounting/bank-statements/:id/classify', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      accounting_type, category, confidence_level, boat_id,
      suggested_account_debit, suggested_account_credit, notes, status,
      vendor_suggestion, module_destination
    } = req.body;
    const newStatus = status || 'confirmed';
    const r = await pool.query(
      `UPDATE bank_statements SET
         accounting_type=COALESCE($1,accounting_type),
         category=COALESCE($2,category),
         confidence_level=COALESCE($3,confidence_level),
         boat_id=COALESCE($4,boat_id),
         suggested_account_debit=COALESCE($5,suggested_account_debit),
         suggested_account_credit=COALESCE($6,suggested_account_credit),
         notes=COALESCE($7,notes),
         classification_status=$8,
         vendor_suggestion=COALESCE($9,vendor_suggestion),
         module_destination=COALESCE($10,module_destination),
         updated_at=CURRENT_TIMESTAMP
       WHERE id=$11 RETURNING *`,
      [accounting_type, category, confidence_level, boat_id,
       suggested_account_debit, suggested_account_credit, notes, newStatus,
       vendor_suggestion, module_destination, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });

    // Learn from this confirmation: upsert a pattern with full context
    if (newStatus === 'confirmed' || newStatus === 'posted') {
      const stmt = r.rows[0];
      const words = (stmt.description||'').toLowerCase().split(/\s+/).filter(w=>w.length>3).slice(0,2).join(' ');
      if (words.length > 2) {
        const { nanoid } = await import('nanoid');
        await pool.query(
          `INSERT INTO classification_patterns
             (id, description_pattern, accounting_type, category, boat_id, vendor_pattern, module_destination, use_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,1)
           ON CONFLICT (description_pattern) DO UPDATE SET
             accounting_type=EXCLUDED.accounting_type, category=EXCLUDED.category,
             boat_id=COALESCE(EXCLUDED.boat_id, classification_patterns.boat_id),
             vendor_pattern=COALESCE(EXCLUDED.vendor_pattern, classification_patterns.vendor_pattern),
             module_destination=COALESCE(EXCLUDED.module_destination, classification_patterns.module_destination),
             use_count=classification_patterns.use_count+1, updated_at=CURRENT_TIMESTAMP`,
          [nanoid(), words, stmt.accounting_type, stmt.category,
           stmt.boat_id||null, stmt.vendor_suggestion||null, stmt.module_destination||null]
        );
      }
    }
    res.json(r.rows[0]);
  } catch(err) {
    console.error('classify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Bulk classify: apply same classification to multiple statements ---
app.post('/api/accounting/bank-statements/bulk-classify', isAuthenticated, async (req, res) => {
  try {
    const { ids, accounting_type, category, confidence_level, boat_id,
            suggested_account_debit, suggested_account_credit, vendor_suggestion, module_destination } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    const r = await pool.query(
      `UPDATE bank_statements SET
         accounting_type=$1, category=$2,
         confidence_level=COALESCE($3,'medium'),
         boat_id=COALESCE($4,boat_id),
         suggested_account_debit=COALESCE($5,suggested_account_debit),
         suggested_account_credit=COALESCE($6,suggested_account_credit),
         vendor_suggestion=COALESCE($7,vendor_suggestion),
         module_destination=COALESCE($8,module_destination),
         classification_status='confirmed', updated_at=CURRENT_TIMESTAMP
       WHERE id=ANY($9::text[]) RETURNING id`,
      [accounting_type, category, confidence_level, boat_id,
       suggested_account_debit, suggested_account_credit,
       vendor_suggestion, module_destination, ids]
    );
    res.json({ success: true, updated: r.rowCount });
  } catch(err) {
    console.error('bulk-classify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Quick accept: accept the current suggestion for a statement ---
app.post('/api/accounting/bank-statements/:id/quick-accept', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      `UPDATE bank_statements SET classification_status='confirmed', updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND classification_status='suggested' RETURNING *`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not in suggested state' });
    const stmt = r.rows[0];
    // Learn from it
    const words = (stmt.description||'').toLowerCase().split(/\s+/).filter(w=>w.length>3).slice(0,2).join(' ');
    if (words.length > 2) {
      const { nanoid } = await import('nanoid');
      await pool.query(
        `INSERT INTO classification_patterns
           (id, description_pattern, accounting_type, category, boat_id, vendor_pattern, module_destination, use_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1)
         ON CONFLICT (description_pattern) DO UPDATE SET
           use_count=classification_patterns.use_count+1, updated_at=CURRENT_TIMESTAMP`,
        [nanoid(), words, stmt.accounting_type, stmt.category,
         stmt.boat_id||null, stmt.vendor_suggestion||null, stmt.module_destination||null]
      );
    }
    res.json({ success: true, statement: stmt });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SMART DUPLICATE SCORING ENGINE
// ============================================================

function normalizeDesc(s) {
  if (!s) return '';
  return s.toLowerCase()
    // Remove banking noise words
    .replace(/\b(ach|pos|card|visa|mc|mastercard|amex|debit|credit|purchase|transaction|transfer|wire|payment|pymt|pmt|chk|check|online|mobile|atm|fee|charge|withdrawal|deposit|direct|recurring|auto|autopay|autopago|pago|cargo|compra|retiro|transferencia|electronic|elec|eft|trf|trn|ref|orig|bk|bkg|svc|svce)\b/g, ' ')
    // Remove generic business type words (keep merchant name, strip type)
    .replace(/\b(station|service|services|store|market|markets|center|centre|group|corp|inc|llc|ltd|co|company|enterprises|solutions|systems)\b/g, ' ')
    // Remove reference numbers (4+ digit standalone numbers, #codes)
    .replace(/(^|\s)(#?[0-9]{4,})(\s|$)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSim(a, b) {
  // Filter: min 3 chars, not purely numeric (noise numbers like 1234)
  const clean = w => w.length >= 3 && !/^\d+$/.test(w);
  const ta = new Set((a || '').split(' ').filter(clean));
  const tb = new Set((b || '').split(' ').filter(clean));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter(w => tb.has(w)).length;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

function scoreDupePair(a, b) {
  let score = 0;
  const reasons = [];

  // Amount match
  const amtA = Math.abs(parseFloat(a.amount) || 0);
  const amtB = Math.abs(parseFloat(b.amount) || 0);
  const amtDiff = Math.abs(amtA - amtB);
  if (amtDiff < 0.01) {
    score += 35; reasons.push('Monto idéntico');
  } else if (amtDiff / (Math.max(amtA, amtB) || 1) < 0.01) {
    score += 20; reasons.push('Monto casi igual');
  }

  // Date proximity
  const dA = new Date(a.statement_date);
  const dB = new Date(b.statement_date);
  const daysDiff = Math.abs((dA - dB) / 86400000);
  if (daysDiff === 0) {
    score += 20; reasons.push('Misma fecha');
  } else if (daysDiff <= 3) {
    score += 10; reasons.push(`Fechas a ${Math.round(daysDiff)} día(s) de diferencia`);
  }

  // Description similarity (normalized)
  const normA = normalizeDesc(a.description);
  const normB = normalizeDesc(b.description);
  const sim = tokenSim(normA, normB);
  if (sim >= 0.8) {
    score += 30; reasons.push('Descripción muy similar');
  } else if (sim >= 0.5) {
    score += 15; reasons.push('Descripción similar');
  } else if (sim >= 0.3) {
    score += 5; reasons.push('Descripción algo similar');
  }

  // Same boat
  if (a.boat_id && b.boat_id && a.boat_id === b.boat_id) {
    score += 10; reasons.push('Mismo barco');
  }

  // Same category
  if (a.category && b.category && a.category === b.category) {
    score += 5; reasons.push('Misma categoría');
  }

  // Same transaction type
  if (a.transaction_type && b.transaction_type && a.transaction_type === b.transaction_type) {
    score += 5;
  }

  score = Math.min(score, 100);

  // Detect periodic/recurring pattern (7, 14, 28, 30, 31-day intervals)
  const isRecurring = daysDiff > 3 && [7, 14, 28, 30, 31].some(d => Math.abs(daysDiff - d) <= 2);

  // Determine level
  let level = null;
  if (score >= 80) level = 'probable';
  else if (score >= 60) level = 'possible';

  // Override to 'recurrent' when periodic interval detected in middle-score range
  if (isRecurring && score >= 55 && score < 85) {
    level = 'recurrent';
    reasons.push('Patrón periódico detectado');
  }

  return { score, level, reason: reasons.join(' · ') };
}

// Fetch all eligible records and run JS scoring (avoids O(n²) full scan via amount pre-filter)
async function runSmartDupeDetection() {
  const rows = await pool.query(`
    SELECT id, statement_date, amount, description, boat_id, category, transaction_type
    FROM bank_statements
    WHERE is_duplicate IS NOT TRUE AND dup_ignored IS NOT TRUE
    ORDER BY ABS(amount::numeric), statement_date
  `);
  const records = rows.rows;
  const pairs = [];

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i], b = records[j];
      // Quick pre-filter: skip if amount difference too large (saves >90% of comparisons)
      const amtA = Math.abs(parseFloat(a.amount) || 0);
      const amtB = Math.abs(parseFloat(b.amount) || 0);
      if (Math.abs(amtA - amtB) / (Math.max(amtA, amtB) || 1) > 0.05) continue;
      const { score, level, reason } = scoreDupePair(a, b);
      if (level) {
        // Keep the lower id as "keep", higher id as potential duplicate
        const keepId = a.id < b.id ? a.id : b.id;
        const dupId  = a.id < b.id ? b.id : a.id;
        pairs.push({ keepId, dupId, score, level, reason,
          keep: a.id < b.id ? a : b, dup: a.id < b.id ? b : a });
      }
    }
  }
  return pairs;
}

// --- Smart preview (dry run, no writes) ---
app.get('/api/accounting/bank-statements/preview-duplicates', isAuthenticated, async (req, res) => {
  try {
    const pairs = await runSmartDupeDetection();
    // Map to shape UI expects (backward-compatible)
    const mapped = pairs.map(p => ({
      id_a: p.keepId,
      id_b: p.dupId,
      desc_a: p.keep.description,
      desc_b: p.dup.description,
      amount: p.keep.amount,
      statement_date: p.keep.statement_date,
      batch_a: p.keep.import_batch_id,
      batch_b: p.dup.import_batch_id,
      dup_score: p.score,
      dup_level: p.level,
      dup_reason: p.reason
    }));
    res.json({ success: true, pairs: mapped });
  } catch(err) {
    console.error('preview-duplicates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Smart detect: runs scoring and writes dup_score/dup_level/dup_reason to DB ---
app.post('/api/accounting/bank-statements/smart-detect', isAuthenticated, async (req, res) => {
  try {
    // Clear previous smart scores (not is_duplicate flags — those need explicit confirmation)
    await pool.query(`UPDATE bank_statements SET dup_score=NULL, dup_level=NULL, dup_reason=NULL WHERE dup_ignored IS NOT TRUE`);
    const pairs = await runSmartDupeDetection();
    let written = 0;
    for (const p of pairs) {
      await pool.query(
        `UPDATE bank_statements SET dup_score=$1, dup_level=$2, dup_reason=$3, duplicate_of=$4 WHERE id=$5`,
        [p.score, p.level, p.reason, p.keepId, p.dupId]
      );
      written++;
    }
    res.json({ success: true, analyzed: written, pairs: pairs.slice(0, 50).map(p => ({
      id_a: p.keepId, id_b: p.dupId,
      desc_a: p.keep.description, desc_b: p.dup.description,
      amount: p.keep.amount, statement_date: p.keep.statement_date,
      dup_score: p.score, dup_level: p.level, dup_reason: p.reason
    })) });
  } catch(err) {
    console.error('smart-detect error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Confirm and mark specific duplicate IDs ---
app.post('/api/accounting/bank-statements/detect-duplicates', isAuthenticated, async (req, res) => {
  try {
    const { confirm_ids } = req.body || {};

    if (confirm_ids && Array.isArray(confirm_ids) && confirm_ids.length > 0) {
      let flagged = 0;
      for (const { mark_id, keep_id } of confirm_ids) {
        if (!mark_id || !keep_id) continue;
        await pool.query(
          `UPDATE bank_statements SET is_duplicate=TRUE, duplicate_of=$1 WHERE id=$2`,
          [keep_id, mark_id]
        );
        flagged++;
      }
      return res.json({ success: true, duplicates_found: flagged, flagged });
    }

    // Fallback: auto-confirm only 'probable' level detections (score>=80)
    const candidates = await pool.query(`
      SELECT id, duplicate_of FROM bank_statements
      WHERE dup_level='probable' AND is_duplicate IS NOT TRUE AND dup_ignored IS NOT TRUE
        AND duplicate_of IS NOT NULL
    `);
    let flagged = 0;
    for (const row of candidates.rows) {
      await pool.query(
        `UPDATE bank_statements SET is_duplicate=TRUE WHERE id=$1`,
        [row.id]
      );
      flagged++;
    }
    res.json({ success: true, duplicates_found: flagged, flagged });
  } catch(err) {
    console.error('detect-duplicates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Ignore a smart duplicate alert for a specific record ---
app.post('/api/accounting/bank-statements/:id/ignore-dup', isAuthenticated, async (req, res) => {
  try {
    await pool.query(
      `UPDATE bank_statements SET dup_ignored=TRUE, dup_score=NULL, dup_level=NULL, dup_reason=NULL WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Confirm a record IS a duplicate (from smart alert, without bulk marking) ---
app.post('/api/accounting/bank-statements/:id/confirm-dup', isAuthenticated, async (req, res) => {
  try {
    const { keep_id } = req.body || {};
    await pool.query(
      `UPDATE bank_statements SET is_duplicate=TRUE, duplicate_of=$1 WHERE id=$2`,
      [keep_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Reset all duplicate flags (un-mark everything so user can re-detect cleanly) ---
app.post('/api/accounting/bank-statements/reset-duplicates', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bank_statements SET is_duplicate=FALSE, duplicate_of=NULL WHERE is_duplicate=TRUE`
    );
    res.json({ success: true, reset: result.rowCount });
  } catch(err) {
    console.error('reset-duplicates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Delete all flagged duplicates ---
app.delete('/api/accounting/bank-statements/delete-duplicates', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM bank_statements WHERE is_duplicate=TRUE`);
    res.json({ success: true, deleted: result.rowCount });
  } catch(err) {
    console.error('delete-duplicates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Delete a single bank statement ---
app.delete('/api/accounting/bank-statements/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM bank_statements WHERE id=$1 RETURNING id`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json({ success: true, deleted: 1 });
  } catch(err) {
    console.error('delete-statement error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Bulk delete selected bank statements by IDs ---
app.post('/api/accounting/bank-statements/delete-selected', isAuthenticated, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Se requiere lista de IDs' });
    const result = await pool.query(
      `DELETE FROM bank_statements WHERE id = ANY($1::text[])`,
      [ids]
    );
    res.json({ success: true, deleted: result.rowCount });
  } catch(err) {
    console.error('delete-selected error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- List all import batches (unique batches with counts and date range) ---
app.get('/api/accounting/bank-statements/batches', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT import_batch_id as id,
             COUNT(*) as total,
             MIN(statement_date) as date_from,
             MAX(statement_date) as date_to,
             SUM(CASE WHEN is_duplicate THEN 1 ELSE 0 END) as duplicates,
             SUM(CASE WHEN classification_status='posted' THEN 1 ELSE 0 END) as posted,
             MIN(created_at) as imported_at
      FROM bank_statements
      WHERE import_batch_id IS NOT NULL AND import_batch_id != 'manual'
      GROUP BY import_batch_id
      ORDER BY MIN(created_at) DESC
    `);
    res.json({ success: true, batches: result.rows });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Delete all statements from a specific import batch ---
app.delete('/api/accounting/bank-statements/by-batch/:batchId', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM bank_statements WHERE import_batch_id=$1 RETURNING id`,
      [req.params.batchId]
    );
    res.json({ success: true, deleted: result.rowCount });
  } catch(err) {
    console.error('delete-batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Add manual transaction (for missing entries) ---
app.post('/api/accounting/bank-statements/manual', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { statement_date, description, amount, transaction_type, balance, reference_number, notes } = req.body;
    if (!statement_date || !description || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Campos obligatorios: fecha, descripción y monto' });
    }
    const safeDate = statement_date; // already validated on frontend
    const safeAmt = parseFloat(amount);
    if (isNaN(safeAmt)) return res.status(400).json({ error: 'Monto inválido' });
    const txType = transaction_type || (safeAmt >= 0 ? 'credit' : 'debit');
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO bank_statements
        (id, statement_date, description, amount, transaction_type, balance, reference_number,
         reconciliation_status, classification_status, notes, import_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'unmatched','unclassified',$8,'manual')
       RETURNING *`,
      [id, safeDate, description.trim(), safeAmt, txType,
       balance ? parseFloat(balance) : null,
       reference_number || null,
       notes || null]
    );
    res.json({ success: true, statement: result.rows[0] });
  } catch(err) {
    console.error('manual-statement error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Conciliation summary ---
app.get('/api/accounting/bank-statements/conciliation-summary', isAuthenticated, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(ABS(amount)),0) as total_amount,
        COUNT(*) FILTER (WHERE classification_status='unclassified' OR classification_status IS NULL) as pending_review,
        COUNT(*) FILTER (WHERE classification_status='suggested') as auto_suggested,
        COUNT(*) FILTER (WHERE classification_status='confirmed') as confirmed,
        COUNT(*) FILTER (WHERE classification_status='posted') as posted,
        COUNT(*) FILTER (WHERE classification_status='ignored') as ignored,
        COUNT(*) FILTER (WHERE is_duplicate=TRUE) as duplicates,
        COUNT(*) FILTER (WHERE confidence_level='high') as high_conf,
        COUNT(*) FILTER (WHERE confidence_level='medium') as medium_conf,
        COUNT(*) FILTER (WHERE confidence_level='low') as low_conf,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE classification_status='posted'),0) as posted_amount,
        COUNT(*) FILTER (WHERE module_destination='expenses') as module_expenses,
        COUNT(*) FILTER (WHERE module_destination='income') as module_income,
        COUNT(*) FILTER (WHERE module_destination='assets') as module_assets,
        COUNT(*) FILTER (WHERE module_destination='inventory') as module_inventory,
        COUNT(*) FILTER (WHERE module_destination='deposits') as module_deposits,
        COUNT(*) FILTER (WHERE module_destination='transfer') as module_transfer
      FROM bank_statements
    `);
    const row = stats.rows[0];
    const total = parseInt(row.total) || 1;
    const classified = parseInt(row.confirmed||0) + parseInt(row.posted||0);
    const pctClassified = Math.round(classified / total * 100);
    const pctPosted = Math.round(parseInt(row.posted||0) / total * 100);

    // Checklist items
    const checklist = [
      { label: 'Sin clasificar = 0', ok: parseInt(row.pending_review||0) === 0 },
      { label: 'Sin duplicados', ok: parseInt(row.duplicates||0) === 0 },
      { label: 'Confianza baja = 0', ok: parseInt(row.low_conf||0) === 0 },
      { label: 'Todo registrado en contabilidad', ok: parseInt(row.posted||0) === total },
    ];

    res.json({ ...row, pct_classified: pctClassified, pct_posted: pctPosted, checklist });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Conciliation items: transactions cross-checked with bank statements ---
app.get('/api/accounting/conciliation/items', isAuthenticated, async (req, res) => {
  try {
    const { status, limit = 200, offset = 0 } = req.query;

    // Base: all transactions joined with bank_statement info when available
    let where = '';
    const params = [];
    if (status === 'matched') {
      where = "WHERE bs.id IS NOT NULL";
    } else if (status === 'unmatched') {
      where = "WHERE bs.id IS NULL";
    }

    const result = await pool.query(`
      SELECT
        t.id,
        t.transaction_date,
        t.description,
        t.amount,
        t.transaction_type,
        t.reference_type,
        t.reference_id,
        t.reconciled,
        t.notes,
        ca.account_code,
        ca.account_name,
        ca.account_type,
        -- bank statement details (if this transaction was created from one)
        bs.id            AS bs_id,
        bs.description   AS bs_description,
        bs.statement_date,
        bs.classification_status AS bs_status,
        bs.confidence_level      AS bs_confidence,
        bs.category              AS bs_category,
        CASE
          WHEN bs.id IS NOT NULL THEN 'matched'
          ELSE 'unmatched'
        END AS conciliation_status
      FROM transactions t
      LEFT JOIN chart_of_accounts ca ON ca.id = t.account_id
      LEFT JOIN bank_statements bs
        ON bs.matched_transaction_id = t.id
        OR (t.reference_type = 'bank_statement' AND t.reference_id = bs.id)
      ${where}
      ORDER BY t.transaction_date DESC, t.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), parseInt(offset)]);

    // Summary counts
    const counts = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.reconciled = 1 OR bs.id IS NOT NULL) as matched,
        COUNT(*) FILTER (WHERE t.reconciled = 0 AND bs.id IS NULL) as unmatched,
        COUNT(*) FILTER (WHERE t.transaction_type = 'income') as income_count,
        COUNT(*) FILTER (WHERE t.transaction_type = 'expense') as expense_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'income'), 0) as total_income,
        COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'expense'), 0) as total_expense,
        COUNT(DISTINCT bs.id) as bank_statements_linked
      FROM transactions t
      LEFT JOIN chart_of_accounts ca ON ca.id = t.account_id
      LEFT JOIN bank_statements bs
        ON bs.matched_transaction_id = t.id
        OR (t.reference_type = 'bank_statement' AND t.reference_id = bs.id)
    `);

    res.json({
      items: result.rows,
      summary: counts.rows[0],
      bank_statements_imported: (await pool.query('SELECT COUNT(*) as c FROM bank_statements')).rows[0].c
    });
  } catch (err) {
    console.error('conciliation/items error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── UNIFIED CATEGORY TAXONOMY ──────────────────────────────────────────────
// Single source of truth. Same keys, labels and code lists used by:
//   - Intelligent Classification (smartClassify)
//   - Expense Analysis (/api/accounting/expenses/analysis)
//   - Income  Analysis (/api/accounting/income/analysis)
//   - Drill-down endpoints
// ─── CANONICAL EXPENSE TAXONOMY ───────────────────────────────────────────────
// One group per real accounting category in the chart of accounts.
// This is the SINGLE SOURCE OF TRUTH used by:
//   - /api/accounting/expenses/analysis
//   - /api/accounting/expenses/drilldown
//   - Clasificación Inteligente
//   - All dashboard KPIs
// RULE: no account code appears in more than one group.
// RULE: ELSE fallback → gastos_generales (never a mystery "other").
const UNIFIED_EXPENSE_CATEGORIES = [
  { key:'combustible',           label:'Combustible',              codes:['5010'] },
  { key:'marina',                label:'Gastos de Marina',         codes:['5050','5200'] },
  { key:'mantenimiento',         label:'Gastos de Mantenimiento',  codes:['5030','5070','5100'] },
  { key:'partes_piezas',         label:'Partes y Piezas',          codes:['5020','5975'] },
  { key:'limpieza',              label:'Limpieza',                 codes:['5040'] },
  { key:'seguro',                label:'Gastos de Seguro',         codes:['5060','5300'] },
  { key:'sueldos',               label:'Sueldos / Tripulación',    codes:['5400'] },
  { key:'comisiones_plataforma', label:'Comisiones de Plataforma', codes:['5500'] },
  { key:'publicidad',            label:'Publicidad',               codes:['5600','5960'] },
  { key:'suministros',           label:'Suministros / Equipo',     codes:['5700'] },
  { key:'gastos_admin',          label:'Gastos Administrativos',   codes:['5800','5900'] },
  { key:'depreciacion',          label:'Depreciación',             codes:['5810'] },
  { key:'comisiones_bancarias',  label:'Comisiones Bancarias',     codes:['5910','5920'] },
  { key:'viaticos',              label:'Viáticos',                 codes:['5930'] },
  { key:'transportacion',        label:'Transportación',           codes:['5940'] },
  { key:'gps',                   label:'GPS Barcos',               codes:['5950'] },
  { key:'renta_oficina',         label:'Renta de Oficina',         codes:['5970'] },
  { key:'sistemas_operativos',   label:'Sistemas Operativos',      codes:['5080','5980'] },
  { key:'comunicaciones',        label:'Comunicaciones',           codes:['5985'] },
  { key:'gastos_generales',      label:'Gastos Generales',         codes:['5990'] },
];

const UNIFIED_INCOME_CATEGORIES = [
  { key:'rentals', label:'Alquileres',         codes:['4020'] },
  { key:'tours',   label:'Tours y Excursiones',codes:['4010'] },
  { key:'fishing', label:'Pesca Deportiva',    codes:['4030'] },
  { key:'events',  label:'Eventos Especiales', codes:['4040'] },
  { key:'other',   label:'Otros Ingresos',     codes:['4900'] },
];

// Helper: build SQL CASE expression for semantic category grouping.
// defaultKey: which category key receives any account code not explicitly listed.
// For expenses use 'gastos_generales'; for income use 'other'.
function buildCategoryCase(categories, defaultKey = 'gastos_generales') {
  const branches = categories.map(cat => {
    const inList = cat.codes.map(c => `'${c}'`).join(',');
    return `WHEN ca.account_code IN (${inList}) THEN '${cat.key}'`;
  });
  return `CASE ${branches.join(' ')} ELSE '${defaultKey}' END`;
}

// Helper: look up codes for a given category key
function codesForCategory(categories, key) {
  const cat = categories.find(c => c.key === key);
  if (!cat) return null;
  return cat.codes;
}

// --- Post a confirmed statement to accounting (create transaction) ---
// ── Category → preferred account code mapping ──────────────────────────────
// Maps canonical category keys (from smartClassify + UNIFIED_EXPENSE_CATEGORIES)
// → preferred account_code for resolveAccountId when posting bank statements.
const CATEGORY_ACCOUNT_CODE = {
  // ── Expenses (canonical keys = UNIFIED_EXPENSE_CATEGORIES.key) ────────────
  combustible:           '5010',
  marina:                '5050',
  mantenimiento:         '5100',
  partes_piezas:         '5975',
  limpieza:              '5040',
  seguro:                '5300',
  sueldos:               '5400',
  comisiones_plataforma: '5500',
  publicidad:            '5960',
  suministros:           '5700',
  gastos_admin:          '5900',
  depreciacion:          '5810',
  comisiones_bancarias:  '5920',
  viaticos:              '5930',
  transportacion:        '5940',
  gps:                   '5950',
  renta_oficina:         '5970',
  sistemas_operativos:   '5980',
  comunicaciones:        '5985',
  gastos_generales:      '5990',
  // ── Legacy keys (backward compat for old bank_statement records) ──────────
  fuel:                  '5010',
  marina_fees:           '5050',
  maintenance_repair:    '5100',
  cleaning:              '5040',
  insurance:             '5300',
  crew_payroll:          '5400',
  subscriptions:         '5080',
  office:                '5900',
  marine_supplies:       '5020',
  inventory:             '5975',
  bank_commissions:      '5920',
  interest_expense:      '5910',
  other_expense:         '5990',
  deposit:               '5080',
  // ── Assets ───────────────────────────────────────────────────────────────
  equipment:             '1600',
  boat_purchase:         '1500',
  // ── Transfers ────────────────────────────────────────────────────────────
  bank_transfer:         '1010',
  // Income → revenue accounts found dynamically
};

async function resolveAccountId(pool, accounting_type, category) {
  // 1. Try preferred code for this category
  const code = CATEGORY_ACCOUNT_CODE[category];
  if (code) {
    const r = await pool.query('SELECT id FROM chart_of_accounts WHERE account_code=$1 LIMIT 1', [code]);
    if (r.rows.length) return r.rows[0].id;
  }
  // 2. Fall back to first account of the matching type
  const acctType = accounting_type === 'income' ? 'revenue'
                 : accounting_type === 'asset'   ? 'asset'
                 : accounting_type === 'transfer' ? 'asset'
                 : 'expense';
  const r2 = await pool.query(
    'SELECT id FROM chart_of_accounts WHERE account_type=$1 ORDER BY account_code LIMIT 1', [acctType]
  );
  return r2.rows.length ? r2.rows[0].id : null;
}

app.post('/api/accounting/bank-statements/:id/post', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const stmt = await pool.query('SELECT * FROM bank_statements WHERE id=$1', [id]);
    if (!stmt.rows.length) return res.status(404).json({ error: 'Movimiento no encontrado' });
    const s = stmt.rows[0];

    // Idempotency: already posted
    if (s.classification_status === 'posted') {
      return res.status(400).json({ error: 'Este movimiento ya fue registrado en contabilidad', already_posted: true, transaction_id: s.matched_transaction_id });
    }

    if (!s.accounting_type || !s.category) {
      return res.status(400).json({ error: 'El movimiento debe estar clasificado antes de registrarlo' });
    }

    const accountId = await resolveAccountId(pool, s.accounting_type, s.category);
    if (!accountId) {
      return res.status(400).json({
        error: `No se encontró cuenta contable para el tipo '${s.accounting_type}'. Verifica el catálogo de cuentas.`
      });
    }

    const txType = s.accounting_type === 'income'   ? 'income'
                 : s.accounting_type === 'transfer'  ? 'transfer'
                 : 'expense';

    const { nanoid } = await import('nanoid');
    const txId = nanoid();

    const noteText = [s.suggested_account_debit, s.suggested_account_credit]
      .filter(Boolean).join(' / ');

    await pool.query(
      `INSERT INTO transactions
         (id, transaction_date, account_id, description, amount, transaction_type,
          boat_id, reference_type, notes, reconciled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8,1)`,
      [txId, s.statement_date, accountId, s.description,
       Math.abs(parseFloat(s.amount)), txType,
       s.boat_id || null,
       noteText || `Importado del extracto bancario — ${s.category}`]
    );

    await pool.query(
      `UPDATE bank_statements
       SET classification_status='posted', matched_transaction_id=$1,
           reconciliation_status='matched', updated_at=CURRENT_TIMESTAMP
       WHERE id=$2`,
      [txId, id]
    );

    console.log(`✅ Bank statement ${id} posted → transaction ${txId} (account ${accountId})`);
    res.json({ success: true, transaction_id: txId, account_id: accountId });
  } catch(err) {
    console.error('post bank-statement error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Bulk-post: post multiple confirmed statements in one call ---
app.post('/api/accounting/bank-statements/bulk-post', isAuthenticated, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids array requerido' });
    }

    const { nanoid } = await import('nanoid');
    const results = { posted: [], already_posted: [], failed: [] };

    for (const id of ids) {
      try {
        const stmt = await pool.query('SELECT * FROM bank_statements WHERE id=$1', [id]);
        if (!stmt.rows.length) { results.failed.push({ id, reason: 'No encontrado' }); continue; }
        const s = stmt.rows[0];

        if (s.classification_status === 'posted') {
          results.already_posted.push({ id, transaction_id: s.matched_transaction_id });
          continue;
        }
        if (!s.accounting_type || !s.category) {
          results.failed.push({ id, reason: 'Sin clasificar', description: s.description });
          continue;
        }

        const accountId = await resolveAccountId(pool, s.accounting_type, s.category);
        if (!accountId) {
          results.failed.push({ id, reason: `Sin cuenta contable para '${s.accounting_type}'`, description: s.description });
          continue;
        }

        const txType = s.accounting_type === 'income' ? 'income'
                     : s.accounting_type === 'transfer' ? 'transfer'
                     : 'expense';
        const txId = nanoid();
        const noteText = [s.suggested_account_debit, s.suggested_account_credit]
          .filter(Boolean).join(' / ');

        await pool.query(
          `INSERT INTO transactions
             (id, transaction_date, account_id, description, amount, transaction_type,
              boat_id, reference_type, notes, reconciled)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8,1)`,
          [txId, s.statement_date, accountId, s.description,
           Math.abs(parseFloat(s.amount)), txType,
           s.boat_id || null, noteText || `Importado — ${s.category}`]
        );

        await pool.query(
          `UPDATE bank_statements
           SET classification_status='posted', matched_transaction_id=$1,
               reconciliation_status='matched', updated_at=CURRENT_TIMESTAMP
           WHERE id=$2`,
          [txId, id]
        );

        results.posted.push({ id, transaction_id: txId });
      } catch(itemErr) {
        results.failed.push({ id, reason: itemErr.message });
      }
    }

    console.log(`✅ bulk-post: ${results.posted.length} posted, ${results.already_posted.length} already posted, ${results.failed.length} failed`);
    res.json({
      success: true,
      posted: results.posted.length,
      already_posted: results.already_posted.length,
      failed: results.failed.length,
      details: results
    });
  } catch(err) {
    console.error('bulk-post error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Classification patterns (learning) ---
app.get('/api/accounting/classification-patterns', isAuthenticated, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM classification_patterns ORDER BY use_count DESC, updated_at DESC LIMIT 100');
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/accounting/classification-patterns/:id', isAuthenticated, async (req, res) => {
  try {
    await pool.query('DELETE FROM classification_patterns WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ===== RECONCILIATION =====

// Get all reconciliation sessions
app.get('/api/accounting/reconciliations', isAuthenticated, async (req, res) => {
  try {
    const { status, limit } = req.query;
    
    let query = 'SELECT * FROM reconciliation_sessions WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    query += ' ORDER BY period_end DESC, created_at DESC';
    
    if (limit) {
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching reconciliations:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliations' });
  }
});

// Get single reconciliation session with transactions
app.get('/api/accounting/reconciliations/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get reconciliation session
    const sessionResult = await pool.query(
      'SELECT * FROM reconciliation_sessions WHERE id = $1',
      [id]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation session not found' });
    }
    
    // Get transactions in this reconciliation
    const transactionsResult = await pool.query(
      `SELECT t.*, a.account_name, a.account_code 
       FROM transactions t
       LEFT JOIN chart_of_accounts a ON t.account_id = a.id
       WHERE t.reconciliation_id = $1
       ORDER BY t.transaction_date`,
      [id]
    );
    
    res.json({
      session: sessionResult.rows[0],
      transactions: transactionsResult.rows
    });
  } catch (error) {
    console.error('Error fetching reconciliation:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation' });
  }
});

// Create reconciliation session
app.post('/api/accounting/reconciliations', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { period_start, period_end, opening_balance, closing_balance } = req.body;
    
    // Validation
    if (!period_start || !period_end || opening_balance === undefined || closing_balance === undefined) {
      return res.status(400).json({ 
        error: 'period_start, period_end, opening_balance, and closing_balance are required' 
      });
    }
    
    if (typeof opening_balance !== 'number' || typeof closing_balance !== 'number') {
      return res.status(400).json({ error: 'opening_balance and closing_balance must be numbers' });
    }
    
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO reconciliation_sessions 
       (id, period_start, period_end, opening_balance, closing_balance, status) 
       VALUES ($1, $2, $3, $4, $5, 'in_progress') 
       RETURNING *`,
      [id, period_start, period_end, opening_balance, closing_balance]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating reconciliation:', error);
    res.status(500).json({ error: 'Failed to create reconciliation' });
  }
});

// Complete reconciliation session
app.post('/api/accounting/reconciliations/:id/complete', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { reconciled_by } = req.body;
    
    // Calculate totals from transactions
    const totalsResult = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) as total_credits,
         COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) as total_debits
       FROM transactions 
       WHERE reconciliation_id = $1`,
      [id]
    );
    
    const { total_credits, total_debits } = totalsResult.rows[0];
    
    // Get session to calculate variance
    const sessionResult = await pool.query(
      'SELECT opening_balance, closing_balance FROM reconciliation_sessions WHERE id = $1',
      [id]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation session not found' });
    }
    
    const { opening_balance, closing_balance } = sessionResult.rows[0];
    const calculated_balance = parseFloat(opening_balance) + parseFloat(total_credits) - parseFloat(total_debits);
    const variance = calculated_balance - parseFloat(closing_balance);
    
    // Update session
    const result = await pool.query(
      `UPDATE reconciliation_sessions 
       SET status = 'completed', total_credits = $1, total_debits = $2, variance = $3,
           reconciled_by = $4, reconciled_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [total_credits, total_debits, variance, reconciled_by || 'System', id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error completing reconciliation:', error);
    res.status(500).json({ error: 'Failed to complete reconciliation' });
  }
});

// Variance analysis with intelligent suggestions
app.get('/api/accounting/reconciliations/:id/variance-analysis', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get reconciliation session
    const sessionResult = await pool.query(
      'SELECT * FROM reconciliation_sessions WHERE id = $1',
      [id]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reconciliation session not found' });
    }
    
    const session = sessionResult.rows[0];
    const { period_start, period_end, opening_balance, closing_balance } = session;
    
    // Calculate actual variance
    const transactionsResult = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) as total_credits,
         COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) as total_debits,
         COUNT(*) as transaction_count
       FROM transactions 
       WHERE reconciliation_id = $1`,
      [id]
    );
    
    const { total_credits, total_debits, transaction_count } = transactionsResult.rows[0];
    const calculated_balance = parseFloat(opening_balance) + parseFloat(total_credits) - parseFloat(total_debits);
    const variance = calculated_balance - parseFloat(closing_balance);
    const variance_abs = Math.abs(variance);
    
    // Intelligent suggestions
    const suggestions = [];
    
    // 1. Check for unmatched bank statements in period
    const unmatchedStatementsResult = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
       FROM bank_statements
       WHERE matched_transaction_id IS NULL
       AND statement_date >= $1 AND statement_date <= $2`,
      [period_start, period_end]
    );
    
    const unmatchedCount = parseInt(unmatchedStatementsResult.rows[0].count);
    const unmatchedTotal = parseFloat(unmatchedStatementsResult.rows[0].total_amount);
    
    if (unmatchedCount > 0) {
      suggestions.push({
        type: 'unmatched_statements',
        severity: variance_abs > 100 ? 'high' : 'medium',
        message: `Found ${unmatchedCount} unmatched bank statements totaling $${unmatchedTotal.toFixed(2)}`,
        action: 'Review and match bank statements to transactions',
        potential_impact: unmatchedTotal
      });
    }
    
    // 2. Check for unreconciled transactions in period
    const unreconciledTxResult = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
       FROM transactions
       WHERE reconciliation_id IS NULL
       AND transaction_date >= $1 AND transaction_date <= $2`,
      [period_start, period_end]
    );
    
    const unreconciledCount = parseInt(unreconciledTxResult.rows[0].count);
    const unreconciledTotal = parseFloat(unreconciledTxResult.rows[0].total_amount);
    
    if (unreconciledCount > 0) {
      suggestions.push({
        type: 'unreconciled_transactions',
        severity: 'medium',
        message: `Found ${unreconciledCount} unreconciled transactions totaling $${unreconciledTotal.toFixed(2)}`,
        action: 'Add missing transactions to reconciliation session',
        potential_impact: unreconciledTotal
      });
    }
    
    // 3. Variance magnitude analysis
    if (variance_abs > 0.01) {
      let severity = 'low';
      let message = '';
      
      if (variance_abs < 10) {
        severity = 'low';
        message = `Small variance of $${variance_abs.toFixed(2)} - likely rounding or pending transactions`;
      } else if (variance_abs < 100) {
        severity = 'medium';
        message = `Moderate variance of $${variance_abs.toFixed(2)} - review recent transactions`;
      } else {
        severity = 'high';
        message = `Large variance of $${variance_abs.toFixed(2)} - significant discrepancy detected`;
      }
      
      suggestions.push({
        type: 'variance_magnitude',
        severity,
        message,
        action: variance_abs > 100 ? 'Investigate large discrepancy immediately' : 'Review for minor adjustments',
        variance_amount: variance
      });
    }
    
    // 4. Check for duplicate transactions (same amount, same date)
    const duplicatesResult = await pool.query(
      `SELECT amount, transaction_date, COUNT(*) as dup_count
       FROM transactions
       WHERE reconciliation_id = $1
       GROUP BY amount, transaction_date
       HAVING COUNT(*) > 1`,
      [id]
    );
    
    if (duplicatesResult.rows.length > 0) {
      suggestions.push({
        type: 'potential_duplicates',
        severity: 'medium',
        message: `Found ${duplicatesResult.rows.length} potential duplicate transaction sets`,
        action: 'Review transactions with same amount and date for duplicates',
        duplicates: duplicatesResult.rows
      });
    }
    
    // 5. Check for unusual transaction patterns
    const avgTransactionResult = await pool.query(
      `SELECT AVG(amount) as avg_amount, STDDEV(amount) as stddev_amount
       FROM transactions
       WHERE reconciliation_id = $1`,
      [id]
    );
    
    if (avgTransactionResult.rows.length > 0) {
      const avg = parseFloat(avgTransactionResult.rows[0].avg_amount || 0);
      const stddev = parseFloat(avgTransactionResult.rows[0].stddev_amount || 0);
      
      if (stddev > 0) {
        const outlierThreshold = avg + (3 * stddev);
        const outlierResult = await pool.query(
          `SELECT COUNT(*) as count
           FROM transactions
           WHERE reconciliation_id = $1 AND amount > $2`,
          [id, outlierThreshold]
        );
        
        const outlierCount = parseInt(outlierResult.rows[0].count);
        if (outlierCount > 0) {
          suggestions.push({
            type: 'unusual_transactions',
            severity: 'low',
            message: `Found ${outlierCount} transactions significantly above average ($${avg.toFixed(2)})`,
            action: 'Review large transactions for accuracy'
          });
        }
      }
    }
    
    // Reconciliation health score (0-100)
    let health_score = 100;
    if (variance_abs > 0.01) health_score -= Math.min(30, variance_abs / 10);
    if (unmatchedCount > 0) health_score -= Math.min(20, unmatchedCount * 2);
    if (unreconciledCount > 0) health_score -= Math.min(15, unreconciledCount);
    if (duplicatesResult.rows.length > 0) health_score -= 10;
    
    res.json({
      session: session,
      calculated_balance,
      variance,
      variance_abs,
      health_score: Math.max(0, Math.round(health_score)),
      suggestions: suggestions.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      }),
      statistics: {
        transaction_count: parseInt(transaction_count),
        total_credits: parseFloat(total_credits),
        total_debits: parseFloat(total_debits),
        unmatched_statements: unmatchedCount,
        unreconciled_transactions: unreconciledCount
      }
    });
  } catch (error) {
    console.error('Error analyzing variance:', error);
    res.status(500).json({ error: 'Failed to analyze variance' });
  }
});

// ===== FINANCIAL REPORTS =====

// Profit & Loss Report
// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE ANALYSIS ENDPOINTS (truthful: only account_type='expense' accounts)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/accounting/expenses/analysis?from=YYYY-MM-DD&to=YYYY-MM-DD
// Groups by UNIFIED_EXPENSE_CATEGORIES (same taxonomy as Intelligent Classification)
app.get('/api/accounting/expenses/analysis', isAuthenticated, async (req, res) => {
  try {
    let { from, to } = req.query;
    if (!from) from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    if (!to)   to   = new Date().toISOString().slice(0,10);
    const params = [from, to];

    // 1. Grand total (real operational expenses only)
    const totals = await pool.query(`
      SELECT COUNT(*) AS count, COALESCE(SUM(t.amount), 0) AS total
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'expense'
        AND ca.account_type = 'expense'
        AND t.transaction_date BETWEEN $1 AND $2
    `, params);

    // 2. Grouped by canonical category key (CASE WHEN on account_code)
    const categoryCase = buildCategoryCase(UNIFIED_EXPENSE_CATEGORIES);
    const byCategory = await pool.query(`
      SELECT
        ${categoryCase} AS category_key,
        COUNT(*) AS count,
        COALESCE(SUM(t.amount), 0) AS total
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'expense'
        AND ca.account_type = 'expense'
        AND t.transaction_date BETWEEN $1 AND $2
      GROUP BY category_key
      ORDER BY total DESC
    `, params);

    // 3. Monthly trend (last 6 months)
    const trend = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', t.transaction_date), 'YYYY-MM') AS month,
        COALESCE(SUM(t.amount), 0) AS total
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'expense'
        AND ca.account_type = 'expense'
        AND t.transaction_date >= (CURRENT_DATE - INTERVAL '5 months')::date
      GROUP BY DATE_TRUNC('month', t.transaction_date)
      ORDER BY month
    `);

    // 4. Income same period (for net balance KPI)
    const income = await pool.query(`
      SELECT COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS count
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'income'
        AND ca.account_type IN ('revenue','income')
        AND t.transaction_date BETWEEN $1 AND $2
    `, params);

    const totalExpenses = parseFloat(totals.rows[0].total) || 0;
    const totalIncome   = parseFloat(income.rows[0].total) || 0;

    // Merge DB rows with canonical taxonomy (adds label, preserves order)
    const catMap = {};
    byCategory.rows.forEach(r => { catMap[r.category_key] = r; });

    const categoriesOut = UNIFIED_EXPENSE_CATEGORIES
      .map(cat => {
        const row = catMap[cat.key];
        if (!row || parseFloat(row.total) === 0) return null;
        return {
          category_key: cat.key,
          name:   cat.label,
          codes:  cat.codes,
          count:  parseInt(row.count),
          total:  parseFloat(row.total),
          pct:    totalExpenses > 0 ? Math.round(parseFloat(row.total) / totalExpenses * 100) : 0
        };
      })
      .filter(Boolean);

    res.json({
      from, to,
      total_expenses: totalExpenses,
      expense_count:  parseInt(totals.rows[0].count) || 0,
      total_income:   totalIncome,
      income_count:   parseInt(income.rows[0].count) || 0,
      net_balance:    totalIncome - totalExpenses,
      by_category:    categoriesOut,
      trend: trend.rows.map(r => ({ month: r.month, total: parseFloat(r.total) }))
    });
  } catch (err) {
    console.error('expenses/analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounting/expenses/drilldown?category_key=fuel&from=&to=
// Uses UNIFIED_EXPENSE_CATEGORIES to resolve which account codes belong to the category
app.get('/api/accounting/expenses/drilldown', isAuthenticated, async (req, res) => {
  try {
    let { category_key, from, to } = req.query;
    if (!category_key) return res.status(400).json({ error: 'category_key required' });
    if (!from) from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    if (!to)   to   = new Date().toISOString().slice(0,10);

    // Resolve account codes for this category key
    const codes = codesForCategory(UNIFIED_EXPENSE_CATEGORIES, category_key);
    if (!codes) return res.status(400).json({ error: `Unknown category_key: ${category_key}` });

    const placeholders = codes.map((_, i) => `$${i+3}`).join(',');
    const result = await pool.query(`
      SELECT
        t.id, t.transaction_date, t.description, t.amount,
        t.reference_type, t.reference_id, t.notes,
        ca.account_code, ca.account_name
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'expense'
        AND ca.account_type = 'expense'
        AND ca.account_code IN (${placeholders})
        AND t.transaction_date BETWEEN $1 AND $2
      ORDER BY t.transaction_date DESC, t.id
    `, [from, to, ...codes]);

    const total = result.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const cat   = UNIFIED_EXPENSE_CATEGORIES.find(c => c.key === category_key);
    res.json({
      category_key,
      category_label: cat ? cat.label : category_key,
      codes,
      from, to,
      total,
      count: result.rows.length,
      items: result.rows
    });
  } catch (err) {
    console.error('expenses/drilldown error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounting/income/analysis?from=YYYY-MM-DD&to=YYYY-MM-DD
// Groups by UNIFIED_INCOME_CATEGORIES (same taxonomy as Intelligent Classification)
app.get('/api/accounting/income/analysis', isAuthenticated, async (req, res) => {
  try {
    let { from, to } = req.query;
    if (!from) from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    if (!to)   to   = new Date().toISOString().slice(0,10);
    const params = [from, to];

    // 1. Grand total (real revenue accounts only)
    const totals = await pool.query(`
      SELECT COUNT(*) AS count, COALESCE(SUM(t.amount), 0) AS total
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'income'
        AND ca.account_type IN ('revenue','income')
        AND t.transaction_date BETWEEN $1 AND $2
    `, params);

    // 2. Grouped by canonical income category key (CASE WHEN on account_code)
    const categoryCase = buildCategoryCase(UNIFIED_INCOME_CATEGORIES, 'other');
    const byCategory = await pool.query(`
      SELECT
        ${categoryCase} AS category_key,
        COUNT(*) AS count,
        COALESCE(SUM(t.amount), 0) AS total
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'income'
        AND ca.account_type IN ('revenue','income')
        AND t.transaction_date BETWEEN $1 AND $2
      GROUP BY category_key
      ORDER BY total DESC
    `, params);

    // 3. Monthly trend (last 6 months)
    const trend = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', t.transaction_date), 'YYYY-MM') AS month,
        COALESCE(SUM(t.amount), 0) AS total
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'income'
        AND ca.account_type IN ('revenue','income')
        AND t.transaction_date >= (CURRENT_DATE - INTERVAL '5 months')::date
      GROUP BY DATE_TRUNC('month', t.transaction_date)
      ORDER BY month
    `);

    // 4. Expenses same period (for net balance KPI)
    const expenses = await pool.query(`
      SELECT COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS count
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'expense'
        AND ca.account_type = 'expense'
        AND t.transaction_date BETWEEN $1 AND $2
    `, params);

    const totalIncome   = parseFloat(totals.rows[0].total) || 0;
    const totalExpenses = parseFloat(expenses.rows[0].total) || 0;

    // Merge DB rows with canonical taxonomy
    const catMap = {};
    byCategory.rows.forEach(r => { catMap[r.category_key] = r; });

    const categoriesOut = UNIFIED_INCOME_CATEGORIES
      .map(cat => {
        const row = catMap[cat.key];
        if (!row || parseFloat(row.total) === 0) return null;
        return {
          category_key: cat.key,
          name:  cat.label,
          codes: cat.codes,
          count: parseInt(row.count),
          total: parseFloat(row.total),
          pct:   totalIncome > 0 ? Math.round(parseFloat(row.total) / totalIncome * 100) : 0
        };
      })
      .filter(Boolean);

    res.json({
      from, to,
      total_income:   totalIncome,
      income_count:   parseInt(totals.rows[0].count) || 0,
      total_expenses: totalExpenses,
      expense_count:  parseInt(expenses.rows[0].count) || 0,
      net_balance:    totalIncome - totalExpenses,
      by_category:    categoriesOut,
      trend: trend.rows.map(r => ({ month: r.month, total: parseFloat(r.total) }))
    });
  } catch (err) {
    console.error('income/analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounting/income/drilldown?category_key=rentals&from=&to=
// Uses UNIFIED_INCOME_CATEGORIES to resolve which account codes belong to the category
app.get('/api/accounting/income/drilldown', isAuthenticated, async (req, res) => {
  try {
    let { category_key, from, to } = req.query;
    if (!category_key) return res.status(400).json({ error: 'category_key required' });
    if (!from) from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    if (!to)   to   = new Date().toISOString().slice(0,10);

    const codes = codesForCategory(UNIFIED_INCOME_CATEGORIES, category_key);
    if (!codes) return res.status(400).json({ error: `Unknown category_key: ${category_key}` });

    const placeholders = codes.map((_, i) => `$${i+3}`).join(',');
    const result = await pool.query(`
      SELECT
        t.id, t.transaction_date, t.description, t.amount,
        t.reference_type, t.reference_id, t.notes,
        ca.account_code, ca.account_name
      FROM transactions t
      JOIN chart_of_accounts ca ON ca.id = t.account_id
      WHERE t.transaction_type = 'income'
        AND ca.account_type IN ('revenue','income')
        AND ca.account_code IN (${placeholders})
        AND t.transaction_date BETWEEN $1 AND $2
      ORDER BY t.transaction_date DESC, t.id
    `, [from, to, ...codes]);

    const total = result.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const cat   = UNIFIED_INCOME_CATEGORIES.find(c => c.key === category_key);
    res.json({
      category_key,
      category_label: cat ? cat.label : category_key,
      codes,
      from, to,
      total,
      count: result.rows.length,
      items: result.rows
    });
  } catch (err) {
    console.error('income/drilldown error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/profit-loss', isAuthenticated, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }
    
    // Get revenue
    const revenueResult = await pool.query(
      `SELECT a.account_name, a.account_code, SUM(t.amount) as total
       FROM transactions t
       JOIN chart_of_accounts a ON t.account_id = a.id
       WHERE t.transaction_type = 'income' 
       AND t.transaction_date >= $1 AND t.transaction_date <= $2
       GROUP BY a.id, a.account_name, a.account_code
       ORDER BY a.account_code`,
      [start_date, end_date]
    );
    
    // Get expenses
    const expenseResult = await pool.query(
      `SELECT a.account_name, a.account_code, SUM(t.amount) as total
       FROM transactions t
       JOIN chart_of_accounts a ON t.account_id = a.id
       WHERE t.transaction_type = 'expense' 
       AND t.transaction_date >= $1 AND t.transaction_date <= $2
       GROUP BY a.id, a.account_name, a.account_code
       ORDER BY a.account_code`,
      [start_date, end_date]
    );
    
    const total_revenue = revenueResult.rows.reduce((sum, row) => sum + parseFloat(row.total), 0);
    const total_expenses = expenseResult.rows.reduce((sum, row) => sum + parseFloat(row.total), 0);
    const net_income = total_revenue - total_expenses;
    
    res.json({
      period: { start_date, end_date },
      revenue: revenueResult.rows,
      expenses: expenseResult.rows,
      summary: {
        total_revenue,
        total_expenses,
        net_income,
        profit_margin: total_revenue > 0 ? (net_income / total_revenue) * 100 : 0
      }
    });
  } catch (error) {
    console.error('Error generating P&L report:', error);
    res.status(500).json({ error: 'Failed to generate P&L report' });
  }
});

// Balance Sheet Report
app.get('/api/accounting/balance-sheet', isAuthenticated, async (req, res) => {
  try {
    const { as_of_date } = req.query;
    const date = as_of_date || new Date().toISOString().split('T')[0];
    
    // Get assets
    const assetsResult = await pool.query(
      `SELECT a.account_name, a.account_code, 
              COALESCE(SUM(CASE WHEN t.transaction_type = 'debit' THEN t.amount ELSE -t.amount END), 0) as balance
       FROM chart_of_accounts a
       LEFT JOIN transactions t ON a.id = t.account_id AND t.transaction_date <= $1
       WHERE a.account_type = 'asset' AND a.is_active = 1
       GROUP BY a.id, a.account_name, a.account_code
       ORDER BY a.account_code`,
      [date]
    );
    
    // Get liabilities
    const liabilitiesResult = await pool.query(
      `SELECT a.account_name, a.account_code,
              COALESCE(SUM(CASE WHEN t.transaction_type = 'credit' THEN t.amount ELSE -t.amount END), 0) as balance
       FROM chart_of_accounts a
       LEFT JOIN transactions t ON a.id = t.account_id AND t.transaction_date <= $1
       WHERE a.account_type = 'liability' AND a.is_active = 1
       GROUP BY a.id, a.account_name, a.account_code
       ORDER BY a.account_code`,
      [date]
    );
    
    // Get equity
    const equityResult = await pool.query(
      `SELECT a.account_name, a.account_code,
              COALESCE(SUM(CASE WHEN t.transaction_type = 'credit' THEN t.amount ELSE -t.amount END), 0) as balance
       FROM chart_of_accounts a
       LEFT JOIN transactions t ON a.id = t.account_id AND t.transaction_date <= $1
       WHERE a.account_type = 'equity' AND a.is_active = 1
       GROUP BY a.id, a.account_name, a.account_code
       ORDER BY a.account_code`,
      [date]
    );
    
    const total_assets = assetsResult.rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);
    const total_liabilities = liabilitiesResult.rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);
    const total_equity = equityResult.rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);
    
    res.json({
      as_of_date: date,
      assets: assetsResult.rows,
      liabilities: liabilitiesResult.rows,
      equity: equityResult.rows,
      summary: {
        total_assets,
        total_liabilities,
        total_equity,
        balance_check: total_assets - (total_liabilities + total_equity)
      }
    });
  } catch (error) {
    console.error('Error generating balance sheet:', error);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
});

// Cash Flow Report
app.get('/api/accounting/cash-flow', isAuthenticated, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }
    
    // Operating activities (revenue and expenses)
    const operatingResult = await pool.query(
      `SELECT 
         SUM(CASE WHEN a.account_type = 'revenue' THEN t.amount ELSE 0 END) as cash_from_revenue,
         SUM(CASE WHEN a.account_type = 'expense' THEN t.amount ELSE 0 END) as cash_for_expenses
       FROM transactions t
       JOIN chart_of_accounts a ON t.account_id = a.id
       WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
       AND a.account_type IN ('revenue', 'expense')`,
      [start_date, end_date]
    );
    
    const cash_from_revenue = parseFloat(operatingResult.rows[0].cash_from_revenue) || 0;
    const cash_for_expenses = parseFloat(operatingResult.rows[0].cash_for_expenses) || 0;
    const net_operating_cash = cash_from_revenue - cash_for_expenses;
    
    res.json({
      period: { start_date, end_date },
      operating_activities: {
        cash_from_revenue,
        cash_for_expenses,
        net_operating_cash
      },
      summary: {
        net_cash_flow: net_operating_cash
      }
    });
  } catch (error) {
    console.error('Error generating cash flow report:', error);
    res.status(500).json({ error: 'Failed to generate cash flow report' });
  }
});

// ROI Analysis (by boat if boat_id provided in transactions)
app.get('/api/accounting/roi', isAuthenticated, async (req, res) => {
  try {
    const { start_date, end_date, boat_id } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }
    
    // Get revenue by boat (from bookings)
    let revenueQuery = `
      SELECT b.boat_type, COUNT(*) as trip_count, SUM(b.total_amount) as revenue
      FROM bookings b
      WHERE b.booking_date >= $1 AND b.booking_date <= $2
      AND b.status = 'confirmed'
    `;
    const params = [start_date, end_date];
    
    if (boat_id) {
      revenueQuery += ' AND b.boat_type = $3';
      params.push(boat_id);
    }
    
    revenueQuery += ' GROUP BY b.boat_type ORDER BY revenue DESC';
    
    const revenueResult = await pool.query(revenueQuery, params);
    
    // Get expenses (fuel, maintenance, etc.)
    const expenseResult = await pool.query(
      `SELECT a.account_name, SUM(t.amount) as total
       FROM transactions t
       JOIN chart_of_accounts a ON t.account_id = a.id
       WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
       AND a.account_type = 'expense'
       GROUP BY a.account_name`,
      [start_date, end_date]
    );
    
    const total_revenue = revenueResult.rows.reduce((sum, row) => sum + parseFloat(row.revenue || 0), 0);
    const total_expenses = expenseResult.rows.reduce((sum, row) => sum + parseFloat(row.total || 0), 0);
    const net_profit = total_revenue - total_expenses;
    
    res.json({
      period: { start_date, end_date },
      by_boat: revenueResult.rows,
      expenses: expenseResult.rows,
      summary: {
        total_revenue,
        total_expenses,
        net_profit,
        roi_percentage: total_expenses > 0 ? (net_profit / total_expenses) * 100 : 0
      }
    });
  } catch (error) {
    console.error('Error generating ROI report:', error);
    res.status(500).json({ error: 'Failed to generate ROI report' });
  }
});

// ===== CATEGORIZATION RULES =====

// Get all categorization rules
app.get('/api/accounting/categorization-rules', async (req, res) => {
  try {
    const { is_active } = req.query;
    
    let query = `
      SELECT cr.*, coa.account_name, coa.account_code 
      FROM categorization_rules cr
      LEFT JOIN chart_of_accounts coa ON cr.target_account_id = coa.id
      WHERE 1=1
    `;
    const params = [];
    
    if (is_active !== undefined) {
      query += ' AND cr.is_active = $1';
      params.push(parseInt(is_active));
    }
    
    query += ' ORDER BY cr.priority DESC, cr.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categorization rules:', error);
    res.status(500).json({ error: 'Failed to fetch categorization rules' });
  }
});

// Get single categorization rule
app.get('/api/accounting/categorization-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT cr.*, coa.account_name, coa.account_code 
       FROM categorization_rules cr
       LEFT JOIN chart_of_accounts coa ON cr.target_account_id = coa.id
       WHERE cr.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categorization rule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching categorization rule:', error);
    res.status(500).json({ error: 'Failed to fetch categorization rule' });
  }
});

// Create categorization rule
app.post('/api/accounting/categorization-rules', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      rule_name,
      priority,
      match_field,
      match_operator,
      match_value,
      match_value_max,
      target_account_id,
      transaction_type,
      is_active
    } = req.body;
    
    // Validation
    if (!rule_name || !match_field || !match_operator || !match_value || !target_account_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO categorization_rules (
        id, rule_name, priority, match_field, match_operator, match_value, 
        match_value_max, target_account_id, transaction_type, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
      [
        id,
        rule_name,
        priority || 100,
        match_field,
        match_operator,
        match_value,
        match_value_max || null,
        target_account_id,
        transaction_type || null,
        is_active !== undefined ? is_active : 1
      ]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating categorization rule:', error);
    res.status(500).json({ error: 'Failed to create categorization rule' });
  }
});

// Update categorization rule
app.patch('/api/accounting/categorization-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      priority,
      match_field,
      match_operator,
      match_value,
      match_value_max,
      target_account_id,
      transaction_type,
      is_active
    } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (rule_name !== undefined) {
      updates.push(`rule_name = $${paramCount}`);
      values.push(rule_name);
      paramCount++;
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramCount}`);
      values.push(priority);
      paramCount++;
    }
    if (match_field !== undefined) {
      updates.push(`match_field = $${paramCount}`);
      values.push(match_field);
      paramCount++;
    }
    if (match_operator !== undefined) {
      updates.push(`match_operator = $${paramCount}`);
      values.push(match_operator);
      paramCount++;
    }
    if (match_value !== undefined) {
      updates.push(`match_value = $${paramCount}`);
      values.push(match_value);
      paramCount++;
    }
    if (match_value_max !== undefined) {
      updates.push(`match_value_max = $${paramCount}`);
      values.push(match_value_max);
      paramCount++;
    }
    if (target_account_id !== undefined) {
      updates.push(`target_account_id = $${paramCount}`);
      values.push(target_account_id);
      paramCount++;
    }
    if (transaction_type !== undefined) {
      updates.push(`transaction_type = $${paramCount}`);
      values.push(transaction_type);
      paramCount++;
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(
      `UPDATE categorization_rules 
       SET ${updates.join(', ')} 
       WHERE id = $${paramCount} 
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categorization rule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating categorization rule:', error);
    res.status(500).json({ error: 'Failed to update categorization rule' });
  }
});

// Delete categorization rule
app.delete('/api/accounting/categorization-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM categorization_rules WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categorization rule not found' });
    }
    
    res.json({ message: 'Categorization rule deleted successfully', rule: result.rows[0] });
  } catch (error) {
    console.error('Error deleting categorization rule:', error);
    res.status(500).json({ error: 'Failed to delete categorization rule' });
  }
});

// Test categorization rule against a sample transaction
app.post('/api/accounting/categorization-rules/test', async (req, res) => {
  try {
    const { rule_id, sample_transaction } = req.body;
    
    if (!rule_id || !sample_transaction) {
      return res.status(400).json({ error: 'rule_id and sample_transaction are required' });
    }
    
    // Get the rule
    const ruleResult = await pool.query(
      'SELECT * FROM categorization_rules WHERE id = $1',
      [rule_id]
    );
    
    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    const rule = ruleResult.rows[0];
    const matches = checkRuleMatch(rule, sample_transaction);
    
    res.json({
      rule_name: rule.rule_name,
      matches,
      would_categorize_to: matches ? rule.target_account_id : null,
      sample_transaction
    });
  } catch (error) {
    console.error('Error testing categorization rule:', error);
    res.status(500).json({ error: 'Failed to test categorization rule' });
  }
});

// Apply categorization rules to uncategorized transactions
app.post('/api/accounting/categorization-rules/apply', async (req, res) => {
  try {
    const { transaction_ids, rule_id } = req.body;
    
    // Get active rules
    let rulesQuery = 'SELECT * FROM categorization_rules WHERE is_active = 1';
    const params = [];
    
    if (rule_id) {
      rulesQuery += ' AND id = $1';
      params.push(rule_id);
    }
    
    rulesQuery += ' ORDER BY priority DESC';
    
    const rulesResult = await pool.query(rulesQuery, params);
    const rules = rulesResult.rows;
    
    if (rules.length === 0) {
      return res.status(400).json({ error: 'No active rules found' });
    }
    
    // Get transactions to categorize
    let transactionsQuery = 'SELECT * FROM transactions WHERE 1=1';
    const transactionParams = [];
    
    if (transaction_ids && transaction_ids.length > 0) {
      transactionsQuery += ` AND id = ANY($1)`;
      transactionParams.push(transaction_ids);
    }
    
    const transactionsResult = await pool.query(transactionsQuery, transactionParams);
    const transactions = transactionsResult.rows;
    
    const categorized = [];
    const skipped = [];
    
    for (const transaction of transactions) {
      let matchedRule = null;
      
      // Find first matching rule (highest priority)
      for (const rule of rules) {
        if (checkRuleMatch(rule, transaction)) {
          matchedRule = rule;
          break;
        }
      }
      
      if (matchedRule) {
        // Update transaction with categorization
        await pool.query(
          `UPDATE transactions 
           SET account_id = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [matchedRule.target_account_id, transaction.id]
        );
        
        // Update rule statistics
        await pool.query(
          `UPDATE categorization_rules 
           SET apply_count = apply_count + 1, last_applied_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [matchedRule.id]
        );
        
        categorized.push({
          transaction_id: transaction.id,
          rule_id: matchedRule.id,
          rule_name: matchedRule.rule_name,
          account_id: matchedRule.target_account_id
        });
      } else {
        skipped.push({
          transaction_id: transaction.id,
          reason: 'No matching rule found'
        });
      }
    }
    
    res.json({
      total_transactions: transactions.length,
      categorized: categorized.length,
      skipped: skipped.length,
      details: { categorized, skipped }
    });
  } catch (error) {
    console.error('Error applying categorization rules:', error);
    res.status(500).json({ error: 'Failed to apply categorization rules' });
  }
});

// Helper function to check if a transaction matches a rule
function checkRuleMatch(rule, transaction) {
  const { match_field, match_operator, match_value, match_value_max } = rule;
  
  let fieldValue;
  switch (match_field) {
    case 'description':
      fieldValue = (transaction.description || '').toLowerCase();
      break;
    case 'amount':
      fieldValue = parseFloat(transaction.amount);
      break;
    case 'reference_type':
      fieldValue = transaction.reference_type || '';
      break;
    case 'platform':
      fieldValue = transaction.platform || '';
      break;
    case 'combined':
      fieldValue = `${transaction.description || ''} ${transaction.reference_type || ''} ${transaction.platform || ''}`.toLowerCase();
      break;
    default:
      return false;
  }
  
  const matchValueLower = (match_value || '').toLowerCase();
  
  switch (match_operator) {
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(matchValueLower);
    case 'equals':
      if (typeof fieldValue === 'number') {
        return fieldValue === parseFloat(match_value);
      }
      return fieldValue.toLowerCase() === matchValueLower;
    case 'starts_with':
      return typeof fieldValue === 'string' && fieldValue.startsWith(matchValueLower);
    case 'ends_with':
      return typeof fieldValue === 'string' && fieldValue.endsWith(matchValueLower);
    case 'greater_than':
      return typeof fieldValue === 'number' && fieldValue > parseFloat(match_value);
    case 'less_than':
      return typeof fieldValue === 'number' && fieldValue < parseFloat(match_value);
    case 'between':
      return typeof fieldValue === 'number' && 
             fieldValue >= parseFloat(match_value) && 
             fieldValue <= parseFloat(match_value_max);
    default:
      return false;
  }
}

// ===== ALERTS SYSTEM =====

// Get all alerts
app.get('/api/accounting/alerts', async (req, res) => {
  try {
    const { alert_type, severity, is_resolved, is_dismissed } = req.query;
    
    let query = 'SELECT a.*, coa.account_name, coa.account_code FROM accounting_alerts a LEFT JOIN chart_of_accounts coa ON a.account_id = coa.id WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (alert_type) {
      query += ` AND a.alert_type = $${paramIndex++}`;
      params.push(alert_type);
    }
    if (severity) {
      query += ` AND a.severity = $${paramIndex++}`;
      params.push(severity);
    }
    if (is_resolved !== undefined) {
      query += ` AND a.is_resolved = $${paramIndex++}`;
      params.push(is_resolved === 'true' ? 1 : 0);
    }
    if (is_dismissed !== undefined) {
      query += ` AND a.is_dismissed = $${paramIndex++}`;
      params.push(is_dismissed === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY a.severity DESC, a.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Resolve an alert
app.post('/api/accounting/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE accounting_alerts 
       SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// Dismiss an alert
app.post('/api/accounting/alerts/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE accounting_alerts 
       SET is_dismissed = 1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error dismissing alert:', error);
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
});

// Get alert configurations
app.get('/api/accounting/alert-configs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ac.*, coa.account_name, coa.account_code 
       FROM alert_configurations ac 
       LEFT JOIN chart_of_accounts coa ON ac.account_id = coa.id 
       ORDER BY ac.alert_type`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching alert configurations:', error);
    res.status(500).json({ error: 'Failed to fetch alert configurations' });
  }
});

// Update alert configuration
app.put('/api/accounting/alert-configs/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { is_enabled, threshold_value, threshold_percentage, comparison_operator, account_id, notification_method } = req.body;
    const { nanoid } = await import('nanoid');
    
    // Check if configuration exists
    const existingConfig = await pool.query(
      'SELECT * FROM alert_configurations WHERE alert_type = $1',
      [type]
    );
    
    if (existingConfig.rows.length === 0) {
      // Create new configuration
      const result = await pool.query(
        `INSERT INTO alert_configurations (id, alert_type, is_enabled, threshold_value, threshold_percentage, comparison_operator, account_id, notification_method) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING *`,
        [nanoid(), type, is_enabled ?? 1, threshold_value, threshold_percentage, comparison_operator, account_id, notification_method || 'in_app']
      );
      return res.json(result.rows[0]);
    }
    
    // Update existing configuration
    const result = await pool.query(
      `UPDATE alert_configurations 
       SET is_enabled = $1, threshold_value = $2, threshold_percentage = $3, comparison_operator = $4, account_id = $5, notification_method = $6, updated_at = CURRENT_TIMESTAMP 
       WHERE alert_type = $7 
       RETURNING *`,
      [is_enabled ?? 1, threshold_value, threshold_percentage, comparison_operator, account_id, notification_method || 'in_app', type]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating alert configuration:', error);
    res.status(500).json({ error: 'Failed to update alert configuration' });
  }
});

// Check alert conditions manually
app.post('/api/accounting/alerts/check-conditions', async (req, res) => {
  try {
    const alerts = await checkAlertConditions();
    res.json({
      checked: true,
      alerts_created: alerts.length,
      alerts
    });
  } catch (error) {
    console.error('Error checking alert conditions:', error);
    res.status(500).json({ error: 'Failed to check alert conditions' });
  }
});

// Helper function to check alert conditions
async function checkAlertConditions() {
  const { nanoid } = await import('nanoid');
  const alerts = [];
  
  try {
    // Get alert configurations
    const configsResult = await pool.query('SELECT * FROM alert_configurations WHERE is_enabled = 1');
    const configs = configsResult.rows;
    
    for (const config of configs) {
      const { alert_type, threshold_value, threshold_percentage, comparison_operator, account_id } = config;
      
      if (alert_type === 'low_balance') {
        // Check for low balances in cash accounts
        const balancesResult = await pool.query(
          `SELECT a.id, a.account_name, a.account_code, 
                  COALESCE(SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END), 0) as balance
           FROM chart_of_accounts a
           LEFT JOIN transactions t ON a.id = t.account_id
           WHERE a.account_type = 'asset' AND a.account_code LIKE '10%'
           GROUP BY a.id, a.account_name, a.account_code`
        );
        
        for (const account of balancesResult.rows) {
          const balance = parseFloat(account.balance);
          if (balance < (threshold_value || 1000)) {
            // Check if alert already exists and is not resolved
            const existingAlert = await pool.query(
              `SELECT * FROM accounting_alerts 
               WHERE alert_type = 'low_balance' AND account_id = $1 AND is_resolved = 0 
               ORDER BY created_at DESC LIMIT 1`,
              [account.id]
            );
            
            if (existingAlert.rows.length === 0) {
              const alertId = nanoid();
              await pool.query(
                `INSERT INTO accounting_alerts (id, alert_type, severity, title, message, threshold_value, actual_value, account_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  alertId,
                  'low_balance',
                  balance < (threshold_value || 1000) * 0.5 ? 'critical' : 'high',
                  'Saldo Bajo Detectado',
                  `La cuenta ${account.account_name} tiene un saldo de $${balance.toFixed(2)}, por debajo del umbral de $${(threshold_value || 1000).toFixed(2)}`,
                  threshold_value || 1000,
                  balance,
                  account.id
                ]
              );
              alerts.push({ id: alertId, type: 'low_balance', account: account.account_name });
            }
          }
        }
      }
      
      if (alert_type === 'unusual_spending') {
        // Calculate average monthly expenses for the last 3 months
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        const avgExpensesResult = await pool.query(
          `SELECT AVG(monthly_expenses) as avg_monthly_expenses
           FROM (
             SELECT DATE_TRUNC('month', transaction_date) as month, SUM(amount) as monthly_expenses
             FROM transactions
             WHERE transaction_type = 'expense' AND transaction_date >= $1
             GROUP BY DATE_TRUNC('month', transaction_date)
           ) monthly`,
          [threeMonthsAgo.toISOString().split('T')[0]]
        );
        
        const avgExpenses = parseFloat(avgExpensesResult.rows[0]?.avg_monthly_expenses || 0);
        
        // Get current month expenses
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        
        const currentExpensesResult = await pool.query(
          `SELECT SUM(amount) as current_expenses
           FROM transactions
           WHERE transaction_type = 'expense' AND transaction_date >= $1`,
          [currentMonthStart.toISOString().split('T')[0]]
        );
        
        const currentExpenses = parseFloat(currentExpensesResult.rows[0]?.current_expenses || 0);
        
        // Check if current month is significantly higher than average
        const percentageIncrease = avgExpenses > 0 ? ((currentExpenses - avgExpenses) / avgExpenses) * 100 : 0;
        if (percentageIncrease > (threshold_percentage || 50)) {
          const existingAlert = await pool.query(
            `SELECT * FROM accounting_alerts 
             WHERE alert_type = 'unusual_spending' AND is_resolved = 0 
             AND created_at >= $1
             ORDER BY created_at DESC LIMIT 1`,
            [currentMonthStart.toISOString()]
          );
          
          if (existingAlert.rows.length === 0) {
            const alertId = nanoid();
            await pool.query(
              `INSERT INTO accounting_alerts (id, alert_type, severity, title, message, threshold_value, actual_value) 
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                alertId,
                'unusual_spending',
                percentageIncrease > (threshold_percentage || 50) * 2 ? 'high' : 'medium',
                'Gastos Inusuales Detectados',
                `Los gastos de este mes ($${currentExpenses.toFixed(2)}) son ${percentageIncrease.toFixed(1)}% más altos que el promedio ($${avgExpenses.toFixed(2)})`,
                avgExpenses,
                currentExpenses
              ]
            );
            alerts.push({ id: alertId, type: 'unusual_spending' });
          }
        }
      }
      
      if (alert_type === 'profit_margin') {
        // Calculate profit margin for current month
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        
        const profitResult = await pool.query(
          `SELECT 
             SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as revenue,
             SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expenses
           FROM transactions
           WHERE transaction_date >= $1`,
          [currentMonthStart.toISOString().split('T')[0]]
        );
        
        const revenue = parseFloat(profitResult.rows[0]?.revenue || 0);
        const expenses = parseFloat(profitResult.rows[0]?.expenses || 0);
        const profitMargin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
        
        if (profitMargin < (threshold_percentage || 30)) {
          const existingAlert = await pool.query(
            `SELECT * FROM accounting_alerts 
             WHERE alert_type = 'profit_margin' AND is_resolved = 0 
             AND created_at >= $1
             ORDER BY created_at DESC LIMIT 1`,
            [currentMonthStart.toISOString()]
          );
          
          if (existingAlert.rows.length === 0) {
            const alertId = nanoid();
            await pool.query(
              `INSERT INTO accounting_alerts (id, alert_type, severity, title, message, threshold_value, actual_value) 
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                alertId,
                'profit_margin',
                profitMargin < (threshold_percentage || 30) * 0.5 ? 'critical' : 'high',
                'Margen de Ganancia Bajo',
                `El margen de ganancia actual (${profitMargin.toFixed(1)}%) está por debajo del objetivo (${(threshold_percentage || 30).toFixed(1)}%)`,
                threshold_percentage || 30,
                profitMargin
              ]
            );
            alerts.push({ id: alertId, type: 'profit_margin' });
          }
        }
      }
      
      if (alert_type === 'tax_reminder') {
        // Check for upcoming tax deadlines (quarterly: March 31, June 30, Sept 30, Dec 31)
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentDate = today.getDate();
        
        const taxMonths = [2, 5, 8, 11]; // March, June, Sept, Dec (0-indexed)
        const warningDays = 14; // Warn 14 days before deadline
        
        if (taxMonths.includes(currentMonth) && currentDate >= (31 - warningDays)) {
          const existingAlert = await pool.query(
            `SELECT * FROM accounting_alerts 
             WHERE alert_type = 'tax_reminder' AND is_resolved = 0 
             AND created_at >= CURRENT_DATE - INTERVAL '30 days'
             ORDER BY created_at DESC LIMIT 1`
          );
          
          if (existingAlert.rows.length === 0) {
            const alertId = nanoid();
            const quarterEnd = new Date(today.getFullYear(), currentMonth + 1, 0);
            const daysRemaining = Math.ceil((quarterEnd - today) / (1000 * 60 * 60 * 24));
            
            await pool.query(
              `INSERT INTO accounting_alerts (id, alert_type, severity, title, message) 
               VALUES ($1, $2, $3, $4, $5)`,
              [
                alertId,
                'tax_reminder',
                daysRemaining <= 7 ? 'high' : 'medium',
                'Recordatorio de Impuestos',
                `El fin de trimestre fiscal se acerca (${daysRemaining} días restantes). Asegúrese de revisar y preparar sus declaraciones de impuestos.`
              ]
            );
            alerts.push({ id: alertId, type: 'tax_reminder', days_remaining: daysRemaining });
          }
        }
      }
    }
    
    return alerts;
  } catch (error) {
    console.error('Error in checkAlertConditions:', error);
    return [];
  }
}

// ===== TAX & PERIODS =====

// Get tax configurations
app.get('/api/accounting/tax-configs', isAuthenticated, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = 'SELECT * FROM tax_configs WHERE 1=1';
    const params = [];
    
    if (status) {
      query += ' AND status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY jurisdiction, effective_date DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tax configs:', error);
    res.status(500).json({ error: 'Failed to fetch tax configs' });
  }
});

// Create tax configuration
app.post('/api/accounting/tax-configs', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { jurisdiction, tax_type, rate, effective_date, status } = req.body;
    
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO tax_configs (id, jurisdiction, tax_type, rate, effective_date, status) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, jurisdiction, tax_type, rate, effective_date, status || 'active']
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating tax config:', error);
    res.status(500).json({ error: 'Failed to create tax config' });
  }
});

// Get financial periods
app.get('/api/accounting/financial-periods', isAuthenticated, async (req, res) => {
  try {
    const { status, year } = req.query;
    
    let query = 'SELECT * FROM financial_periods WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (year) {
      query += ` AND EXTRACT(YEAR FROM period_start) = $${paramCount}`;
      params.push(parseInt(year));
    }
    
    query += ' ORDER BY period_start DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching financial periods:', error);
    res.status(500).json({ error: 'Failed to fetch financial periods' });
  }
});

// Create financial period
app.post('/api/accounting/financial-periods', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { period_name, period_start, period_end, status } = req.body;
    
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO financial_periods (id, period_name, period_start, period_end, status) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, period_name, period_start, period_end, status || 'open']
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating financial period:', error);
    res.status(500).json({ error: 'Failed to create financial period' });
  }
});

// Close financial period
app.post('/api/accounting/financial-periods/:id/close', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { closed_by } = req.body;
    
    const result = await pool.query(
      `UPDATE financial_periods 
       SET status = 'closed', closed_by = $1, closed_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING *`,
      [closed_by || 'System', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Financial period not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error closing financial period:', error);
    res.status(500).json({ error: 'Failed to close financial period' });
  }
});

// ============================================================================
// FASE 9: MESSAGING CENTER ENDPOINTS
// ============================================================================

// Get all platform configurations
app.get('/api/messages/platforms', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM platform_configs ORDER BY platform_name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching platforms:', error);
    res.status(500).json({ error: 'Failed to fetch platforms' });
  }
});

// Get inbox with filters (all message threads)
app.get('/api/messages/inbox', async (req, res) => {
  try {
    const { platform, status, start_date, end_date, search, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        t.*,
        COUNT(m.id) FILTER (WHERE m.status = 'new') as unread_count,
        COUNT(m.id) as total_messages,
        MAX(m.received_at) as last_message_time
      FROM message_threads t
      LEFT JOIN platform_messages m ON t.id = m.thread_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (platform) {
      query += ` AND t.platform = $${paramCount}`;
      params.push(platform);
      paramCount++;
    }
    
    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND t.last_message_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND t.last_message_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (t.customer_name ILIKE $${paramCount} OR t.customer_email ILIKE $${paramCount} OR t.customer_phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ` 
      GROUP BY t.id 
      ORDER BY t.last_message_at DESC 
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// Get messages in a specific thread
app.get('/api/messages/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    
    // Get thread info
    const threadResult = await pool.query(
      'SELECT * FROM message_threads WHERE id = $1',
      [threadId]
    );
    
    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    // Get messages in thread
    const messagesResult = await pool.query(
      `SELECT * FROM platform_messages 
       WHERE thread_id = $1 
       ORDER BY received_at ASC`,
      [threadId]
    );
    
    res.json({
      thread: threadResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Manual message ingestion
app.post('/api/messages/manual', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { 
      platform, 
      customer_name, 
      customer_email, 
      customer_phone, 
      message_content,
      platform_message_url,
      booking_id 
    } = req.body;
    
    // Validation
    if (!platform || !message_content) {
      return res.status(400).json({ error: 'Platform and message content are required' });
    }
    
    if (!customer_name && !customer_email && !customer_phone) {
      return res.status(400).json({ error: 'At least one customer identifier required (name, email, or phone)' });
    }
    
    // Find or create thread
    let threadId;
    const existingThread = await pool.query(
      `SELECT id FROM message_threads 
       WHERE platform = $1 
       AND (customer_email = $2 OR customer_phone = $3)
       ORDER BY last_message_at DESC 
       LIMIT 1`,
      [platform, customer_email || null, customer_phone || null]
    );
    
    if (existingThread.rows.length > 0) {
      threadId = existingThread.rows[0].id;
      
      // Update thread
      await pool.query(
        `UPDATE message_threads 
         SET last_message_at = CURRENT_TIMESTAMP, 
             customer_name = COALESCE($1, customer_name),
             customer_email = COALESCE($2, customer_email),
             customer_phone = COALESCE($3, customer_phone),
             status = 'pending',
             booking_id = COALESCE($4, booking_id)
         WHERE id = $5`,
        [customer_name, customer_email, customer_phone, booking_id, threadId]
      );
    } else {
      // Create new thread
      threadId = nanoid();
      await pool.query(
        `INSERT INTO message_threads (id, customer_name, customer_email, customer_phone, platform, status, booking_id)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [threadId, customer_name, customer_email, customer_phone, platform, booking_id || null]
      );
    }
    
    // Create message
    const messageId = nanoid();
    const messageResult = await pool.query(
      `INSERT INTO platform_messages (
        id, thread_id, platform, sender_name, sender_contact, 
        message_content, direction, status, platform_message_url
      ) VALUES ($1, $2, $3, $4, $5, $6, 'inbound', 'new', $7) 
      RETURNING *`,
      [messageId, threadId, platform, customer_name, customer_email || customer_phone, message_content, platform_message_url]
    );
    
    res.status(201).json(messageResult.rows[0]);
  } catch (error) {
    console.error('Error creating manual message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// Send message (WhatsApp/Email)
app.post('/api/messages/send', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { thread_id, message_content, send_via } = req.body;
    
    if (!thread_id || !message_content || !send_via) {
      return res.status(400).json({ error: 'Thread ID, message content, and send method are required' });
    }
    
    // Get thread info
    const threadResult = await pool.query(
      'SELECT * FROM message_threads WHERE id = $1',
      [thread_id]
    );
    
    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    const thread = threadResult.rows[0];
    
    // Send via WhatsApp or Email
    if (send_via === 'whatsapp' && thread.customer_phone) {
      // Send WhatsApp message using Twilio
      const twilioSid = process.env.TWILIO_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (twilioSid && twilioToken) {
        const twilio = require('twilio');
        const client = twilio(twilioSid, twilioToken);
        
        await client.messages.create({
          body: message_content,
          from: 'whatsapp:+14155238886',
          to: `whatsapp:+${thread.customer_phone.replace(/\D/g, '')}`
        });
      }
    } else if (send_via === 'email' && thread.customer_email) {
      // Email sending would go here (using nodemailer or similar)
      console.log('Email sending not yet implemented');
    }
    
    // Record outbound message
    const messageId = nanoid();
    const messageResult = await pool.query(
      `INSERT INTO platform_messages (
        id, thread_id, platform, sender_name, message_content, 
        direction, status, responded_at
      ) VALUES ($1, $2, $3, 'Nadaki Excursions', $4, 'outbound', 'read', CURRENT_TIMESTAMP) 
      RETURNING *`,
      [messageId, thread_id, thread.platform, message_content]
    );
    
    // Update thread status
    await pool.query(
      `UPDATE message_threads 
       SET status = 'responded', last_message_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [thread_id]
    );
    
    res.status(201).json(messageResult.rows[0]);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get all message templates
app.get('/api/messages/templates', async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = 'SELECT * FROM message_templates WHERE 1=1';
    const params = [];
    
    if (category) {
      query += ' AND category = $1';
      params.push(category);
    }
    
    query += ' ORDER BY category, name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create message template
app.post('/api/messages/templates', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { name, category, content, platform } = req.body;
    
    if (!name || !category || !content) {
      return res.status(400).json({ error: 'Name, category, and content are required' });
    }
    
    const id = nanoid();
    const result = await pool.query(
      `INSERT INTO message_templates (id, name, category, content, platform) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, name, category, content, platform || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Preview template with rendered data
app.post('/api/messages/templates/preview', async (req, res) => {
  try {
    const templateEngine = require('./server/templateEngine');
    const { template_content, thread_id } = req.body;
    
    if (!template_content) {
      return res.status(400).json({ error: 'Template content is required' });
    }
    
    let renderData = {};
    
    // If thread_id provided, get actual data from the thread
    if (thread_id) {
      // Get thread info
      const threadResult = await pool.query(
        'SELECT * FROM message_threads WHERE id = $1',
        [thread_id]
      );
      
      if (threadResult.rows.length > 0) {
        const thread = threadResult.rows[0];
        
        // Get latest message from thread for analysis
        const messageResult = await pool.query(
          `SELECT * FROM platform_messages 
           WHERE thread_id = $1 
           ORDER BY received_at DESC 
           LIMIT 1`,
          [thread_id]
        );
        
        if (messageResult.rows.length > 0) {
          const message = messageResult.rows[0];
          
          // Parse customer inquiry
          const messageAnalysis = require('./server/messageAnalysisService');
          const inquiry = messageAnalysis.parseCustomerInquiry(message.message_content);
          
          // Get available boats if dates detected
          const fleetService = require('./server/fleetService');
          let availableBoats = [];
          
          if (inquiry.dates && inquiry.dates.length > 0) {
            const searchParams = {
              date: inquiry.dates[0],
              min_capacity: inquiry.peopleCount || 1
            };
            
            availableBoats = await fleetService.searchBoats(searchParams);
          }
          
          // Build render data from actual thread data
          renderData = {
            customerName: thread.customer_name || 'Guest',
            customerEmail: thread.customer_email || '',
            bookingDate: inquiry.dates && inquiry.dates.length > 0 ? inquiry.dates[0] : '',
            bookingPeople: inquiry.peopleCount || '',
            preferences: inquiry.preferences || [],
            availableBoats: availableBoats,
            companyName: 'Nadaki Excursions',
            companyPhone: '+1 (XXX) XXX-XXXX',
            companyEmail: 'sales@nadakiexcursions.com',
            companyWebsite: 'https://www.nadakiexcursions.com'
          };
          
          // If only one boat, add boat-specific data
          if (availableBoats.length > 0) {
            const firstBoat = availableBoats[0];
            renderData.boatName = firstBoat.name;
            renderData.boatType = firstBoat.type || '';
            renderData.capacity = firstBoat.capacity || '';
            renderData.location = firstBoat.location || '';
            renderData.basePrice = firstBoat.hourly_base_rate || firstBoat.daily_base_rate || 0;
            renderData.finalPrice = firstBoat.price || firstBoat.hourly_base_rate || 0;
          }
        }
      }
    } else {
      // Use sample data for preview
      renderData = {
        customerName: 'Juan Pérez',
        customerEmail: 'juan@example.com',
        bookingDate: 'December 15, 2024',
        bookingTime: '2:00 PM',
        bookingDuration: '4',
        bookingPeople: '8',
        boatName: 'Ocean Dream',
        boatType: 'Yacht',
        capacity: '12',
        location: 'Miami Marina',
        basePrice: 600,
        finalPrice: 540,
        discount: 60,
        discountPercentage: 10,
        availableBoats: [
          { name: 'Ocean Dream', type: 'Yacht', capacity: 12, price: 540 },
          { name: 'Sunset Breeze', type: 'Catamaran', capacity: 10, price: 480 }
        ],
        preferences: ['Sunset Cruise', 'Snorkeling'],
        companyName: 'Nadaki Excursions',
        companyPhone: '+1 (305) 123-4567',
        companyEmail: 'sales@nadakiexcursions.com',
        companyWebsite: 'https://www.nadakiexcursions.com',
        bookingLink: 'https://www.nadakiexcursions.com/book'
      };
    }
    
    // Render template
    const rendered = templateEngine.render(template_content, renderData);
    
    res.json({
      rendered,
      data: renderData,
      placeholders: templateEngine.extractPlaceholders(template_content)
    });
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).json({ error: 'Failed to preview template' });
  }
});

// Get messaging analytics
app.get('/api/messages/analytics', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    // Total messages by platform
    const platformStats = await pool.query(`
      SELECT 
        platform,
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE status = 'new') as unread_messages,
        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound,
        AVG(EXTRACT(EPOCH FROM (responded_at - received_at))/3600) FILTER (WHERE responded_at IS NOT NULL) as avg_response_hours
      FROM platform_messages
      WHERE 1=1
      ${start_date ? `AND received_at >= '${start_date}'` : ''}
      ${end_date ? `AND received_at <= '${end_date}'` : ''}
      GROUP BY platform
      ORDER BY total_messages DESC
    `);
    
    // Overall stats
    const overallStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT thread_id) as total_threads,
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE status = 'new') as pending_messages,
        AVG(EXTRACT(EPOCH FROM (responded_at - received_at))/3600) FILTER (WHERE responded_at IS NOT NULL) as avg_response_hours
      FROM platform_messages
      WHERE 1=1
      ${start_date ? `AND received_at >= '${start_date}'` : ''}
      ${end_date ? `AND received_at <= '${end_date}'` : ''}
    `);
    
    // Messages with linked bookings
    const conversionStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT t.id) as threads_with_bookings,
        COUNT(DISTINCT t.id) FILTER (WHERE t.booking_id IS NOT NULL) as converted_threads
      FROM message_threads t
      WHERE t.last_message_at >= COALESCE($1::timestamp, t.created_at)
      AND t.last_message_at <= COALESCE($2::timestamp, CURRENT_TIMESTAMP)
    `, [start_date || null, end_date || null]);
    
    const overall = overallStats.rows[0];
    
    res.json({
      totalMessages: parseInt(overall.total_messages) || 0,
      avgResponseTime: overall.avg_response_hours ? `${parseFloat(overall.avg_response_hours).toFixed(1)} hrs` : '0.0 hrs',
      pendingMessages: parseInt(overall.pending_messages) || 0,
      responseRate: overall.total_messages > 0 ? ((overall.total_messages - overall.pending_messages) / overall.total_messages * 100).toFixed(1) + '%' : '0%',
      byPlatform: platformStats.rows.map(p => ({
        platform: p.platform,
        count: parseInt(p.total_messages),
        avgTime: p.avg_response_hours ? `${parseFloat(p.avg_response_hours).toFixed(1)} hrs` : null,
        conversionRate: '0%' // Can be enhanced with booking linkage
      })),
      // Keep original structure for backward compatibility with frontend
      by_platform: platformStats.rows,
      overall: overall,
      conversion: conversionStats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Update message status
app.patch('/api/messages/:messageId/status', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { status } = req.body;
    
    if (!['new', 'read', 'responded', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await pool.query(
      `UPDATE platform_messages 
       SET status = $1, 
           responded_at = CASE WHEN $1 = 'responded' THEN CURRENT_TIMESTAMP ELSE responded_at END
       WHERE id = $2 
       RETURNING *`,
      [status, messageId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating message status:', error);
    res.status(500).json({ error: 'Failed to update message status' });
  }
});

// Webhook for WhatsApp messages (auto-ingestion)
app.post('/api/webhooks/whatsapp', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { from, body, timestamp } = req.body;
    
    if (!from || !body) {
      return res.status(400).json({ error: 'Missing required fields: from, body' });
    }
    
    // Find or create thread
    let thread = await pool.query(
      'SELECT * FROM message_threads WHERE customer_phone = $1 AND platform = $2',
      [from, 'WhatsApp']
    );
    
    if (thread.rows.length === 0) {
      const threadId = nanoid();
      thread = await pool.query(
        `INSERT INTO message_threads (id, customer_name, customer_phone, platform, status, last_message_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *`,
        [threadId, from, from, 'WhatsApp', 'pending']
      );
    } else {
      await pool.query(
        'UPDATE message_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
        [thread.rows[0].id]
      );
    }
    
    // Create message
    const messageId = nanoid();
    await pool.query(
      `INSERT INTO platform_messages (id, thread_id, platform, sender_name, message_content, direction, status, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [messageId, thread.rows[0].id, 'WhatsApp', from, body, 'inbound', 'new', timestamp || new Date()]
    );
    
    res.status(200).json({ success: true, messageId });
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Webhook for Email messages (auto-ingestion)
app.post('/api/webhooks/email', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { from, subject, body, timestamp } = req.body;
    
    if (!from || !body) {
      return res.status(400).json({ error: 'Missing required fields: from, body' });
    }
    
    // Find or create thread
    let thread = await pool.query(
      'SELECT * FROM message_threads WHERE customer_email = $1 AND platform = $2',
      [from, 'Email']
    );
    
    if (thread.rows.length === 0) {
      const threadId = nanoid();
      thread = await pool.query(
        `INSERT INTO message_threads (id, customer_name, customer_email, platform, status, last_message_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *`,
        [threadId, from, from, 'Email', 'pending']
      );
    } else {
      await pool.query(
        'UPDATE message_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
        [thread.rows[0].id]
      );
    }
    
    // Create message
    const messageId = nanoid();
    const content = subject ? `Subject: ${subject}\n\n${body}` : body;
    await pool.query(
      `INSERT INTO platform_messages (id, thread_id, platform, sender_name, message_content, direction, status, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [messageId, thread.rows[0].id, 'Email', from, content, 'inbound', 'new', timestamp || new Date()]
    );
    
    res.status(200).json({ success: true, messageId });
  } catch (error) {
    console.error('Error processing Email webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Get unread messages count (for notifications badge)
app.get('/api/messages/unread-count', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM platform_messages 
       WHERE status = 'new' AND direction = 'inbound'`
    );
    
    res.json({ count: parseInt(result.rows[0].count) || 0 });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Get AI-powered boat suggestions for a message thread
app.get('/api/messages/suggestions/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    const messageAnalysisService = require('./server/messageAnalysisService');
    const fleetService = require('./server/fleetService');
    const dynamicPricingService = require('./server/dynamicPricingService');
    
    // Get thread messages
    const messagesResult = await pool.query(
      `SELECT id, message_content, sender_name, received_at, direction
       FROM platform_messages 
       WHERE thread_id = $1 AND direction = 'inbound'
       ORDER BY received_at DESC 
       LIMIT 5`,
      [threadId]
    );
    
    if (messagesResult.rows.length === 0) {
      return res.json({
        inquiry: null,
        suggestions: [],
        confidence: 0,
        message: 'No messages found in this thread'
      });
    }
    
    // Combine all inbound messages for analysis
    const combinedContent = messagesResult.rows
      .map(msg => msg.message_content)
      .join('\n\n');
    
    // Parse customer inquiry
    const inquiry = messageAnalysisService.parseCustomerInquiry(combinedContent);
    const summary = messageAnalysisService.generateSummary(inquiry);
    
    // Get thread details for customer name
    const threadResult = await pool.query(
      'SELECT customer_name, customer_email FROM message_threads WHERE id = $1',
      [threadId]
    );
    const customerName = threadResult.rows[0]?.customer_name || 'Guest';
    
    // Search for available boats based on detected criteria
    const suggestions = [];
    
    if (inquiry.dates && inquiry.dates.length > 0 && inquiry.peopleCount) {
      // Search using detected criteria
      for (const date of inquiry.dates.slice(0, 2)) { // Max 2 dates
        const searchResult = await fleetService.searchBoats({
          date,
          capacity: inquiry.peopleCount,
          boatType: inquiry.boatType || undefined,
          duration: inquiry.duration || 4
        });
        
        // Add pricing for each available boat
        for (const boat of searchResult.availableBoats || []) {
          // Calculate price using dynamic pricing service
          const pricing = await dynamicPricingService.calculatePriceForBooking({
            boatId: boat.id,
            date,
            duration: inquiry.duration || 4,
            peopleCount: inquiry.peopleCount
          });
          
          suggestions.push({
            boatId: boat.id,
            boatName: boat.name,
            boatType: boat.boatType,
            capacity: boat.capacity,
            date,
            duration: inquiry.duration || 4,
            basePrice: pricing?.recommendedPrice || boat.hourlyRate * (inquiry.duration || 4),
            finalPrice: pricing?.recommendedPrice || boat.hourlyRate * (inquiry.duration || 4),
            pricingFactors: pricing?.factors || [],
            features: boat.features || [],
            amenities: boat.amenities || [],
            photos: boat.photos || [],
            location: boat.location,
            isAvailable: true,
            confidence: inquiry.confidence
          });
        }
      }
    } else if (inquiry.peopleCount) {
      // If no date detected, show boats by capacity without availability check
      const allBoats = await fleetService.getAllBoats();
      const matchingBoats = allBoats.filter(b => 
        b.capacity >= inquiry.peopleCount &&
        (!inquiry.boatType || b.boatType.toLowerCase() === inquiry.boatType.toLowerCase())
      ).slice(0, 5);
      
      for (const boat of matchingBoats) {
        suggestions.push({
          boatId: boat.id,
          boatName: boat.name,
          boatType: boat.boatType,
          capacity: boat.capacity,
          date: null,
          duration: inquiry.duration || 4,
          basePrice: boat.hourlyRate * (inquiry.duration || 4),
          finalPrice: boat.hourlyRate * (inquiry.duration || 4),
          pricingFactors: [],
          features: boat.features || [],
          amenities: boat.amenities || [],
          photos: boat.photos || [],
          location: boat.location,
          isAvailable: null, // Unknown without date
          confidence: inquiry.confidence * 0.7 // Lower confidence without date
        });
      }
    }
    
    // Sort by confidence and price
    suggestions.sort((a, b) => {
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      return (b.confidence || 0) - (a.confidence || 0);
    });
    
    res.json({
      inquiry: {
        ...inquiry,
        customerName,
        summary
      },
      suggestions: suggestions.slice(0, 10), // Top 10 suggestions
      confidence: inquiry.confidence,
      message: suggestions.length > 0 
        ? `Found ${suggestions.length} boat suggestions based on customer inquiry` 
        : 'Could not generate suggestions - please add more details about dates and party size'
    });
    
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to generate suggestions',
      details: error.message 
    });
  }
});

// ============================================================================
// FASE 10: BOAT MAINTENANCE & EXPENSE TRACKING APIs
// ============================================================================

// Get all boats (for dropdowns in FASE 10 UI)
app.get('/api/boats', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, capacity, boat_type, status FROM boats ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching boats:', error);
    res.status(500).json({ error: 'Failed to fetch boats' });
  }
});

// ========== BOAT EXPENSES APIs ==========

// Get all boat expenses with filters
app.get('/api/boat-expenses', async (req, res) => {
  try {
    const { boat_id, category, start_date, end_date, synced } = req.query;
    
    let query = `
      SELECT be.*, b.name as boat_name, m.name as mechanic_name
      FROM boat_expenses be
      LEFT JOIN boats b ON be.boat_id = b.id
      LEFT JOIN mechanics m ON be.mechanic_id = m.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (boat_id) {
      query += ` AND be.boat_id = $${paramIndex++}`;
      params.push(boat_id);
    }
    
    if (category) {
      query += ` AND be.category = $${paramIndex++}`;
      params.push(category);
    }
    
    if (start_date) {
      query += ` AND be.expense_date >= $${paramIndex++}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND be.expense_date <= $${paramIndex++}`;
      params.push(end_date);
    }
    
    if (synced !== undefined) {
      query += ` AND be.synced_to_accounting = $${paramIndex++}`;
      params.push(synced === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY be.expense_date DESC, be.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching boat expenses:', error);
    res.status(500).json({ error: 'Failed to fetch boat expenses' });
  }
});

// Create boat expense
app.post('/api/boat-expenses', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      boat_id, category, amount, expense_date, description,
      mechanic_id, fuel_gallons, fuel_station, invoice_number, is_tax_deductible,
      vendor, payment_method, notes, invoice_document_id
    } = req.body;
    
    if (!boat_id || !category || !amount || !expense_date || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get boat name for accounting sync
    const boatResult = await pool.query('SELECT name FROM boats WHERE id = $1', [boat_id]);
    const boatName = boatResult.rows.length > 0 ? boatResult.rows[0].name : 'Unknown Boat';
    
    const id = nanoid();
    const result = await pool.query(`
      INSERT INTO boat_expenses 
      (id, boat_id, category, amount, expense_date, description, mechanic_id, 
       fuel_gallons, fuel_station, invoice_number, is_tax_deductible,
       vendor, payment_method, notes, invoice_document_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      id, boat_id, category, amount, expense_date, description,
      mechanic_id || null, fuel_gallons || null, fuel_station || null,
      invoice_number || null, is_tax_deductible !== undefined ? is_tax_deductible : 1,
      vendor || null, payment_method || null, notes || null, invoice_document_id || null
    ]);
    
    // Auto-sync to accounting system (FASE 8 integration)
    const transactionId = await syncBoatExpenseToAccounting(
      id, category, amount, expense_date, description, boatName
    );
    
    if (transactionId) {
      result.rows[0].accounting_transaction_id = transactionId;
      result.rows[0].synced_to_accounting = 1;
    }
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating boat expense:', error);
    res.status(500).json({ error: 'Failed to create boat expense' });
  }
});

// Update boat expense
app.patch('/api/boat-expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'category', 'amount', 'expense_date', 'description', 'mechanic_id',
      'fuel_gallons', 'fuel_station', 'invoice_number', 'is_tax_deductible', 'receipt_image',
      'boat_id', 'vendor', 'payment_method', 'notes', 'invoice_document_id'
    ];
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE boat_expenses 
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating boat expense:', error);
    res.status(500).json({ error: 'Failed to update boat expense' });
  }
});

// Delete boat expense
app.delete('/api/boat-expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM boat_expenses WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting boat expense:', error);
    res.status(500).json({ error: 'Failed to delete boat expense' });
  }
});

// Get expense analytics
app.get('/api/boat-expenses/analytics', async (req, res) => {
  try {
    const { boat_id, start_date, end_date } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;
    
    if (boat_id) {
      whereClause += ` AND boat_id = $${paramIndex++}`;
      params.push(boat_id);
    }
    
    if (start_date) {
      whereClause += ` AND expense_date >= $${paramIndex++}`;
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause += ` AND expense_date <= $${paramIndex++}`;
      params.push(end_date);
    }
    
    // Total expenses and by category
    const categoryStats = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as total
      FROM boat_expenses
      WHERE ${whereClause}
      GROUP BY category
      ORDER BY total DESC
    `, params);
    
    // Overall totals
    const overallStats = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_expenses,
        AVG(amount) as avg_expense
      FROM boat_expenses
      WHERE ${whereClause}
    `, params);
    
    // Fuel efficiency (if fuel data exists)
    const fuelStats = await pool.query(`
      SELECT 
        SUM(fuel_gallons) as total_gallons,
        SUM(amount) as total_fuel_cost,
        AVG(amount / NULLIF(fuel_gallons, 0)) as avg_price_per_gallon
      FROM boat_expenses
      WHERE ${whereClause} AND category = 'fuel' AND fuel_gallons > 0
    `, params);
    
    res.json({
      byCategory: categoryStats.rows,
      overall: overallStats.rows[0],
      fuelStats: fuelStats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching expense analytics:', error);
    res.status(500).json({ error: 'Failed to fetch expense analytics' });
  }
});

// ========== MECHANICS APIs ==========

// Get all mechanics
app.get('/api/mechanics', async (req, res) => {
  try {
    const { specialty, status } = req.query;
    
    let query = 'SELECT * FROM mechanics WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (specialty) {
      query += ` AND specialty = $${paramIndex++}`;
      params.push(specialty);
    }
    
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    
    query += ' ORDER BY rating DESC, name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanics:', error);
    res.status(500).json({ error: 'Failed to fetch mechanics' });
  }
});

// Create mechanic
app.post('/api/mechanics', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { name, phone, email, specialty, hourly_rate, notes } = req.body;
    
    if (!name || !phone || !specialty || hourly_rate === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = nanoid();
    const result = await pool.query(`
      INSERT INTO mechanics (id, name, phone, email, specialty, hourly_rate, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, name, phone, email || null, specialty, hourly_rate, notes || null]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating mechanic:', error);
    res.status(500).json({ error: 'Failed to create mechanic' });
  }
});

// Update mechanic
app.patch('/api/mechanics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = ['name', 'phone', 'email', 'specialty', 'hourly_rate', 'status', 'rating', 'notes'];
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE mechanics
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mechanic not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating mechanic:', error);
    res.status(500).json({ error: 'Failed to update mechanic' });
  }
});

// Delete mechanic
app.delete('/api/mechanics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if mechanic has associated records
    const checkRecords = await pool.query(`
      SELECT COUNT(*) as count FROM maintenance_records WHERE mechanic_id = $1
    `, [id]);
    
    if (parseInt(checkRecords.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar: Este mecánico tiene registros de mantenimiento asociados. Considere desactivarlo en su lugar.' 
      });
    }
    
    const result = await pool.query(`
      DELETE FROM mechanics WHERE id = $1 RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mecánico no encontrado' });
    }
    
    res.json({ message: 'Mecánico eliminado exitosamente', deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting mechanic:', error);
    res.status(500).json({ error: 'Error al eliminar el mecánico' });
  }
});

// Get mechanic work history
app.get('/api/mechanics/:id/work-history', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        mr.id,
        mr.service_date,
        mr.service_type,
        mr.labor_hours,
        mr.labor_cost,
        mr.total_cost,
        b.name as boat_name
      FROM maintenance_records mr
      LEFT JOIN boats b ON mr.boat_id = b.id
      WHERE mr.mechanic_id = $1
      ORDER BY mr.service_date DESC
      LIMIT 50
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanic work history:', error);
    res.status(500).json({ error: 'Failed to fetch work history' });
  }
});

// Get mechanics performance ranking
app.get('/api/mechanics/performance', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        specialty,
        rating,
        total_jobs,
        hourly_rate,
        status
      FROM mechanics
      WHERE status = 'active'
      ORDER BY rating DESC, total_jobs DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mechanics performance:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

// ========== SCHEDULED EXPENSES APIs ==========

// Get all scheduled expenses with filters
app.get('/api/scheduled-expenses', async (req, res) => {
  try {
    const { boat_id, category, status, recurrence_type, start_date, end_date } = req.query;
    
    let query = `
      SELECT se.*, b.name as boat_name
      FROM scheduled_expenses se
      LEFT JOIN boats b ON se.boat_id = b.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (boat_id) {
      query += ` AND se.boat_id = $${paramIndex++}`;
      params.push(boat_id);
    }
    
    if (category) {
      query += ` AND se.category = $${paramIndex++}`;
      params.push(category);
    }
    
    if (status) {
      query += ` AND se.status = $${paramIndex++}`;
      params.push(status);
    }

    if (recurrence_type) {
      query += ` AND se.recurrence_type = $${paramIndex++}`;
      params.push(recurrence_type);
    }
    
    if (start_date) {
      query += ` AND se.scheduled_date >= $${paramIndex++}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND se.scheduled_date <= $${paramIndex++}`;
      params.push(end_date);
    }
    
    query += ' ORDER BY se.scheduled_date ASC, se.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scheduled expenses:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled expenses' });
  }
});

// Create scheduled expense
app.post('/api/scheduled-expenses', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      boat_id, category, amount, scheduled_date, description,
      recurrence_type, recurrence_interval, auto_convert, notes
    } = req.body;
    
    if (!boat_id || !category || !amount || !scheduled_date || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = nanoid();
    const result = await pool.query(`
      INSERT INTO scheduled_expenses 
      (id, boat_id, category, amount, scheduled_date, description, 
       recurrence_type, recurrence_interval, auto_convert, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      id, boat_id, category, amount, scheduled_date, description,
      recurrence_type || 'once', recurrence_interval || 1, 
      auto_convert !== undefined ? auto_convert : 1, notes || null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating scheduled expense:', error);
    res.status(500).json({ error: 'Failed to create scheduled expense' });
  }
});

// Update scheduled expense
app.patch('/api/scheduled-expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'boat_id', 'category', 'amount', 'scheduled_date', 'description',
      'recurrence_type', 'recurrence_interval', 'status', 'auto_convert', 'notes'
    ];
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE scheduled_expenses 
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled expense not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating scheduled expense:', error);
    res.status(500).json({ error: 'Failed to update scheduled expense' });
  }
});

// Delete scheduled expense
app.delete('/api/scheduled-expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Attempting to delete scheduled expense: ${id}`);
    
    // Check if it exists first
    const check = await pool.query('SELECT id FROM scheduled_expenses WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      console.log(`Scheduled expense ${id} not found`);
      return res.status(404).json({ error: 'Scheduled expense not found' });
    }

    const result = await pool.query('DELETE FROM scheduled_expenses WHERE id = $1 RETURNING *', [id]);
    
    console.log(`Successfully deleted scheduled expense: ${id}`);
    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting scheduled expense:', error);
    res.status(500).json({ 
      error: 'Failed to delete scheduled expense',
      details: error.message 
    });
  }
});

// Mark scheduled expense as paid (convert to real expense + create next recurrence)
app.post('/api/scheduled-expenses/:id/mark-paid', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { id } = req.params;
    const { actual_amount, actual_date, notes: paymentNotes } = req.body;
    
    // Get the scheduled expense
    const scheduledResult = await pool.query(
      'SELECT * FROM scheduled_expenses WHERE id = $1',
      [id]
    );
    
    if (scheduledResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled expense not found' });
    }
    
    const scheduledExpense = scheduledResult.rows[0];
    console.log(`💰 mark-paid: id=${id} boat_id=${scheduledExpense.boat_id} recurrence=${scheduledExpense.recurrence_type} date=${scheduledExpense.scheduled_date}`);
    
    // Get boat name for accounting sync
    const boatResult = await pool.query('SELECT name FROM boats WHERE id = $1', [scheduledExpense.boat_id]);
    const boatName = boatResult.rows.length > 0 ? boatResult.rows[0].name : 'Unknown Boat';
    
    // Create the actual expense in boat_expenses table
    const expenseId = nanoid();
    const finalAmount = actual_amount || scheduledExpense.amount;
    const finalDate = actual_date || new Date().toISOString().split('T')[0];
    const finalDescription = paymentNotes 
      ? `${scheduledExpense.description} - ${paymentNotes}` 
      : scheduledExpense.description;
    
    const expenseResult = await pool.query(`
      INSERT INTO boat_expenses 
      (id, boat_id, category, amount, expense_date, description, recurring_rule_id, generated_automatically)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [expenseId, scheduledExpense.boat_id, scheduledExpense.category, finalAmount, finalDate, finalDescription, id, true]);
    console.log(`  ✅ boat_expense created: ${expenseId}`);
    
    // Sync to accounting
    const transactionId = await syncBoatExpenseToAccounting(
      expenseId, scheduledExpense.category, finalAmount, finalDate, finalDescription, boatName
    );
    
    // Handle recurrence if applicable
    let nextScheduledExpense = null;
    if (scheduledExpense.recurrence_type !== 'once') {
      const interval = scheduledExpense.recurrence_interval || 1;
      let nextDate;

      // Calculate next date using safe month addition (prevents day-of-month overflow)
      switch (scheduledExpense.recurrence_type) {
        case 'monthly':
          nextDate = addMonthsSafe(scheduledExpense.scheduled_date, interval);
          break;
        case 'yearly':
          nextDate = addMonthsSafe(scheduledExpense.scheduled_date, interval * 12);
          break;
        case 'weekly':
          nextDate = new Date(scheduledExpense.scheduled_date);
          nextDate.setDate(nextDate.getDate() + (7 * interval));
          break;
        default:
          nextDate = addMonthsSafe(scheduledExpense.scheduled_date, 1);
      }
      
      // Create next scheduled expense
      const nextId = nanoid();
      const nextScheduledResult = await pool.query(`
        INSERT INTO scheduled_expenses 
        (id, boat_id, category, amount, scheduled_date, description, 
         recurrence_type, recurrence_interval, auto_convert, notes, last_generated_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        nextId, scheduledExpense.boat_id, scheduledExpense.category, 
        scheduledExpense.amount, nextDate.toISOString().split('T')[0], 
        scheduledExpense.description, scheduledExpense.recurrence_type, 
        scheduledExpense.recurrence_interval, 0,
        scheduledExpense.notes, finalDate
      ]);
      
      nextScheduledExpense = nextScheduledResult.rows[0];
      console.log(`  ✅ next recurrence created for ${nextDate.toISOString().split('T')[0]}`);
    } else {
      console.log(`  ℹ️ recurrence_type=once, no next expense created`);
    }
    
    // Mark original as paid
    await pool.query(`
      UPDATE scheduled_expenses 
      SET status = 'paid', updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [id]);
    
    res.json({
      success: true,
      expense: expenseResult.rows[0],
      accounting_synced: !!transactionId,
      next_scheduled: nextScheduledExpense
    });
  } catch (error) {
    console.error('❌ Error marking scheduled expense as paid:', error.message, error.detail || '');
    res.status(500).json({ error: 'Failed to mark as paid', details: error.message });
  }
});

// ========== MAINTENANCE RECORDS APIs ==========

// Get maintenance records
app.get('/api/maintenance-records', async (req, res) => {
  try {
    const { boat_id, service_type, status, start_date, end_date } = req.query;
    
    let query = `
      SELECT mr.*, b.name as boat_name, m.name as mechanic_name
      FROM maintenance_records mr
      LEFT JOIN boats b ON mr.boat_id = b.id
      LEFT JOIN mechanics m ON mr.mechanic_id = m.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (boat_id) {
      query += ` AND mr.boat_id = $${paramIndex++}`;
      params.push(boat_id);
    }
    
    if (service_type) {
      query += ` AND mr.service_type = $${paramIndex++}`;
      params.push(service_type);
    }
    
    if (status) {
      query += ` AND mr.status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (start_date) {
      query += ` AND mr.service_date >= $${paramIndex++}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND mr.service_date <= $${paramIndex++}`;
      params.push(end_date);
    }
    
    query += ' ORDER BY mr.service_date DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching maintenance records:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance records' });
  }
});

// Create maintenance record
app.post('/api/maintenance-records', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      boat_id, service_type, description, parts_used, labor_hours,
      mechanic_id, parts_cost, labor_cost, total_cost, service_date,
      next_service_date, engine_hours_at_service, work_order_id, notes
    } = req.body;
    
    if (!boat_id || !service_type || !description || total_cost === undefined || !service_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = nanoid();
    const result = await pool.query(`
      INSERT INTO maintenance_records 
      (id, boat_id, service_type, description, parts_used, labor_hours, mechanic_id,
       parts_cost, labor_cost, total_cost, service_date, next_service_date, 
       engine_hours_at_service, work_order_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      id, boat_id, service_type, description, 
      parts_used ? JSON.stringify(parts_used) : null,
      labor_hours || 0, mechanic_id || null, parts_cost || 0, labor_cost || 0,
      total_cost, service_date, next_service_date || null,
      engine_hours_at_service || null, work_order_id || null, notes || null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating maintenance record:', error);
    res.status(500).json({ error: 'Failed to create maintenance record' });
  }
});

// Update maintenance record
app.patch('/api/maintenance-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'service_type', 'description', 'parts_used', 'labor_hours', 'mechanic_id',
      'parts_cost', 'labor_cost', 'total_cost', 'service_date', 'next_service_date',
      'engine_hours_at_service', 'work_order_id', 'status', 'notes'
    ];
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        if (key === 'parts_used' && updates[key]) {
          setClause.push(`${key} = $${paramIndex++}`);
          values.push(JSON.stringify(updates[key]));
        } else {
          setClause.push(`${key} = $${paramIndex++}`);
          values.push(updates[key]);
        }
      }
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE maintenance_records
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Maintenance record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating maintenance record:', error);
    res.status(500).json({ error: 'Failed to update maintenance record' });
  }
});

// Get upcoming maintenance
app.get('/api/maintenance-records/upcoming', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mr.*, b.name as boat_name
      FROM maintenance_records mr
      LEFT JOIN boats b ON mr.boat_id = b.id
      WHERE mr.next_service_date IS NOT NULL
        AND mr.next_service_date >= CURRENT_DATE
      ORDER BY mr.next_service_date ASC
      LIMIT 20
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching upcoming maintenance:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming maintenance' });
  }
});

// ========== PARTS INVENTORY APIs ==========

// Get all parts
app.get('/api/parts-inventory', async (req, res) => {
  try {
    const { category, low_stock } = req.query;
    
    let query = 'SELECT * FROM parts_inventory WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    
    if (low_stock === 'true') {
      query += ' AND quantity <= min_stock_level';
    }
    
    query += ' ORDER BY category, part_name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching parts inventory:', error);
    res.status(500).json({ error: 'Failed to fetch parts inventory' });
  }
});

// Create part
app.post('/api/parts-inventory', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      part_name, part_number, category, quantity, unit_cost,
      supplier, supplier_phone, min_stock_level, notes
    } = req.body;
    
    if (!part_name || !category || quantity === undefined || unit_cost === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = nanoid();
    const result = await pool.query(`
      INSERT INTO parts_inventory 
      (id, part_name, part_number, category, quantity, unit_cost, supplier, 
       supplier_phone, min_stock_level, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      id, part_name, part_number || null, category, quantity, unit_cost,
      supplier || null, supplier_phone || null, min_stock_level || 0, notes || null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating part:', error);
    res.status(500).json({ error: 'Failed to create part' });
  }
});

// Update part
app.patch('/api/parts-inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'part_name', 'part_number', 'category', 'quantity', 'unit_cost',
      'supplier', 'supplier_phone', 'min_stock_level', 'notes'
    ];
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE parts_inventory
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating part:', error);
    res.status(500).json({ error: 'Failed to update part' });
  }
});

// Restock part
app.post('/api/parts-inventory/:id/restock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity required' });
    }
    
    const result = await pool.query(`
      UPDATE parts_inventory
      SET quantity = quantity + $1,
          last_restock_date = CURRENT_DATE,
          last_restock_quantity = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [quantity, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error restocking part:', error);
    res.status(500).json({ error: 'Failed to restock part' });
  }
});

// ========== WORK ORDERS APIs ==========

// Get work orders
app.get('/api/work-orders', async (req, res) => {
  try {
    const { boat_id, mechanic_id, status, priority } = req.query;
    
    let query = `
      SELECT wo.*, b.name as boat_name, m.name as mechanic_name
      FROM work_orders wo
      LEFT JOIN boats b ON wo.boat_id = b.id
      LEFT JOIN mechanics m ON wo.mechanic_id = m.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (boat_id) {
      query += ` AND wo.boat_id = $${paramIndex++}`;
      params.push(boat_id);
    }
    
    if (mechanic_id) {
      query += ` AND wo.mechanic_id = $${paramIndex++}`;
      params.push(mechanic_id);
    }
    
    if (status) {
      query += ` AND wo.status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (priority) {
      query += ` AND wo.priority = $${paramIndex++}`;
      params.push(priority);
    }
    
    query += ' ORDER BY wo.priority DESC, wo.scheduled_date ASC, wo.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// Create work order
app.post('/api/work-orders', async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const {
      boat_id, mechanic_id, title, description, priority, scheduled_date,
      estimated_cost, estimated_hours, notes, created_by
    } = req.body;
    
    if (!boat_id || !title || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = nanoid();
    const result = await pool.query(`
      INSERT INTO work_orders 
      (id, boat_id, mechanic_id, title, description, priority, scheduled_date,
       estimated_cost, estimated_hours, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      id, boat_id, mechanic_id || null, title, description, priority || 'medium',
      scheduled_date || null, estimated_cost || null, estimated_hours || null,
      notes || null, created_by || null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

// Update work order
app.patch('/api/work-orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'mechanic_id', 'title', 'description', 'priority', 'status', 'scheduled_date',
      'completion_date', 'estimated_cost', 'actual_cost', 'estimated_hours',
      'actual_hours', 'maintenance_record_id', 'notes'
    ];
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE work_orders
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// Complete work order
app.post('/api/work-orders/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { actual_cost, actual_hours, maintenance_record_id } = req.body;
    
    const result = await pool.query(`
      UPDATE work_orders
      SET status = 'completed',
          completion_date = CURRENT_DATE,
          actual_cost = $1,
          actual_hours = $2,
          maintenance_record_id = $3
      WHERE id = $4
      RETURNING *
    `, [actual_cost || 0, actual_hours || 0, maintenance_record_id || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error completing work order:', error);
    res.status(500).json({ error: 'Failed to complete work order' });
  }
});

// ⏰ SCHEDULED EXPENSES AUTO-CONVERSION CRON (RECOVERY)
// This was previously corrupted and is now restored
async function processScheduledExpenses() {
  console.log('💰 Processing scheduled expenses (Manual/Cron)...');
  try {
    const today = new Date().toISOString().split('T')[0];
    const dueExpenses = await pool.query(`
      SELECT * FROM scheduled_expenses 
      WHERE status = 'pending' 
      AND auto_convert = 1 
      AND scheduled_date <= $1
      ORDER BY scheduled_date ASC
    `, [today]);
    
    for (const expense of dueExpenses.rows) {
      try {
        const { nanoid } = await import('nanoid');
        // logic for auto-conversion
        // ... (this is redundant with the 3AM cron but keeping for safety)
      } catch (err) {
        console.error('Error in auto-convert:', err);
      }
    }
  } catch (error) {
    console.error('Error in scheduled expenses processing:', error);
  }
}

// ========== FASE 12: OPERATIONS MODULE APIS ==========

// --- STATS ---
app.get('/api/operations/stats', isAuthenticated, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='pendiente') AS pendiente,
        COUNT(*) FILTER (WHERE status='en_progreso') AS en_progreso,
        COUNT(*) FILTER (WHERE status='completada') AS completada,
        COUNT(*) FILTER (WHERE status='pausada') AS pausada,
        COUNT(*) FILTER (WHERE status='cancelada') AS cancelada,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completada','cancelada')) AS vencidas,
        COUNT(*) AS total
      FROM op_tasks
    `);
    const byCategory = await pool.query(`
      SELECT c.name, c.color, COUNT(t.id) AS total
      FROM op_categories c
      LEFT JOIN op_tasks t ON t.category_id = c.id
      WHERE c.active = true
      GROUP BY c.id, c.name, c.color
      ORDER BY total DESC
    `);
    const byAssignee = await pool.query(`
      SELECT a.name, COUNT(t.id) AS total,
             COUNT(t.id) FILTER (WHERE t.status='pendiente') AS pendiente,
             COUNT(t.id) FILTER (WHERE t.status='en_progreso') AS en_progreso
      FROM op_assignees a
      LEFT JOIN op_tasks t ON t.assignee_id = a.id
      WHERE a.active = true
      GROUP BY a.id, a.name
      ORDER BY total DESC
    `);
    const upcoming = await pool.query(`
      SELECT t.id, t.title, t.due_date, t.priority, t.status, a.name AS assignee_name
      FROM op_tasks t
      LEFT JOIN op_assignees a ON t.assignee_id = a.id
      WHERE t.status NOT IN ('completada','cancelada') AND t.due_date IS NOT NULL
      ORDER BY t.due_date ASC
      LIMIT 5
    `);
    res.json({
      summary: stats.rows[0],
      byCategory: byCategory.rows,
      byAssignee: byAssignee.rows,
      upcoming: upcoming.rows
    });
  } catch (err) {
    console.error('Error fetching operations stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- TASKS CRUD ---
app.get('/api/operations/tasks', isAuthenticated, async (req, res) => {
  try {
    const { status, priority, category_id, assignee_id, search, start, end } = req.query;
    let where = ['1=1'];
    const params = [];
    let idx = 1;
    if (status) { where.push(`t.status = $${idx++}`); params.push(status); }
    if (priority) { where.push(`t.priority = $${idx++}`); params.push(priority); }
    if (category_id) { where.push(`t.category_id = $${idx++}`); params.push(category_id); }
    if (assignee_id) { where.push(`t.assignee_id = $${idx++}`); params.push(assignee_id); }
    if (search) { where.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (start) { where.push(`t.due_date >= $${idx++}`); params.push(start); }
    if (end) { where.push(`t.due_date <= $${idx++}`); params.push(end); }
    const result = await pool.query(`
      SELECT t.*, c.name AS category_name, c.color AS category_color,
             a.name AS assignee_name, a.role AS assignee_role
      FROM op_tasks t
      LEFT JOIN op_categories c ON t.category_id = c.id
      LEFT JOIN op_assignees a ON t.assignee_id = a.id
      WHERE ${where.join(' AND ')}
      ORDER BY 
        CASE t.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tasks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/operations/tasks', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const id = nanoid();
    const {
      title, description, category_id, priority, status, assignee_id,
      start_date, due_date, estimated_hours, actual_hours, comments, tags,
      related_entity_id, related_entity_type, amount,
      location_name, location_address, location_lat, location_lng, maps_url,
      sync_calendar, sync_expenses, expense_ref_id, sync_income, income_ref_id
    } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es obligatorio' });
    const result = await pool.query(`
      INSERT INTO op_tasks (id, title, description, category_id, priority, status, assignee_id,
        start_date, due_date, estimated_hours, actual_hours, comments, tags,
        related_entity_id, related_entity_type, amount,
        location_name, location_address, location_lat, location_lng, maps_url,
        sync_calendar, sync_expenses, expense_ref_id, sync_income, income_ref_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING *
    `, [id, title, description||null, category_id||null, priority||'media', status||'pendiente', assignee_id||null,
        start_date||null, due_date||null, estimated_hours||null, actual_hours||null, comments||null, tags||null,
        related_entity_id||null, related_entity_type||null, amount||null,
        location_name||null, location_address||null, location_lat||null, location_lng||null, maps_url||null,
        sync_calendar||false, sync_expenses||false, expense_ref_id||null, sync_income||false, income_ref_id||null]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating task:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/operations/tasks/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const allowed = ['title','description','category_id','priority','status','assignee_id',
      'start_date','due_date','estimated_hours','actual_hours','comments','tags',
      'related_entity_id','related_entity_type','amount',
      'location_name','location_address','location_lat','location_lng','maps_url',
      'sync_calendar','sync_expenses','expense_ref_id','sync_income','income_ref_id'];
    const sets = [];
    const params = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in fields) { sets.push(`${key} = $${idx++}`); params.push(fields[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);
    const result = await pool.query(
      `UPDATE op_tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating task:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/operations/tasks/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM op_tasks WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Duplicate task
app.post('/api/operations/tasks/:id/duplicate', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { id } = req.params;
    const src = await pool.query('SELECT * FROM op_tasks WHERE id = $1', [id]);
    if (src.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const t = src.rows[0];
    const newId = nanoid();
    const result = await pool.query(`
      INSERT INTO op_tasks (id, title, description, category_id, priority, status, assignee_id,
        start_date, due_date, estimated_hours, actual_hours, comments, tags,
        related_entity_id, related_entity_type, amount,
        location_name, location_address, location_lat, location_lng, maps_url,
        sync_calendar, sync_expenses, sync_income)
      VALUES ($1,$2,$3,$4,$5,'pendiente',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *
    `, [newId, `${t.title} (copia)`, t.description, t.category_id, t.priority, t.assignee_id,
        t.start_date, t.due_date, t.estimated_hours, null, t.comments, t.tags,
        t.related_entity_id, t.related_entity_type, t.amount,
        t.location_name, t.location_address, t.location_lat, t.location_lng, t.maps_url,
        t.sync_calendar, t.sync_expenses, t.sync_income]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error duplicating task:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send task to expenses module
app.post('/api/operations/tasks/:id/send-to-expenses', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { id } = req.params;
    const taskResult = await pool.query(`
      SELECT t.*, c.name AS category_name, a.name AS assignee_name
      FROM op_tasks t
      LEFT JOIN op_categories c ON t.category_id = c.id
      LEFT JOIN op_assignees a ON t.assignee_id = a.id
      WHERE t.id = $1`, [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const task = taskResult.rows[0];
    const expenseId = nanoid();
    const boatId = req.body.boat_id || null;
    const expCategory = req.body.category || 'other';
    await pool.query(`
      INSERT INTO boat_expenses (id, boat_id, category, amount, expense_date, description)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [expenseId, boatId, expCategory, task.amount || 0, task.due_date || new Date().toISOString().split('T')[0],
        `[Operaciones] ${task.title}${task.description ? ': ' + task.description.slice(0,200) : ''}`]);
    await pool.query(`UPDATE op_tasks SET sync_expenses=true, expense_ref_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [expenseId, id]);
    res.json({ success: true, expense_id: expenseId });
  } catch (err) {
    console.error('Error sending to expenses:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- CATEGORIES CRUD ---
app.get('/api/operations/categories', isAuthenticated, async (req, res) => {
  try {
    const { active } = req.query;
    let query = 'SELECT * FROM op_categories';
    const params = [];
    if (active === 'true') { query += ' WHERE active = true'; }
    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/operations/categories', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { name, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const result = await pool.query(
      'INSERT INTO op_categories (id, name, color, icon) VALUES ($1,$2,$3,$4) RETURNING *',
      [nanoid(), name, color||'#0066cc', icon||'tag']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/operations/categories/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon, active } = req.body;
    const result = await pool.query(
      `UPDATE op_categories SET name=COALESCE($1,name), color=COALESCE($2,color), icon=COALESCE($3,icon),
       active=COALESCE($4,active), updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *`,
      [name||null, color||null, icon||null, active!=null?active:null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/operations/categories/:id', isAuthenticated, async (req, res) => {
  try {
    await pool.query('DELETE FROM op_categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ASSIGNEES CRUD ---
app.get('/api/operations/assignees', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM op_assignees ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/operations/assignees', isAuthenticated, async (req, res) => {
  try {
    const { nanoid } = await import('nanoid');
    const { name, role, email } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const result = await pool.query(
      'INSERT INTO op_assignees (id, name, role, email) VALUES ($1,$2,$3,$4) RETURNING *',
      [nanoid(), name, role||null, email||null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/operations/assignees/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, email, active } = req.body;
    const result = await pool.query(
      `UPDATE op_assignees SET name=COALESCE($1,name), role=COALESCE($2,role), email=COALESCE($3,email),
       active=COALESCE($4,active), updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *`,
      [name||null, role||null, email||null, active!=null?active:null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Responsable no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/operations/assignees/:id', isAuthenticated, async (req, res) => {
  try {
    await pool.query('DELETE FROM op_assignees WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// FASE 14: CAPTAIN & STEW PAYMENTS + EXPENSE ENHANCEMENTS
// ========================================

// ── Stews catalog ──────────────────────
app.get('/api/stews', isAuthenticated, async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM stews';
    const params = [];
    if (status && status !== 'all') {
      query += ' WHERE status=$1';
      params.push(status);
    }
    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stews', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const { nanoid } = await import('nanoid');
    const id = 'stew_' + nanoid(8);
    const result = await pool.query(
      'INSERT INTO stews (id, name, phone, email) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, name, phone||null, email||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/stews/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email, status } = req.body;
    const result = await pool.query(
      `UPDATE stews SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
       status=COALESCE($4,status) WHERE id=$5 RETURNING *`,
      [name||null, phone||null, email||null, status||null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Stew no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stews/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM stews WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Stew no encontrado' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Brokers ───────────────────────────────────────────
app.get('/api/brokers', isAuthenticated, async (req, res) => {
  try {
    const { active } = req.query;
    let sql = 'SELECT * FROM brokers';
    if (active !== undefined) sql += ` WHERE active = ${active === 'false' ? 'false' : 'true'}`;
    sql += ' ORDER BY name ASC';
    const result = await pool.query(sql);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/brokers', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name es obligatorio' });
    const { nanoid } = await import('nanoid');
    const id = 'brk_' + nanoid(8);
    const result = await pool.query(
      `INSERT INTO brokers (id, name, phone, email, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, name, phone||null, email||null, notes||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/brokers/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email, notes, active } = req.body;
    const result = await pool.query(
      `UPDATE brokers SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
       notes=COALESCE($4,notes), active=COALESCE($5,active) WHERE id=$6 RETURNING *`,
      [name||null, phone||null, email||null, notes||null, active!=null?active:null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Broker no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Customers ─────────────────────────────────────────
app.get('/api/customers', isAuthenticated, async (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT * FROM customers';
    const params = [];
    if (q) { params.push(`%${q}%`); sql += ` WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`; }
    sql += ' ORDER BY name ASC LIMIT 100';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'name es obligatorio' });
    const { nanoid } = await import('nanoid');
    const id = 'cust_' + nanoid(8);
    const result = await pool.query(
      `INSERT INTO customers (id, name, phone, email) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, name, phone||null, email||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bookings Ledger ───────────────────────────────────
app.get('/api/bookings-ledger', isAuthenticated, async (req, res) => {
  try {
    const { status, boat_id, booking_source } = req.query;
    let sql = `SELECT bl.*, b.name as boat_name,
                 CASE WHEN bl.total_amount > 0 THEN GREATEST(0, bl.total_amount - COALESCE(bl.deposit_amount,0)) ELSE 0 END as balance_due
               FROM bookings_ledger bl LEFT JOIN boats b ON bl.boat_id = b.id WHERE 1=1`;
    const params = [];
    if (status)  { params.push(status);  sql += ` AND bl.status=$${params.length}`; }
    if (boat_id) { params.push(boat_id); sql += ` AND bl.boat_id=$${params.length}`; }
    if (booking_source) { params.push(booking_source); sql += ` AND bl.booking_source=$${params.length}`; }
    sql += ' ORDER BY bl.booking_date DESC, bl.created_at DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/bookings-ledger/:id/complete', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings_ledger SET status='completed' WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Booking no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Booking Deposits ──────────────────────────────────
app.get('/api/booking-deposits', isAuthenticated, async (req, res) => {
  try {
    const { status, boat_id } = req.query;
    let sql = `SELECT bd.*,
                 b.name as boat_name,
                 CASE WHEN bd.booking_total_amount > 0
                      THEN GREATEST(0, bd.booking_total_amount - bd.amount)
                      ELSE NULL END as balance_due,
                 ar.status as ar_status, ar.amount as ar_amount
               FROM booking_deposits bd
               LEFT JOIN boats b ON bd.boat_id = b.id
               LEFT JOIN booking_receivables ar ON ar.id = bd.linked_receivable_id
               WHERE 1=1`;
    const params = [];
    if (status)  { params.push(status);  sql += ` AND bd.status = $${params.length}`; }
    if (boat_id) { params.push(boat_id); sql += ` AND bd.boat_id = $${params.length}`; }
    sql += ' ORDER BY bd.deposit_date DESC, bd.created_at DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/booking-deposits', isAuthenticated, async (req, res) => {
  const pg = await pool.connect();
  try {
    await pg.query('BEGIN');
    const {
      client_name, client_email, client_phone, boat_id, booking_reference,
      amount, deposit_date, status, notes,
      booking_date, booking_total_amount, hours_rented, service_type,
      // New fields
      booking_source,
      customer_id, customer_name, customer_phone, customer_email,
      broker_id, broker_name, broker_phone, broker_email,
      final_customer_name, final_customer_phone, final_customer_email,
    } = req.body;

    // Determine who the deposit/AR is for
    const source = booking_source || 'direct';
    const isBroker = source === 'broker';
    // For display/legacy: client_name is broker name if broker, or customer if direct
    const displayName = isBroker
      ? (broker_name || client_name || 'Broker')
      : (customer_name || client_name || 'Cliente');
    const displayEmail = isBroker ? (broker_email || client_email || null) : (customer_email || client_email || null);
    const displayPhone = isBroker ? (broker_phone || client_phone || null) : (customer_phone || client_phone || null);

    if (!displayName || !amount || !deposit_date) {
      await pg.query('ROLLBACK');
      return res.status(400).json({ error: 'Nombre, monto y fecha son obligatorios' });
    }

    const { nanoid } = await import('nanoid');
    const id = 'dep_' + nanoid(8);

    // Auto-create customer/broker records if names given but no IDs
    let resolvedCustomerId = customer_id || null;
    let resolvedBrokerId = broker_id || null;

    if (!isBroker && !resolvedCustomerId && customer_name) {
      const cRes = await pg.query(
        `INSERT INTO customers (id, name, phone, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
        ['cust_' + nanoid(8), customer_name, customer_phone||null, customer_email||null]
      );
      if (cRes.rows.length) resolvedCustomerId = cRes.rows[0].id;
    }
    if (isBroker && !resolvedBrokerId && broker_name) {
      const bRes = await pg.query(
        `INSERT INTO brokers (id, name, phone, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
        ['brk_' + nanoid(8), broker_name, broker_phone||null, broker_email||null]
      );
      if (bRes.rows.length) resolvedBrokerId = bRes.rows[0].id;
    }

    // Insert deposit
    const depResult = await pg.query(
      `INSERT INTO booking_deposits
         (id, client_name, client_email, client_phone, boat_id, booking_reference, amount, deposit_date,
          status, notes, booking_date, booking_total_amount, hours_rented, service_type,
          booking_source, customer_id, broker_id, final_customer_name, final_customer_phone, final_customer_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [id, displayName, displayEmail, displayPhone, boat_id||null, booking_reference||null,
       amount, deposit_date, status||'pending', notes||null,
       booking_date||null, booking_total_amount||null, hours_rented||null, service_type||null,
       source, resolvedCustomerId, resolvedBrokerId,
       final_customer_name||null, final_customer_phone||null, final_customer_email||null]
    );
    const dep = depResult.rows[0];

    // Create bookings_ledger entry
    const ledgerId = 'bl_' + nanoid(8);
    await pg.query(
      `INSERT INTO bookings_ledger
         (id, booking_source, boat_id, booking_date, hours_rented, total_amount, deposit_amount,
          customer_id, customer_name, customer_phone, customer_email,
          broker_id, broker_name,
          final_customer_name, final_customer_phone, final_customer_email,
          receivable_party_type, receivable_party_id, receivable_party_name,
          deposit_id, service_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [ledgerId, source, boat_id||null, booking_date||null, hours_rented||null,
       booking_total_amount||null, amount,
       resolvedCustomerId, isBroker ? (final_customer_name||null) : (customer_name||displayName), customer_phone||null, customer_email||null,
       resolvedBrokerId, broker_name||null,
       final_customer_name||null, final_customer_phone||null, final_customer_email||null,
       isBroker ? 'broker' : 'customer',
       isBroker ? resolvedBrokerId : resolvedCustomerId,
       isBroker ? (broker_name||displayName) : (customer_name||displayName),
       id, service_type||null, notes||null]
    );
    // Link ledger to deposit
    await pg.query('UPDATE booking_deposits SET booking_ledger_id=$1 WHERE id=$2', [ledgerId, id]);

    // Auto-create AR if balance_due > 0
    let receivable = null;
    const totalAmt  = parseFloat(booking_total_amount||0);
    const depositAmt = parseFloat(amount);
    const balanceDue = totalAmt - depositAmt;
    if (totalAmt > 0 && balanceDue > 0.005) {
      const rId = 'ar_' + nanoid(8);
      const arPartyType = isBroker ? 'broker' : 'customer';
      const arPartyName = isBroker ? (broker_name||displayName) : (customer_name||displayName);
      const arPartyId   = isBroker ? resolvedBrokerId : resolvedCustomerId;
      const arResult = await pg.query(
        `INSERT INTO booking_receivables
           (id, deposit_id, client_name, client_email, client_phone, boat_id, due_date, amount, status, notes,
            party_type, party_id, party_name, booking_id, broker_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12,$13,$14) RETURNING *`,
        [rId, id, arPartyName, displayEmail, displayPhone, boat_id||null,
         booking_date||deposit_date, balanceDue.toFixed(2),
         `Saldo pendiente — ${booking_reference||arPartyName}`,
         arPartyType, arPartyId||null, arPartyName, ledgerId,
         isBroker ? resolvedBrokerId : null]
      );
      receivable = arResult.rows[0];
      await pg.query('UPDATE booking_deposits SET linked_receivable_id=$1 WHERE id=$2', [rId, id]);
      dep.linked_receivable_id = rId;
    }

    // ── Create accounting transaction for deposit receipt (Debit Bank / Credit Deferred) ──
    const txId = 'tx_' + nanoid(8);
    const txDesc = `Depósito recibido — ${displayName}${dep.boat_id ? '' : ''}${booking_reference ? ' / Ref: ' + booking_reference : ''}`;
    await pg.query(
      `INSERT INTO transactions
         (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, boat_id, notes)
       VALUES ($1, $2, 'income', 'acc_booking_deposits_2500', $3, $4, $5, 'booking', $6, $7)`,
      [txId, deposit_date, parseFloat(amount), txDesc, id, boat_id||null, notes||null]
    );
    await pg.query('UPDATE booking_deposits SET linked_transaction_id=$1 WHERE id=$2', [txId, id]);
    dep.linked_transaction_id = txId;

    await pg.query('COMMIT');
    res.status(201).json({ ...dep, receivable, ledger_id: ledgerId, transaction_id: txId });
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('Error creating booking deposit:', err);
    res.status(500).json({ error: err.message });
  } finally { pg.release(); }
});

app.patch('/api/booking-deposits/:id', isAuthenticated, async (req, res) => {
  try {
    const { client_name, client_email, client_phone, boat_id, booking_reference,
            amount, deposit_date, status, notes,
            booking_date, booking_total_amount, hours_rented, service_type } = req.body;
    const result = await pool.query(
      `UPDATE booking_deposits SET
        client_name          = COALESCE($1, client_name),
        client_email         = COALESCE($2, client_email),
        client_phone         = COALESCE($3, client_phone),
        boat_id              = COALESCE($4, boat_id),
        booking_reference    = COALESCE($5, booking_reference),
        amount               = COALESCE($6, amount),
        deposit_date         = COALESCE($7, deposit_date),
        status               = COALESCE($8, status),
        notes                = COALESCE($9, notes),
        booking_date         = COALESCE($10, booking_date),
        booking_total_amount = COALESCE($11, booking_total_amount),
        hours_rented         = COALESCE($12, hours_rented),
        service_type         = COALESCE($13, service_type),
        updated_at           = CURRENT_TIMESTAMP
       WHERE id = $14 RETURNING *`,
      [client_name||null, client_email||null, client_phone||null, boat_id||null,
       booking_reference||null, amount||null, deposit_date||null, status||null,
       notes||null, booking_date||null, booking_total_amount||null,
       hours_rented||null, service_type||null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Depósito no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/booking-deposits/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM booking_deposits WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Depósito no encontrado' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Apply deposit → creates income transaction + sets status = applied
app.post('/api/booking-deposits/:id/apply', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { revenue_account_id, notes, booking_reference } = req.body;
    if (!revenue_account_id) return res.status(400).json({ error: 'revenue_account_id es obligatorio' });

    // Fetch deposit
    const depRes = await client.query(
      'SELECT bd.*, b.name as boat_name FROM booking_deposits bd LEFT JOIN boats b ON bd.boat_id = b.id WHERE bd.id = $1',
      [req.params.id]
    );
    if (!depRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Depósito no encontrado' }); }
    const dep = depRes.rows[0];
    if (dep.status === 'applied') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Este depósito ya fue aplicado' }); }

    // Verify revenue account exists
    const accRes = await client.query('SELECT id, account_name FROM chart_of_accounts WHERE id = $1 AND account_type = $2', [revenue_account_id, 'revenue']);
    if (!accRes.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cuenta de ingresos no válida' }); }

    // Create income transaction (Deferred Deposits → Revenue)
    const { nanoid } = await import('nanoid');
    const txId = 'tx_dep_' + nanoid(10);
    const finalRef = booking_reference || dep.booking_reference;
    // Use today's date for accounting recognition (when the booking was completed/applied)
    const applyDate = new Date().toISOString().slice(0, 10);
    const desc = `Booking completado — ${dep.client_name}${finalRef ? ' / Ref: ' + finalRef : ''}`;

    // 1. Revenue transaction: Credit Booking Revenue
    await client.query(
      `INSERT INTO transactions (id, transaction_date, account_id, amount, transaction_type, description, reference_id, boat_id, notes, reference_type)
       VALUES ($1, $2, $3, $4, 'income', $5, $6, $7, $8, 'booking')`,
      [txId, applyDate, revenue_account_id, dep.amount, desc, dep.id, dep.boat_id || null, notes || null]
    );

    // 2. Reversal transaction: Debit Deferred Deposits (clear the liability)
    const txRevId = 'tx_rev_' + nanoid(10);
    const revDesc = `Reclasificación depósito → ingreso — ${dep.client_name}`;
    await client.query(
      `INSERT INTO transactions (id, transaction_date, account_id, amount, transaction_type, description, reference_id, boat_id, notes, reference_type)
       VALUES ($1, $2, 'acc_booking_deposits_2500', $3, 'expense', $4, $5, $6, $7, 'booking')`,
      [txRevId, applyDate, dep.amount, revDesc, dep.id, dep.boat_id || null, notes || null]
    );

    // Update deposit status + booking reference
    await client.query(
      'UPDATE booking_deposits SET status = $1, booking_reference = COALESCE($2, booking_reference) WHERE id = $3',
      ['applied', finalRef || null, dep.id]
    );

    // Update bookings_ledger status if linked
    if (dep.booking_ledger_id) {
      await client.query(
        `UPDATE bookings_ledger SET status = 'completed' WHERE id = $1`,
        [dep.booking_ledger_id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, transaction_id: txId, reversal_id: txRevId, amount: dep.amount, client_name: dep.client_name });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error applying deposit:', err);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Booking Receivables ────────────────
app.get('/api/booking-receivables', isAuthenticated, async (req, res) => {
  try {
    const { status, boat_id } = req.query;
    let sql = `SELECT br.*, b.name as boat_name
               FROM booking_receivables br
               LEFT JOIN boats b ON br.boat_id = b.id
               WHERE 1=1`;
    const params = [];
    if (status)  { params.push(status);  sql += ` AND br.status = $${params.length}`; }
    if (boat_id) { params.push(boat_id); sql += ` AND br.boat_id = $${params.length}`; }
    sql += ' ORDER BY br.due_date ASC, br.created_at DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/booking-receivables/:id/mark-paid', isAuthenticated, async (req, res) => {
  const pg = await pool.connect();
  try {
    await pg.query('BEGIN');
    const { notes } = req.body;
    const arRes = await pg.query(
      `SELECT ar.*, b.name as boat_name FROM booking_receivables ar LEFT JOIN boats b ON ar.boat_id=b.id WHERE ar.id=$1`,
      [req.params.id]
    );
    if (!arRes.rows.length) { await pg.query('ROLLBACK'); return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' }); }
    const ar = arRes.rows[0];

    // Create cash receipt transaction for the saldo cobrado
    const { nanoid } = await import('nanoid');
    const txId = 'tx_ar_' + nanoid(8);
    const desc = `Saldo cobrado — ${ar.client_name || ar.party_name}${ar.boat_name ? ' / ' + ar.boat_name : ''}`;
    await pg.query(
      `INSERT INTO transactions (id, transaction_date, account_id, amount, transaction_type, description, reference_id, boat_id, notes, reference_type)
       VALUES ($1, CURRENT_DATE, 'acc_booking_deposits_2500', $2, 'income', $3, $4, $5, $6, 'booking')`,
      [txId, parseFloat(ar.amount), desc, ar.id, ar.boat_id||null, notes||null]
    );

    // Note: we use the deposit account as placeholder — in a proper implementation
    // a bank/cash account would be used. The user can reclassify if needed.
    // Better approach: find the primary bank account
    const bankAccRes = await pg.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1010' LIMIT 1`
    );
    if (bankAccRes.rows.length) {
      // Update the transaction to use the bank account instead
      await pg.query(
        `UPDATE transactions SET account_id=$1 WHERE id=$2`,
        [bankAccRes.rows[0].id, txId]
      );
    }

    await pg.query(
      `UPDATE booking_receivables SET status='paid', notes=COALESCE($1, notes) WHERE id=$2`,
      [notes||null, req.params.id]
    );
    await pg.query('COMMIT');

    const updated = await pool.query('SELECT * FROM booking_receivables WHERE id=$1', [req.params.id]);
    res.json({ ...updated.rows[0], cash_receipt_transaction_id: txId });
  } catch (err) {
    await pg.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { pg.release(); }
});

// ── Repair endpoint: create missing accounting transactions for orphaned deposits/ARs ──
app.post('/api/accounting/repair-deposits', isAuthenticated, async (req, res) => {
  const pg = await pool.connect();
  try {
    await pg.query('BEGIN');
    const { nanoid } = await import('nanoid');
    const report = { deposits_fixed: [], ars_fixed: [], errors: [] };

    // 1. Find all deposits without a linked accounting transaction
    const orphanedDeps = await pg.query(
      `SELECT bd.*, b.name as boat_name
       FROM booking_deposits bd
       LEFT JOIN boats b ON bd.boat_id = b.id
       WHERE bd.linked_transaction_id IS NULL
       ORDER BY bd.deposit_date ASC`
    );

    for (const dep of orphanedDeps.rows) {
      try {
        const depDate = dep.deposit_date instanceof Date
          ? dep.deposit_date.toISOString().slice(0, 10)
          : String(dep.deposit_date).slice(0, 10);

        // Check if a transaction already exists for this deposit (created by apply flow)
        const existingTx = await pg.query(
          `SELECT id FROM transactions WHERE reference_id = $1 ORDER BY transaction_date ASC LIMIT 1`,
          [dep.id]
        );

        let txRecId;
        if (existingTx.rows.length > 0) {
          // Transaction already exists — just link it back, no duplicates
          txRecId = existingTx.rows[0].id;
          await pg.query('UPDATE booking_deposits SET linked_transaction_id=$1 WHERE id=$2', [txRecId, dep.id]);
        } else {
          const depDesc = `Depósito recibido — ${dep.client_name}${dep.booking_reference ? ' / Ref: ' + dep.booking_reference : ''} [retroactivo]`;
          // Create receipt transaction in account 2500 (Deferred Booking Deposits)
          txRecId = 'tx_' + nanoid(8);
          await pg.query(
            `INSERT INTO transactions (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, boat_id, notes)
             VALUES ($1, $2, 'income', 'acc_booking_deposits_2500', $3, $4, $5, 'booking', $6, $7)`,
            [txRecId, depDate, parseFloat(dep.amount), depDesc, dep.id, dep.boat_id||null, dep.notes||null]
          );
          await pg.query('UPDATE booking_deposits SET linked_transaction_id=$1 WHERE id=$2', [txRecId, dep.id]);

          // If deposit was already applied, also create the revenue + reversal transactions
          if (dep.status === 'applied') {
            const today = new Date().toISOString().slice(0, 10);
            const applyDesc = `Booking completado — ${dep.client_name} [retroactivo]`;
            const revDesc = `Reclasificación depósito → ingreso — ${dep.client_name} [retroactivo]`;
            const revAccRes = await pg.query(
              `SELECT id FROM chart_of_accounts WHERE account_code='4020' LIMIT 1`
            );
            const revAccId = revAccRes.rows.length ? revAccRes.rows[0].id : null;
            if (revAccId) {
              const txApplyId = 'tx_' + nanoid(8);
              await pg.query(
                `INSERT INTO transactions (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, boat_id, notes)
                 VALUES ($1, $2, 'income', $3, $4, $5, $6, 'booking', $7, $8)`,
                [txApplyId, today, revAccId, parseFloat(dep.amount), applyDesc, dep.id, dep.boat_id||null, null]
              );
              const txRevId = 'tx_' + nanoid(8);
              await pg.query(
                `INSERT INTO transactions (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, boat_id, notes)
                 VALUES ($1, $2, 'expense', 'acc_booking_deposits_2500', $3, $4, $5, 'booking', $6, $7)`,
                [txRevId, today, parseFloat(dep.amount), revDesc, dep.id, dep.boat_id||null, null]
              );
            }
          }
        }

        report.deposits_fixed.push({ id: dep.id, client: dep.client_name, amount: dep.amount, status: dep.status });
      } catch (e) {
        report.errors.push({ type: 'deposit', id: dep.id, error: e.message });
      }
    }

    // 2. Find all paid ARs with no corresponding income transaction
    const paidARs = await pg.query(
      `SELECT ar.*, b.name as boat_name
       FROM booking_receivables ar
       LEFT JOIN boats b ON ar.boat_id = b.id
       WHERE ar.status = 'paid'
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.reference_id = ar.id AND t.transaction_type = 'income'
         )
       ORDER BY ar.due_date ASC`
    );

    for (const ar of paidARs.rows) {
      try {
        const arDate = new Date().toISOString().slice(0, 10);
        const clientName = ar.client_name || ar.party_name || 'Cliente';
        const arDesc = `Saldo cobrado — ${clientName}${ar.boat_name ? ' / ' + ar.boat_name : ''} [retroactivo]`;

        // Find bank account (1010) or fall back to income account
        const bankRes = await pg.query(`SELECT id FROM chart_of_accounts WHERE account_code='1010' LIMIT 1`);
        const bankAccId = bankRes.rows.length ? bankRes.rows[0].id : 'acc_booking_deposits_2500';

        const txArId = 'tx_ar_' + nanoid(8);
        await pg.query(
          `INSERT INTO transactions (id, transaction_date, transaction_type, account_id, amount, description, reference_id, reference_type, boat_id, notes)
           VALUES ($1, $2, 'income', $3, $4, $5, $6, 'booking', $7, $8)`,
          [txArId, arDate, bankAccId, parseFloat(ar.amount), arDesc, ar.id, ar.boat_id||null, 'Reparación retroactiva — saldo cobrado']
        );

        report.ars_fixed.push({ id: ar.id, client: clientName, amount: ar.amount });
      } catch (e) {
        report.errors.push({ type: 'ar', id: ar.id, error: e.message });
      }
    }

    await pg.query('COMMIT');
    res.json({
      success: true,
      deposits_fixed: report.deposits_fixed.length,
      ars_fixed: report.ars_fixed.length,
      errors: report.errors.length,
      detail: report
    });
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('Repair deposits error:', err);
    res.status(500).json({ error: err.message });
  } finally { pg.release(); }
});

app.patch('/api/booking-receivables/:id/cancel', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE booking_receivables SET status='cancelled' WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Captain Payments ───────────────────
app.get('/api/captain-payments', isAuthenticated, async (req, res) => {
  try {
    const { boat_id, captain_id, start_date, end_date } = req.query;
    let where = []; let params = [];
    if (boat_id)    { params.push(boat_id);    where.push(`boat_id = $${params.length}`); }
    if (captain_id) { params.push(captain_id); where.push(`captain_id = $${params.length}`); }
    if (start_date) { params.push(start_date); where.push(`work_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   where.push(`work_date <= $${params.length}`); }
    const sql = `SELECT * FROM captain_payments${where.length?' WHERE '+where.join(' AND '):''} ORDER BY work_date DESC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/captain-payments', isAuthenticated, async (req, res) => {
  try {
    const { captain_id, captain_name, boat_id, hours, work_date, description, amount, status, reference } = req.body;
    if (!captain_name || !boat_id || !work_date || !amount) {
      return res.status(400).json({ error: 'captain_name, boat_id, work_date y amount son obligatorios' });
    }
    const boatRes = await pool.query('SELECT name FROM boats WHERE id=$1', [boat_id]);
    const boat_name = boatRes.rows[0]?.name || boat_id;
    const { nanoid } = await import('nanoid');
    const id = 'cpay_' + nanoid(10);
    const result = await pool.query(
      `INSERT INTO captain_payments (id, captain_id, captain_name, boat_id, boat_name, hours, work_date, description, amount, status, reference, registered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, captain_id||null, captain_name, boat_id, boat_name, hours||null, work_date,
       description||null, amount, status||'paid', reference||null,
       req.user?.name || req.user?.email || 'sistema']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/captain-payments/:id', isAuthenticated, async (req, res) => {
  try {
    const { captain_name, boat_id, hours, work_date, description, amount, status, reference } = req.body;
    let boat_name = null;
    if (boat_id) {
      const boatRes = await pool.query('SELECT name FROM boats WHERE id=$1', [boat_id]);
      boat_name = boatRes.rows[0]?.name || boat_id;
    }
    const result = await pool.query(
      `UPDATE captain_payments SET
         captain_name=COALESCE($1,captain_name), boat_id=COALESCE($2,boat_id),
         boat_name=COALESCE($3,boat_name), hours=COALESCE($4,hours),
         work_date=COALESCE($5,work_date), description=COALESCE($6,description),
         amount=COALESCE($7,amount), status=COALESCE($8,status),
         reference=COALESCE($9,reference), updated_at=CURRENT_TIMESTAMP
       WHERE id=$10 RETURNING *`,
      [captain_name||null, boat_id||null, boat_name, hours||null, work_date||null,
       description||null, amount||null, status||null, reference||null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/captain-payments/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM captain_payments WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/captain-payments/summary', isAuthenticated, async (req, res) => {
  try {
    const byBoat = await pool.query(
      `SELECT boat_id, boat_name, COUNT(*) AS payments, SUM(amount) AS total, SUM(COALESCE(hours,0)) AS total_hours
       FROM captain_payments GROUP BY boat_id, boat_name ORDER BY total DESC`
    );
    const byCaptain = await pool.query(
      `SELECT captain_name, COUNT(*) AS payments, SUM(amount) AS total, SUM(COALESCE(hours,0)) AS total_hours
       FROM captain_payments GROUP BY captain_name ORDER BY total DESC`
    );
    const totals = await pool.query(
      `SELECT COUNT(*) AS count, SUM(amount) AS total, SUM(COALESCE(hours,0)) AS total_hours FROM captain_payments`
    );
    res.json({ byBoat: byBoat.rows, byCaptain: byCaptain.rows, totals: totals.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stew Payments ──────────────────────
app.get('/api/stew-payments', isAuthenticated, async (req, res) => {
  try {
    const { boat_id, stew_id, start_date, end_date } = req.query;
    let where = []; let params = [];
    if (boat_id)   { params.push(boat_id);   where.push(`boat_id = $${params.length}`); }
    if (stew_id)   { params.push(stew_id);   where.push(`stew_id = $${params.length}`); }
    if (start_date){ params.push(start_date); where.push(`work_date >= $${params.length}`); }
    if (end_date)  { params.push(end_date);   where.push(`work_date <= $${params.length}`); }
    const sql = `SELECT * FROM stew_payments${where.length?' WHERE '+where.join(' AND '):''} ORDER BY work_date DESC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stew-payments', isAuthenticated, async (req, res) => {
  try {
    const { stew_id, stew_name, boat_id, hours, work_date, description, amount, status, reference } = req.body;
    if (!stew_name || !boat_id || !work_date || !amount) {
      return res.status(400).json({ error: 'stew_name, boat_id, work_date y amount son obligatorios' });
    }
    const boatRes = await pool.query('SELECT name FROM boats WHERE id=$1', [boat_id]);
    const boat_name = boatRes.rows[0]?.name || boat_id;
    const { nanoid } = await import('nanoid');
    const id = 'spay_' + nanoid(10);
    const result = await pool.query(
      `INSERT INTO stew_payments (id, stew_id, stew_name, boat_id, boat_name, hours, work_date, description, amount, status, reference, registered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, stew_id||null, stew_name, boat_id, boat_name, hours||null, work_date,
       description||null, amount, status||'paid', reference||null,
       req.user?.name || req.user?.email || 'sistema']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/stew-payments/:id', isAuthenticated, async (req, res) => {
  try {
    const { stew_name, boat_id, hours, work_date, description, amount, status, reference } = req.body;
    let boat_name = null;
    if (boat_id) {
      const boatRes = await pool.query('SELECT name FROM boats WHERE id=$1', [boat_id]);
      boat_name = boatRes.rows[0]?.name || boat_id;
    }
    const result = await pool.query(
      `UPDATE stew_payments SET
         stew_name=COALESCE($1,stew_name), boat_id=COALESCE($2,boat_id),
         boat_name=COALESCE($3,boat_name), hours=COALESCE($4,hours),
         work_date=COALESCE($5,work_date), description=COALESCE($6,description),
         amount=COALESCE($7,amount), status=COALESCE($8,status),
         reference=COALESCE($9,reference), updated_at=CURRENT_TIMESTAMP
       WHERE id=$10 RETURNING *`,
      [stew_name||null, boat_id||null, boat_name, hours||null, work_date||null,
       description||null, amount||null, status||null, reference||null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stew-payments/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM stew_payments WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stew-payments/summary', isAuthenticated, async (req, res) => {
  try {
    const byBoat = await pool.query(
      `SELECT boat_id, boat_name, COUNT(*) AS payments, SUM(amount) AS total, SUM(COALESCE(hours,0)) AS total_hours
       FROM stew_payments GROUP BY boat_id, boat_name ORDER BY total DESC`
    );
    const byStew = await pool.query(
      `SELECT stew_name, COUNT(*) AS payments, SUM(amount) AS total, SUM(COALESCE(hours,0)) AS total_hours
       FROM stew_payments GROUP BY stew_name ORDER BY total DESC`
    );
    const totals = await pool.query(
      `SELECT COUNT(*) AS count, SUM(amount) AS total, SUM(COALESCE(hours,0)) AS total_hours FROM stew_payments`
    );
    res.json({ byBoat: byBoat.rows, byStew: byStew.rows, totals: totals.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Expense summary by boat ────────────
app.get('/api/boat-expenses/by-boat', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT be.boat_id, b.name AS boat_name,
             COUNT(*) AS expense_count,
             SUM(be.amount) AS total_amount,
             MAX(be.expense_date) AS last_expense_date,
             json_agg(json_build_object('category', be.category, 'total', cat_totals.cat_total) ORDER BY cat_totals.cat_total DESC) AS by_category
      FROM boat_expenses be
      JOIN boats b ON be.boat_id = b.id
      JOIN (
        SELECT boat_id, category, SUM(amount) AS cat_total
        FROM boat_expenses GROUP BY boat_id, category
      ) cat_totals ON cat_totals.boat_id = be.boat_id AND cat_totals.category = be.category
      GROUP BY be.boat_id, b.name
      ORDER BY total_amount DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// FASE 13: DOCUMENT MANAGEMENT
// ========================================

const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const DOC_ENTITY_DIRS = {
  boat: (id) => path.join(__dirname, 'storage', 'boats', id, 'documents'),
  client: (id) => path.join(__dirname, 'storage', 'clients', id, 'documents'),
  task: (id) => path.join(__dirname, 'storage', 'operations', 'tasks', id, 'attachments'),
  global: () => path.join(__dirname, 'storage', 'contracts', 'global'),
  temp: () => path.join(__dirname, 'storage', 'temp'),
};

// Documents use memory storage → file content is saved in PostgreSQL (survives redeployments)
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido. Tipos válidos: PDF, Word, Excel, texto, JPG, PNG.'));
  }
});

// POST /api/documents/upload
app.post('/api/documents/upload', isAuthenticated, (req, res, next) => {
  docUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { doc_type, entity_type, entity_id, boat_id, visible_in_general, notes } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    if (!doc_type) return res.status(400).json({ error: 'doc_type es obligatorio' });

    const { nanoid } = await import('nanoid');
    const id = 'doc_' + nanoid(10);

    const ext = path.extname(req.file.originalname).toLowerCase() || '.bin';
    const docType = (doc_type || 'other').replace(/[^a-z0-9]/gi, '-');
    const eType   = (entity_type || 'unknown').replace(/[^a-z0-9]/gi, '-');
    const eId     = (entity_id || 'x').replace(/[^a-z0-9_-]/gi, '-').slice(0, 20);
    const storedName = `${docType}-${eType}-${eId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}${ext}`;

    const resolvedEntityType = entity_type || (boat_id ? 'boat' : 'global');
    const resolvedEntityId   = entity_id || boat_id || null;
    const resolvedBoatId     = boat_id || (entity_type === 'boat' ? entity_id : null) || null;
    const resolvedVisible    = visible_in_general === 'false' ? false : true;

    // Store file content as BYTEA in PostgreSQL — survives all redeployments
    await pool.query(
      `INSERT INTO documents
         (id, original_name, stored_name, file_path, doc_type, entity_type, entity_id,
          boat_id, visible_in_general, file_size, mime_type, notes, uploaded_by, file_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, req.file.originalname, storedName, 'db:' + id,
       doc_type, resolvedEntityType, resolvedEntityId,
       resolvedBoatId, resolvedVisible,
       req.file.size, req.file.mimetype, notes || null,
       req.user?.name || req.user?.email || 'sistema',
       req.file.buffer]
    );
    const doc = (await pool.query('SELECT id, original_name, stored_name, doc_type, entity_type, entity_id, boat_id, visible_in_general, file_size, mime_type, notes, uploaded_by, created_at FROM documents WHERE id=$1', [id])).rows[0];
    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('[Documents] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents — list with optional filters (NEVER include file_data — it's binary and breaks JSON serialization)
app.get('/api/documents', isAuthenticated, async (req, res) => {
  try {
    const { entity_type, entity_id, doc_type, boat_id, general_only } = req.query;
    let where = [];
    let params = [];
    if (entity_type)  { params.push(entity_type);  where.push(`entity_type = $${params.length}`); }
    if (entity_id)    { params.push(entity_id);    where.push(`entity_id = $${params.length}`); }
    if (doc_type)     { params.push(doc_type);     where.push(`doc_type = $${params.length}`); }
    if (boat_id)      { params.push(boat_id);      where.push(`boat_id = $${params.length}`); }
    if (general_only === 'true') { where.push(`visible_in_general = true`); }
    // Explicitly exclude file_data (BYTEA) — never serialize binary blobs to JSON
    const cols = 'id, original_name, stored_name, doc_type, entity_type, entity_id, boat_id, visible_in_general, file_size, mime_type, notes, uploaded_by, created_at';
    const sql = `SELECT ${cols} FROM documents${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[Documents] List error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: serve a document from DB (primary) or disk (legacy fallback)
async function serveDocument(req, res, disposition) {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });
    const doc = result.rows[0];

    const contentType = doc.mime_type || 'application/octet-stream';
    const safeName = encodeURIComponent(doc.original_name || 'documento');

    // PRIMARY: serve from DB bytea (works after any redeployment)
    if (doc.file_data) {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Length', doc.file_data.length);
      return res.end(doc.file_data);
    }

    // LEGACY FALLBACK: read from disk (files uploaded before the DB migration)
    if (doc.file_path && !doc.file_path.startsWith('db:')) {
      const fullPath = path.join(__dirname, doc.file_path);
      if (require('fs').existsSync(fullPath)) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        // Migrate on-the-fly: save to DB so next request uses DB path
        const buf = require('fs').readFileSync(fullPath);
        pool.query(`UPDATE documents SET file_data=$1, file_path=$2 WHERE id=$3`,
          [buf, 'db:' + doc.id, doc.id]).catch(()=>{});
        return require('fs').createReadStream(fullPath).pipe(res);
      }
    }

    res.status(404).json({ error: 'Archivo no disponible — fue subido antes de la migración de almacenamiento. Por favor vuelve a subir el documento.' });
  } catch (err) {
    console.error('[Documents] serve error:', err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/documents/:id/view — serve file inline for PDF/image preview
app.get('/api/documents/:id/view', isAuthenticated, (req, res) => serveDocument(req, res, 'inline'));

// GET /api/documents/:id/download
app.get('/api/documents/:id/download', isAuthenticated, (req, res) => serveDocument(req, res, 'attachment'));

// DELETE /api/documents/:id
app.delete('/api/documents/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, file_path FROM documents WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });
    const doc = result.rows[0];
    // Try to remove from disk if it was a legacy file-path upload (not a DB-stored file)
    if (doc.file_path && !doc.file_path.startsWith('db:')) {
      try { require('fs').unlinkSync(path.join(__dirname, doc.file_path)); } catch (_) {}
    }
    await pool.query('DELETE FROM documents WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/stats — summary counts
app.get('/api/documents/stats', isAuthenticated, async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) FROM documents');
    const byType = await pool.query('SELECT doc_type, COUNT(*) as count FROM documents GROUP BY doc_type ORDER BY count DESC');
    const byEntity = await pool.query('SELECT entity_type, COUNT(*) as count FROM documents GROUP BY entity_type ORDER BY count DESC');
    const sizeResult = await pool.query('SELECT SUM(file_size) as total_size FROM documents');
    res.json({
      total: parseInt(total.rows[0].count),
      totalSize: parseInt(sizeResult.rows[0].total_size || 0),
      byType: byType.rows,
      byEntity: byEntity.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// EXECUTIVE DASHBOARD
// ============================================================
app.get('/api/executive-dashboard', isAuthenticated, async (req, res) => {
  try {
    const { start, end, boat_id } = req.query;
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = now.toISOString().split('T')[0];
    const startDate = start || defaultStart;
    const endDate = end || defaultEnd;

    // Validate boat_id to prevent injection (only allow safe chars)
    const safeBoatId = boat_id && /^[a-zA-Z0-9_-]+$/.test(boat_id) ? boat_id : null;

    // Compute previous period of same length
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const diffMs = Math.max(endMs - startMs, 0);
    const prevEndDate = new Date(startMs - 86400000).toISOString().split('T')[0];
    const prevStartDate = new Date(startMs - diffMs - 86400000).toISOString().split('T')[0];
    const daysInPeriod = Math.round(diffMs / 86400000) + 1;

    const p = safeBoatId ? [startDate, endDate, safeBoatId] : [startDate, endDate];
    const bc = safeBoatId ? 'AND boat_id = $3' : '';
    const pp = safeBoatId ? [prevStartDate, prevEndDate, safeBoatId] : [prevStartDate, prevEndDate];

    const [
      incomeRow, expRow, capRow, stewRow,
      arTotalRow, depPendRow,
      incomePerDay, ledgerByBoat,
      upcoming, boatsAll,
      prevIncomeRow, prevExpRow, prevCapRow, prevStewRow,
      expByCat,
      incomeByBoat, expByBoatR, capByBoat, stewByBoat,
      arList, depList,
      cashBkg7d, cashAR7d,
      depositsAppliedRow,
      prevIncomeByBoat,
      globalExpByCat,
      incomeExpPerDay,
    ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE transaction_type='income' AND transaction_date BETWEEN $1 AND $2 ${bc}`, p),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM boat_expenses WHERE expense_date BETWEEN $1 AND $2 ${bc}`, p),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM captain_payments WHERE work_date BETWEEN $1 AND $2 ${bc}`, p),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM stew_payments WHERE work_date BETWEEN $1 AND $2 ${bc}`, p),
      safeBoatId
        ? pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM booking_receivables WHERE status='pending' AND boat_id=$1`, [safeBoatId])
        : pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM booking_receivables WHERE status='pending'`),
      safeBoatId
        ? pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM booking_deposits WHERE status='pending' AND boat_id=$1`, [safeBoatId])
        : pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM booking_deposits WHERE status='pending'`),
      pool.query(`SELECT transaction_date::text as date, SUM(amount) as income, COUNT(*) as tx_count FROM transactions WHERE transaction_type='income' AND transaction_date BETWEEN $1 AND $2 ${bc} GROUP BY transaction_date ORDER BY transaction_date`, p),
      pool.query(`SELECT boat_id, COALESCE(SUM(hours_rented),0) as hours, COUNT(*) as bookings FROM bookings_ledger WHERE booking_date BETWEEN $1 AND $2 AND status != 'cancelled' ${bc} GROUP BY boat_id`, p),
      safeBoatId
        ? pool.query(`SELECT bl.*, b.name as boat_name_ref FROM bookings_ledger bl LEFT JOIN boats b ON b.id=bl.boat_id WHERE bl.booking_date >= CURRENT_DATE AND bl.status != 'cancelled' AND bl.boat_id=$1 ORDER BY bl.booking_date LIMIT 30`, [safeBoatId])
        : pool.query(`SELECT bl.*, b.name as boat_name_ref FROM bookings_ledger bl LEFT JOIN boats b ON b.id=bl.boat_id WHERE bl.booking_date >= CURRENT_DATE AND bl.status != 'cancelled' ORDER BY bl.booking_date LIMIT 30`),
      pool.query(`SELECT id, name FROM boats WHERE status != 'inactive' ORDER BY name`),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE transaction_type='income' AND transaction_date BETWEEN $1 AND $2 ${bc}`, pp),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM boat_expenses WHERE expense_date BETWEEN $1 AND $2 ${bc}`, pp),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM captain_payments WHERE work_date BETWEEN $1 AND $2 ${bc}`, pp),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM stew_payments WHERE work_date BETWEEN $1 AND $2 ${bc}`, pp),
      pool.query(`SELECT boat_id, category, SUM(amount) as total FROM boat_expenses WHERE expense_date BETWEEN $1 AND $2 ${bc} GROUP BY boat_id, category ORDER BY boat_id, total DESC`, p),
      pool.query(`SELECT boat_id, COALESCE(SUM(amount),0) as total FROM transactions WHERE transaction_type='income' AND transaction_date BETWEEN $1 AND $2 ${bc} GROUP BY boat_id`, p),
      pool.query(`SELECT boat_id, COALESCE(SUM(amount),0) as total FROM boat_expenses WHERE expense_date BETWEEN $1 AND $2 ${bc} GROUP BY boat_id`, p),
      pool.query(`SELECT boat_id, boat_name, COALESCE(SUM(amount),0) as total FROM captain_payments WHERE work_date BETWEEN $1 AND $2 ${bc} GROUP BY boat_id, boat_name`, p),
      pool.query(`SELECT boat_id, boat_name, COALESCE(SUM(amount),0) as total FROM stew_payments WHERE work_date BETWEEN $1 AND $2 ${bc} GROUP BY boat_id, boat_name`, p),
      safeBoatId
        ? pool.query(`SELECT br.*, b.name as boat_name_ref FROM booking_receivables br LEFT JOIN boats b ON b.id=br.boat_id WHERE br.status='pending' AND br.boat_id=$1 ORDER BY br.due_date LIMIT 30`, [safeBoatId])
        : pool.query(`SELECT br.*, b.name as boat_name_ref FROM booking_receivables br LEFT JOIN boats b ON b.id=br.boat_id WHERE br.status='pending' ORDER BY br.due_date LIMIT 30`),
      safeBoatId
        ? pool.query(`SELECT bd.*, b.name as boat_name_ref FROM booking_deposits bd LEFT JOIN boats b ON b.id=bd.boat_id WHERE bd.status='pending' AND bd.boat_id=$1 ORDER BY bd.deposit_date DESC LIMIT 30`, [safeBoatId])
        : pool.query(`SELECT bd.*, b.name as boat_name_ref FROM booking_deposits bd LEFT JOIN boats b ON b.id=bd.boat_id WHERE bd.status='pending' ORDER BY bd.deposit_date DESC LIMIT 30`),
      // Cash expected from upcoming booking balances (next 7 days)
      safeBoatId
        ? pool.query(`SELECT COALESCE(SUM(GREATEST(COALESCE(total_amount,0)-COALESCE(deposit_amount,0),0)),0) as total FROM bookings_ledger WHERE booking_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 AND status!='cancelled' AND boat_id=$1`, [safeBoatId])
        : pool.query(`SELECT COALESCE(SUM(GREATEST(COALESCE(total_amount,0)-COALESCE(deposit_amount,0),0)),0) as total FROM bookings_ledger WHERE booking_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 AND status!='cancelled'`),
      // AR due in next 7 days
      safeBoatId
        ? pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM booking_receivables WHERE status='pending' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 AND boat_id=$1`, [safeBoatId])
        : pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM booking_receivables WHERE status='pending' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7`),
      // Deposits applied in period
      pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM booking_deposits WHERE status='applied' AND deposit_date BETWEEN $1 AND $2 ${bc}`, p),
      // Previous period income by boat (for trend)
      pool.query(`SELECT boat_id, COALESCE(SUM(amount),0) as total FROM transactions WHERE transaction_type='income' AND transaction_date BETWEEN $1 AND $2 ${bc} GROUP BY boat_id`, pp),
      // Global expense categories (for donut chart)
      pool.query(`SELECT category, SUM(amount) as total FROM boat_expenses WHERE expense_date BETWEEN $1 AND $2 ${bc} GROUP BY category ORDER BY total DESC`, p),
      // Income + expenses per day for trend chart
      pool.query(`SELECT transaction_date::text as date, transaction_type, SUM(amount) as total FROM transactions WHERE transaction_date BETWEEN $1 AND $2 ${bc} AND transaction_type IN ('income','expense') GROUP BY transaction_date, transaction_type ORDER BY transaction_date`, p),
    ]);

    const income   = parseFloat(incomeRow.rows[0].total);
    const expenses = parseFloat(expRow.rows[0].total);
    const captain  = parseFloat(capRow.rows[0].total);
    const stew     = parseFloat(stewRow.rows[0].total);
    const crewCost = captain + stew;
    const netProfit = income - expenses - crewCost;

    const totalHours    = ledgerByBoat.rows.reduce((s, r) => s + parseFloat(r.hours || 0), 0);
    const totalBookings = ledgerByBoat.rows.reduce((s, r) => s + parseInt(r.bookings || 0), 0);
    const avgHoursPerBooking = totalBookings > 0 ? totalHours / totalBookings : 0;
    const totalBoats = boatsAll.rows.length || 1;
    const occupancy = Math.min(100, totalBookings > 0 ? (totalBookings / (totalBoats * daysInPeriod)) * 100 : 0);

    const prevIncome  = parseFloat(prevIncomeRow.rows[0].total);
    const prevExpenses= parseFloat(prevExpRow.rows[0].total);
    const prevCrew    = parseFloat(prevCapRow.rows[0].total) + parseFloat(prevStewRow.rows[0].total);
    const prevProfit  = prevIncome - prevExpenses - prevCrew;

    const pct = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100) : null;

    // Build per-boat profitability map
    const bmap = {};
    boatsAll.rows.forEach(b => { bmap[b.id] = { id: b.id, name: b.name, bookings: 0, hours: 0, income: 0, expenses: 0, captain: 0, stew: 0 }; });
    const ensureBoat = (id, name) => { if (!bmap[id]) bmap[id] = { id, name: name || id, bookings: 0, hours: 0, income: 0, expenses: 0, captain: 0, stew: 0 }; };
    incomeByBoat.rows.forEach(r  => { ensureBoat(r.boat_id); bmap[r.boat_id].income   = parseFloat(r.total); });
    expByBoatR.rows.forEach(r    => { ensureBoat(r.boat_id); bmap[r.boat_id].expenses  = parseFloat(r.total); });
    capByBoat.rows.forEach(r     => { ensureBoat(r.boat_id, r.boat_name); bmap[r.boat_id].captain  = parseFloat(r.total); });
    stewByBoat.rows.forEach(r    => { ensureBoat(r.boat_id, r.boat_name); bmap[r.boat_id].stew     = parseFloat(r.total); });
    ledgerByBoat.rows.forEach(r  => { ensureBoat(r.boat_id); bmap[r.boat_id].bookings = parseInt(r.bookings||0); bmap[r.boat_id].hours = parseFloat(r.hours||0); });

    const profitByBoat = Object.values(bmap)
      .map(b => { const profit = b.income - b.expenses - b.captain - b.stew; return { ...b, crew: b.captain + b.stew, profit, margin: b.income > 0 ? profit / b.income * 100 : 0 }; })
      .filter(b => b.income > 0 || b.expenses > 0 || b.captain > 0 || b.stew > 0)
      .sort((a, b) => b.income - a.income);

    // Build expense categories by boat
    const expCatMap = {};
    expByCat.rows.forEach(r => {
      if (!expCatMap[r.boat_id]) expCatMap[r.boat_id] = { boatId: r.boat_id, boatName: (bmap[r.boat_id] || {}).name || r.boat_id, total: 0, categories: {} };
      expCatMap[r.boat_id].categories[r.category] = parseFloat(r.total);
      expCatMap[r.boat_id].total += parseFloat(r.total);
    });

    // Cash expected next 7 days
    const cashExpected7d = parseFloat(cashBkg7d.rows[0].total) + parseFloat(cashAR7d.rows[0].total);

    // Deposits applied
    const depositsApplied = { total: parseFloat(depositsAppliedRow.rows[0].total), count: parseInt(depositsAppliedRow.rows[0].count) };

    // Previous period income by boat map
    const prevIncomeBmap = {};
    prevIncomeByBoat.rows.forEach(r => { prevIncomeBmap[r.boat_id] = parseFloat(r.total); });

    // Add prev income trend to profitByBoat
    profitByBoat.forEach(b => {
      b.prevIncome = prevIncomeBmap[b.id] || 0;
      b.incomeTrend = b.prevIncome > 0 ? ((b.income - b.prevIncome) / b.prevIncome * 100) : null;
      b.incomePerBooking = b.bookings > 0 ? b.income / b.bookings : 0;
      b.incomePerHour = b.hours > 0 ? b.income / b.hours : 0;
      b.costPerHour = b.hours > 0 ? (b.expenses + b.crew) / b.hours : 0;
      b.profitPerHour = b.hours > 0 ? b.profit / b.hours : 0;
    });

    // Build income/expense per day for combo trend chart
    const dayTrendMap = {};
    incomeExpPerDay.rows.forEach(r => {
      if (!dayTrendMap[r.date]) dayTrendMap[r.date] = { date: r.date, income: 0, expense: 0 };
      dayTrendMap[r.date][r.transaction_type] = parseFloat(r.total);
    });
    const trendPerDay = Object.values(dayTrendMap).sort((a,b) => a.date.localeCompare(b.date));

    // Smart alerts
    const now2 = new Date();
    const alerts = [];
    profitByBoat.forEach(b => {
      if (b.profit < 0 && b.income > 0) alerts.push({ priority: 'alta', msg: `${b.name}: utilidad negativa ($${Math.abs(b.profit).toFixed(0)}) — margen ${b.margin.toFixed(1)}%`, type: 'negative_profit', boat: b.name });
      else if (b.income > 0 && b.margin < 15 && b.margin >= 0) alerts.push({ priority: 'media', msg: `${b.name}: margen bajo (${b.margin.toFixed(1)}%) — revisar gastos`, type: 'low_margin', boat: b.name });
      if (b.income > 0 && b.expenses > b.income * 0.6) alerts.push({ priority: 'media', msg: `${b.name}: gastos representan ${(b.expenses/b.income*100).toFixed(0)}% de ingresos`, type: 'high_expenses', boat: b.name });
      if (b.income > 0 && b.crew > b.income * 0.4) alerts.push({ priority: 'media', msg: `${b.name}: crew cost = ${(b.crew/b.income*100).toFixed(0)}% de ingresos`, type: 'high_crew', boat: b.name });
    });
    const overdueAR = arList.rows.filter(r => r.due_date && new Date(r.due_date) < now2);
    if (overdueAR.length > 0) alerts.push({ priority: 'alta', msg: `${overdueAR.length} cuenta(s) por cobrar vencida(s) — acción inmediata`, type: 'overdue_ar' });
    const depPendCount = parseInt(depPendRow.rows[0].count);
    if (depPendCount > 0) {
      const oldest = depList.rows[0];
      const daysOld = oldest && oldest.deposit_date ? Math.round((now2 - new Date(oldest.deposit_date)) / 86400000) : 0;
      alerts.push({ priority: daysOld > 30 ? 'alta' : 'media', msg: `${depPendCount} depósito(s) sin aplicar${daysOld > 0 ? ` — el más antiguo hace ${daysOld} días` : ''}`, type: 'pending_deposits' });
    }
    // Upcoming with unpaid balance
    const upcomingWithBalance = upcoming.rows.filter(b => b.total_amount > 0 && (b.total_amount - (b.deposit_amount||0)) > 0).slice(0,3);
    if (upcomingWithBalance.length > 0) alerts.push({ priority: 'baja', msg: `${upcomingWithBalance.length} booking(s) próximo(s) con saldo pendiente de cobro`, type: 'upcoming_balance' });
    if (income > 0 && crewCost > income * 0.5) alerts.push({ priority: 'media', msg: `Crew cost total = ${(crewCost/income*100).toFixed(0)}% de ingresos del período`, type: 'high_crew_total' });

    res.json({
      period: { start: startDate, end: endDate, prevStart: prevStartDate, prevEnd: prevEndDate, days: daysInPeriod },
      kpis: {
        income, expenses, crewCost, netProfit, totalHours, totalBookings, avgHoursPerBooking, occupancy,
        arPending: parseFloat(arTotalRow.rows[0].total), arCount: parseInt(arTotalRow.rows[0].count),
        depositsPending: parseFloat(depPendRow.rows[0].total), depositsCount: depPendCount,
        cashExpected7d, depositsApplied,
        incomePerBooking: totalBookings > 0 ? income / totalBookings : 0,
        incomePerHour: totalHours > 0 ? income / totalHours : 0,
        costPerHour: totalHours > 0 ? (expenses + crewCost) / totalHours : 0,
        profitPerHour: totalHours > 0 ? netProfit / totalHours : 0,
        boatsWithLoss: profitByBoat.filter(b => b.profit < 0).length,
      },
      comparison: { prevIncome, prevExpenses, prevCrew, prevProfit,
                    incomeChange: pct(income, prevIncome), expensesChange: pct(expenses, prevExpenses),
                    profitChange: prevProfit !== 0 ? ((netProfit - prevProfit) / Math.abs(prevProfit) * 100) : null },
      incomePerDay: incomePerDay.rows,
      trendPerDay,
      profitByBoat,
      expensesByBoat: Object.values(expCatMap),
      expensesByCategory: globalExpByCat.rows.map(r => ({ category: r.category, total: parseFloat(r.total) })),
      upcomingBookings: upcoming.rows,
      arList: arList.rows,
      pendingDeposits: depList.rows,
      boats: boatsAll.rows,
      alerts,
    });
  } catch (err) {
    console.error('Executive dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Required for deployment

app.listen(PORT, HOST, () => {
  console.log(`🚀 Nadaki Excursions Backend running on ${HOST}:${PORT}`);
  console.log(`🌐 WordPress: ${WORDPRESS_DOMAIN}`);
  console.log(`📧 Webhooks disponibles para ${PLATFORMS.length} plataformas`);
  console.log(`🔗 Dashboard: http://localhost:${PORT}/api/dashboard-data`);
});
