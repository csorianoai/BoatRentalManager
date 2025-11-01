/**
 * FASE 2: Servicio de Sincronización Multiplataforma
 * 
 * Este servicio maneja la sincronización bidireccional con 13 plataformas de reservas:
 * Airbnb, GetMyBoat, BoatSetter, Viator, Expedia, TripAdvisor, Groupon,
 * Booking.com, FareHarbor, Bokun, Rezdy, Peek, Xola
 * 
 * Arquitectura:
 * - Simulación de APIs (ready para reemplazar con integraciones reales)
 * - Detección automática de conflictos
 * - Sincronización bidireccional
 * - Estado persistente en PostgreSQL
 */

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const availabilityService = require('./availabilityService');
const syncJobsWorker = require('./syncJobsWorker');

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Configuración de plataformas
const PLATFORMS = [
  'Airbnb',
  'GetMyBoat',
  'BoatSetter',
  'Viator',
  'Expedia',
  'TripAdvisor',
  'Groupon',
  'Booking.com',
  'FareHarbor',
  'Bokun',
  'Rezdy',
  'Peek',
  'Xola'
];

/**
 * Simula obtener reservas de una plataforma externa
 * En producción, esto se reemplazaría con llamadas reales a las APIs
 */
async function fetchBookingsFromPlatform(platform) {
  // Simulación: En producción, aquí iría la llamada a la API real
  console.log(`📥 Fetching bookings from ${platform}...`);
  
  // Simulamos que cada plataforma tiene 0-2 nuevas reservas aleatorias
  const numBookings = Math.floor(Math.random() * 3);
  const mockBookings = [];
  
  for (let i = 0; i < numBookings; i++) {
    const randomDate = new Date();
    randomDate.setDate(randomDate.getDate() + Math.floor(Math.random() * 30));
    
    mockBookings.push({
      externalId: `${platform.toLowerCase()}_${Date.now()}_${i}`,
      platform,
      customerName: `Cliente ${platform} ${i + 1}`,
      customerPhone: `+1555${Math.floor(Math.random() * 10000000)}`,
      customerEmail: `customer${i}@${platform.toLowerCase()}.com`,
      boatType: ['Tour medio día', 'Tour día completo'][Math.floor(Math.random() * 2)],
      bookingDate: randomDate.toISOString().split('T')[0],
      startTime: ['09:00', '12:00', '15:00'][Math.floor(Math.random() * 3)],
      durationHours: [4, 8][Math.floor(Math.random() * 2)],
      totalAmount: Math.floor(Math.random() * 1000) + 500,
      status: 'pending'
    });
  }
  
  return mockBookings;
}

/**
 * Detecta conflictos entre reservas
 * Un conflicto ocurre cuando:
 * - Misma fecha y hora
 * - Mismo capitán asignado
 * - Recursos limitados (barcos)
 */
