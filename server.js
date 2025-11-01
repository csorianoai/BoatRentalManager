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
const { setupAuth, isAuthenticated: replitAuthMiddleware } = require('./replitAuth');

// Use real Replit Auth middleware for all protected endpoints
const isAuthenticated = replitAuthMiddleware;
const aiOrchestrator = require('./ai-orchestrator');
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
pool.on('connect', () => console.log('✅ Connected to PostgreSQL database'));

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
        features JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
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
    
    console.log('✅ Database schema initialized successfully (all 5 phases + authentication)');
  } catch (error) {
    console.error('❌ Error initializing database schema:', error);
    throw error;
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

// Configure authentication (async setup)
(async () => {
  try {
    await setupAuth(app);
    console.log('✅ Authentication configured successfully');
  } catch (error) {
    console.error('❌ Error setting up authentication:', error);
  }
})();

// 🏠 RUTA RAÍZ - Mostrar login o dashboard según autenticación
app.get('/', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.redirect('/dashboard.html');
  } else {
    res.redirect('/login.html');
  }
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
    const weekStart = moment().startOf('week').format('YYYY-MM-DD');
    const weekEnd = moment().endOf('week').format('YYYY-MM-DD');
    
    // Get today's bookings
    const todayResult = await pool.query(
      'SELECT * FROM bookings WHERE booking_date = $1',
      [today]
    );
    
    // Get week's bookings
    const weekResult = await pool.query(
      'SELECT * FROM bookings WHERE booking_date >= $1 AND booking_date <= $2',
      [weekStart, weekEnd]
    );
    
    // Get all bookings for totals
    const allBookings = await pool.query('SELECT * FROM bookings');
    
    // Get captains
    const captainsResult = await pool.query('SELECT * FROM captains');
    const captains = captainsResult.rows;
    
    // Calculate metrics
    const todayBookings = todayResult.rows;
    const weekBookings = weekResult.rows;
    const totalBookings = allBookings.rows;
    
    // Group bookings by platform
    const bookingsByPlatform = {};
    const revenueByPlatform = {};
    totalBookings.forEach(booking => {
      bookingsByPlatform[booking.platform] = (bookingsByPlatform[booking.platform] || 0) + 1;
      revenueByPlatform[booking.platform] = (revenueByPlatform[booking.platform] || 0) + (booking.total_amount || 0);
    });
    
    const dashboardData = {
      // Métricas principales
      today_bookings: todayBookings.length,
      week_bookings: weekBookings.length,
      active_captains: captains.filter(c => c.status === 'available').length,
      total_captains: captains.length,
      
      // Revenue
      today_revenue: todayBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
      week_revenue: weekBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
      total_revenue: totalBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
      
      // Datos para gráficos
      bookings_by_platform: bookingsByPlatform,
      revenue_by_platform: revenueByPlatform,
      
      // Reservas recientes (últimas 10)
      recent_bookings: totalBookings.slice(-10).reverse(),
      
      // Capitanes activos
      active_captains_list: captains.filter(c => c.status === 'available')
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
    const { platform, status, date } = req.query;
    
    let query = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (platform) {
      query += ` AND platform = $${paramIndex}`;
      params.push(platform);
      paramIndex++;
    }
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (date) {
      query += ` AND booking_date = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/platforms', isAuthenticated, (req, res) => {
  res.json(PLATFORMS);
});

app.get('/api/captains', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM captains');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching captains:', error);
    res.status(500).json({ error: 'Internal server error' });
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
const AvailabilityService = require('./server/availabilityService');
const SyncJobsWorker = require('./server/syncJobsWorker');

const pricingService = new PricingService(pool);
const availabilityService = new AvailabilityService(pool);
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
    
    console.log('✅ Trip report created:', result.rows[0]);
    res.json(result.rows[0]);
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
    
    console.log('✅ Payment marked as paid:', result.rows[0]);
    res.json(result.rows[0]);
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

// 🚀 INICIAR SERVIDOR
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Required for deployment

app.listen(PORT, HOST, () => {
  console.log(`🚀 Nadaki Excursions Backend running on ${HOST}:${PORT}`);
  console.log(`🌐 WordPress: ${WORDPRESS_DOMAIN}`);
  console.log(`📧 Webhooks disponibles para ${PLATFORMS.length} plataformas`);
  console.log(`🔗 Dashboard: http://localhost:${PORT}/api/dashboard-data`);
});
