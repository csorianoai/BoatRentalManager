const express = require('express');
const twilio = require('twilio');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');
const moment = require('moment');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
require('dotenv').config();

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
    
    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database schema:', error);
    throw error;
  }
}

// Initialize database before starting server
initializeDatabase().catch(console.error);

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del dashboard
app.use(express.static('public'));

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

// 🚀 INICIAR SERVIDOR
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Nadaki Excursions Backend running on port ${PORT}`);
  console.log(`🌐 WordPress: ${WORDPRESS_DOMAIN}`);
  console.log(`📧 Webhooks disponibles para ${PLATFORMS.length} plataformas`);
  console.log(`🔗 Dashboard: http://localhost:${PORT}/api/dashboard-data`);
});