async function detectConflicts(newBooking) {
  const conflicts = [];
  
  try {
    // Buscar reservas existentes en la misma fecha
    const existingBookings = await pool.query(`
      SELECT * FROM bookings 
      WHERE booking_date = $1 
      AND start_time = $2 
      AND status != 'cancelled'
    `, [newBooking.bookingDate, newBooking.startTime]);
    
    if (existingBookings.rows.length > 0) {
      for (const existing of existingBookings.rows) {
        conflicts.push({
          type: 'time_overlap',
          severity: 'high',
          newBooking: newBooking.externalId,
          existingBooking: existing.id,
          message: `Conflicto: Reserva en ${newBooking.bookingDate} a las ${newBooking.startTime}`,
          details: {
            existingPlatform: existing.platform,
            newPlatform: newBooking.platform,
            date: newBooking.bookingDate,
            time: newBooking.startTime
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error detecting conflicts:', error);
  }
  
  return conflicts;
}

/**
 * Importa una reserva a la base de datos local
 * FASE 7: Integra verificación de disponibilidad y sincronización bidireccional
 */
async function importBooking(booking) {
  try {
    // Verificar si ya existe
    const existing = await pool.query(
      'SELECT id FROM bookings WHERE id = $1',
      [booking.externalId]
    );
    
    if (existing.rows.length > 0) {
      return { status: 'duplicate', bookingId: booking.externalId };
    }
    
    // Detectar conflictos
    const conflicts = await detectConflicts(booking);
    
    if (conflicts.length > 0) {
      return { 
        status: 'conflict', 
        bookingId: booking.externalId,
        conflicts 
      };
    }
    
    // FASE 7: Verificar disponibilidad usando availability_blocks
    // Asumimos que cada booking requiere 1 barco (boatId genérico por ahora)
    const endTime = calculateEndTime(booking.startTime, booking.durationHours);
    const availabilityCheck = await availabilityService.checkAvailability(
      'default_boat', // En producción, esto vendría del sistema de inventario
      booking.bookingDate,
      booking.startTime,
      endTime
    );
    
    if (!availabilityCheck.available) {
      return {
        status: 'unavailable',
        bookingId: booking.externalId,
        message: 'Fecha/hora no disponible (bloqueada por otra plataforma)'
      };
    }
    
    // Insertar reserva
    await pool.query(`
      INSERT INTO bookings (
        id, platform, customer_name, customer_phone, customer_email,
        boat_type, booking_date, start_time, duration_hours, total_amount,
        status, notes, internal_notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
    `, [
      booking.externalId,
      booking.platform,
      booking.customerName,
      booking.customerPhone,
      booking.customerEmail,
      booking.boatType,
      booking.bookingDate,
      booking.startTime,
      booking.durationHours,
      booking.totalAmount,
      booking.status,
      booking.notes || '',
      `Importado automáticamente de ${booking.platform}`,
    ]);
    
    // FASE 7: Crear bloqueo de disponibilidad para prevenir double-booking
    await availabilityService.createBlock({
      boatId: 'default_boat',
      blockDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: endTime,
      blockType: 'booking',
      sourcePlatform: booking.platform,
      bookingId: booking.externalId,
      notes: `Bloqueo automático por reserva ${booking.externalId}`
    });
    
    // FASE 7: Encolar trabajos de sincronización para bloquear en otras plataformas
    // Bloquear la misma fecha/hora en las otras 12 plataformas
    const otherPlatforms = PLATFORMS.filter(p => p !== booking.platform);
    for (const targetPlatform of otherPlatforms) {
      await syncJobsWorker.queueSyncJob({
        jobType: 'block_date',
        targetPlatform,
        sourcePlatform: booking.platform,
        bookingId: booking.externalId,
        payload: {
          date: booking.bookingDate,
          startTime: booking.startTime,
          endTime: endTime,
          reason: `Reserva confirmada en ${booking.platform}`
        }
      });
    }
    
    return { status: 'imported', bookingId: booking.externalId };
    
  } catch (error) {
    console.error('Error importing booking:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Calcula hora de fin basado en hora de inicio y duración
 */
function calculateEndTime(startTime, durationHours) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHours = hours + durationHours;
  return `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Sincroniza una plataforma específica
 */
async function syncPlatform(platform) {
  const syncId = `sync_${platform}_${Date.now()}`;
  const startTime = new Date();
  
  console.log(`🔄 Starting sync for ${platform}...`);
  
  try {
    // Actualizar estado a "in_progress"
    await updateSyncStatus(platform, 'in_progress', null, 0, 0);
    
    // Obtener reservas de la plataforma
    const externalBookings = await fetchBookingsFromPlatform(platform);
    
    let imported = 0;
    let conflicts = 0;
    const errors = [];
    
    // Importar cada reserva
    for (const booking of externalBookings) {
      const result = await importBooking(booking);
      
      if (result.status === 'imported') {
        imported++;
      } else if (result.status === 'conflict') {
        conflicts++;
        errors.push(`Conflicto en reserva ${booking.externalId}`);
      } else if (result.status === 'error') {
        errors.push(`Error: ${result.error}`);
      }
    }
    
    // Actualizar estado final
    const status = errors.length > 0 ? 'error' : 'success';
    await updateSyncStatus(platform, status, errors, imported, conflicts);
    
    const duration = ((new Date() - startTime) / 1000).toFixed(2);
    console.log(`✅ Sync completed for ${platform} in ${duration}s - Imported: ${imported}, Conflicts: ${conflicts}`);
    
    return {
      platform,
      status,
      imported,
      conflicts,
      errors,
      duration
    };
    
  } catch (error) {
    console.error(`❌ Sync failed for ${platform}:`, error);
    await updateSyncStatus(platform, 'error', [error.message], 0, 0);
    
    return {
      platform,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Actualiza el estado de sincronización en la base de datos
 */
async function updateSyncStatus(platform, status, errors, bookingsSynced, conflictsDetected) {
  try {
    // Verificar si existe un registro para esta plataforma
    const existing = await pool.query(
      'SELECT id FROM platform_sync_status WHERE platform = $1',
      [platform]
    );
    
    if (existing.rows.length > 0) {
      // Actualizar existente
      await pool.query(`
        UPDATE platform_sync_status 
        SET last_sync_at = CURRENT_TIMESTAMP,
            sync_status = $1,
            sync_errors = $2,
            bookings_synced = bookings_synced + $3,
            conflicts_detected = conflicts_detected + $4,
            next_sync_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes'
        WHERE platform = $5
      `, [status, JSON.stringify(errors || []), bookingsSynced, conflictsDetected, platform]);
    } else {
      // Crear nuevo
      const id = `sync_${platform}_${Date.now()}`;
      await pool.query(`
        INSERT INTO platform_sync_status (
          id, platform, last_sync_at, sync_status, sync_errors,
          bookings_synced, conflicts_detected, next_sync_at, created_at
        ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '15 minutes', CURRENT_TIMESTAMP)
      `, [id, platform, status, JSON.stringify(errors || []), bookingsSynced, conflictsDetected]);
    }
  } catch (error) {
    console.error('Error updating sync status:', error);
  }
}

/**
 * Sincroniza todas las plataformas
 */
async function syncAllPlatforms() {
  console.log('🚀 Starting sync for all platforms...');
  
  const results = [];
  
  // Sincronizar en paralelo (máximo 3 a la vez para no sobrecargar)
  const batchSize = 3;
  for (let i = 0; i < PLATFORMS.length; i += batchSize) {
    const batch = PLATFORMS.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(platform => syncPlatform(platform))
    );
    results.push(...batchResults);
  }
  
  const summary = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    errors: results.filter(r => r.status === 'error').length,
    totalImported: results.reduce((sum, r) => sum + (r.imported || 0), 0),
    totalConflicts: results.reduce((sum, r) => sum + (r.conflicts || 0), 0)
  };
  
  console.log('✅ All platforms synced:', summary);
  return { results, summary };
}

/**
 * Obtiene el estado de sincronización de todas las plataformas
 */
async function getSyncStatus() {
  try {
    const result = await pool.query(`
      SELECT * FROM platform_sync_status 
      ORDER BY last_sync_at DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('Error getting sync status:', error);
    return [];
  }
}

/**
 * Obtiene conflictos detectados
 */
async function getConflicts() {
  try {
    // En esta implementación, los conflictos se detectan en tiempo real
    // Aquí podríamos buscar reservas con overlaps
    const result = await pool.query(`
      SELECT 
        b1.id as booking1_id,
        b1.platform as platform1,
        b1.customer_name as customer1,
        b1.booking_date,
        b1.start_time,
        b2.id as booking2_id,
        b2.platform as platform2,
        b2.customer_name as customer2
      FROM bookings b1
      INNER JOIN bookings b2 
        ON b1.booking_date = b2.booking_date 
        AND b1.start_time = b2.start_time
        AND b1.id < b2.id
      WHERE b1.status != 'cancelled' 
        AND b2.status != 'cancelled'
      ORDER BY b1.booking_date DESC
      LIMIT 50
    `);
    
    return result.rows.map(row => ({
      type: 'time_overlap',
      severity: 'high',
      bookings: [
        { id: row.booking1_id, platform: row.platform1, customer: row.customer1 },
        { id: row.booking2_id, platform: row.platform2, customer: row.customer2 }
      ],
      date: row.booking_date,
      time: row.start_time,
      message: `Conflicto de horario el ${row.booking_date} a las ${row.start_time}`
    }));
  } catch (error) {
    console.error('Error getting conflicts:', error);
    return [];
  }
}

module.exports = {
  syncPlatform,
  syncAllPlatforms,
  getSyncStatus,
  getConflicts,
  PLATFORMS
};
