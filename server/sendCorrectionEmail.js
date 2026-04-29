'use strict';

/**
 * SCRIPT HISTÓRICO — YA ENVIADO EL 2026-04-27
 * 
 * Este script fue ejecutado una vez para enviar la corrección de precios al cliente.
 * El email incorrecto original decía 4h / $560, cuando la reserva correcta es 3h / $420.
 * 
 * Estado actual de la reserva book_nk2efafe2d (NK-2EFAFE2D / Estefany Torres):
 *   - duration_hours: 3
 *   - start_time: 13:00 (1:00 PM)
 *   - end_time:   16:00 (4:00 PM)  [calculado: 13:00 + 3h]
 *   - total_amount: $420.00
 *   - pricing_expected: $420.00
 *   - pricing_delta: $0.00
 *   - pricing_integrity_status: valid
 * 
 * NO volver a ejecutar este script. El correo de corrección fue enviado por sendTimeCorrection.js.
 */

const nodemailer = require('nodemailer');
const { Pool } = require('pg');

async function main() {
  const emailUser = process.env.EMAIL_USER || '';
  const emailPass = process.env.EMAIL_PASSWORD || '';

  if (!emailUser || !emailPass) {
    console.error('[EMAIL] EMAIL_USER or EMAIL_PASSWORD not configured');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bk = await pool.query(
    'SELECT id,customer_name,customer_email,duration_hours,total_amount,balance_pending,payment_status FROM bookings WHERE id=$1',
    ['book_nk2efafe2d']
  );
  if (!bk.rows.length) {
    console.error('[EMAIL] Booking book_nk2efafe2d not found');
    await pool.end();
    process.exit(1);
  }
  const booking = bk.rows[0];

  // Guard: este script histórico ya no debe re-enviarse.
  // La reserva está correctamente fijada en $420 (3h). Si alguien lo ejecuta,
  // que quede claro el estado actual.
  console.log('[INFO] Estado actual de la reserva:');
  console.log('  customer_name:', booking.customer_name);
  console.log('  duration_hours:', booking.duration_hours, '(correcto: 3)');
  console.log('  total_amount: $' + booking.total_amount, '(correcto: $420)');
  console.log('  payment_status:', booking.payment_status);
  console.log('');
  console.log('[AVISO] Este script histórico NO debe re-ejecutarse.');
  console.log('  El correo de corrección (3h / $420 / 1:00 PM - 4:00 PM) ya fue enviado el 2026-04-27 por sendTimeCorrection.js');
  console.log('  Si necesitas reenviar la notificación, usa sendTimeCorrection.js.');
  await pool.end();
  process.exit(0);
}

main().catch(e => {
  console.error('[EMAIL FATAL]', e.message);
  process.exit(1);
});
