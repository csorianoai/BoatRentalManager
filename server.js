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
    
    console.log('✅ Database schema initialized successfully (all 5 phases)');
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

// 🏠 RUTA RAÍZ - Redirigir al Dashboard
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

    // Asignar capitán y enviar notificaciones
    const assignedCaptain = await assignCaptain(normalizedBooking.boat_type);
    
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

// 👨‍✈️ SISTEMA INTELIGENTE DE ASIGNACIÓN
async function assignCaptain(boatType) {
  const captainsResult = await pool.query(
    "SELECT * FROM captains WHERE status = 'available'"
  );
  const availableCaptains = captainsResult.rows;
  
  if (availableCaptains.length === 0) return null;
  
  const today = moment().format('YYYY-MM-DD');
  
  // Priorizar capitanes con especialidades que coincidan
  const scoredCaptains = await Promise.all(availableCaptains.map(async captain => {
    let score = 4.0;
    
    // Bonus por especialidad
    if (captain.specialties && captain.specialties.some(spec => 
      boatType.toLowerCase().includes(spec.toLowerCase()))) {
      score += 1.0;
    }
    
    // Bonus por menos reservas hoy
    const todayBookingsResult = await pool.query(
      'SELECT COUNT(*) FROM bookings WHERE assigned_captain_id = $1 AND booking_date = $2',
      [captain.id, today]
    );
    const todayBookings = parseInt(todayBookingsResult.rows[0].count);
    score -= (todayBookings * 0.1);
    
    return { captain, score };
  }));
  
  scoredCaptains.sort((a, b) => b.score - a.score);
  return scoredCaptains[0]?.captain || availableCaptains[0];
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
app.get('/api/dashboard-data', async (req, res) => {
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
app.get('/api/bookings', async (req, res) => {
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

app.get('/api/platforms', (req, res) => {
  res.json(PLATFORMS);
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
app.get('/api/chat/conversations/:sessionId', async (req, res) => {
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
app.get('/api/chat/conversations', async (req, res) => {
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

// ⚡ FASE 2: PLATFORM SYNCHRONIZATION ENDPOINTS
const syncService = require('./server/syncService');

// Trigger sync for specific platform
app.post('/api/sync/trigger/:platform', async (req, res) => {
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
app.post('/api/sync/trigger-all', async (req, res) => {
  try {
    const result = await syncService.syncAllPlatforms();
    res.json(result);
  } catch (error) {
    console.error('Error triggering sync all:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// Get sync status for all platforms
app.get('/api/sync/status', async (req, res) => {
  try {
    const status = await syncService.getSyncStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Get detected conflicts
app.get('/api/sync/conflicts', async (req, res) => {
  try {
    const conflicts = await syncService.getConflicts();
    res.json(conflicts);
  } catch (error) {
    console.error('Error getting conflicts:', error);
    res.status(500).json({ error: 'Failed to get conflicts' });
  }
});

// Resolve a conflict (cancel one of the bookings)
app.post('/api/sync/resolve-conflict', async (req, res) => {
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

// 🚀 INICIAR SERVIDOR
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Required for deployment

app.listen(PORT, HOST, () => {
  console.log(`🚀 Nadaki Excursions Backend running on ${HOST}:${PORT}`);
  console.log(`🌐 WordPress: ${WORDPRESS_DOMAIN}`);
  console.log(`📧 Webhooks disponibles para ${PLATFORMS.length} plataformas`);
  console.log(`🔗 Dashboard: http://localhost:${PORT}/api/dashboard-data`);
});
