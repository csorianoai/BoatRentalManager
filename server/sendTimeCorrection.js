'use strict';

const nodemailer = require('nodemailer');
const { Pool } = require('pg');

async function main() {
  const emailUser = process.env.EMAIL_USER || '';
  const emailPass = process.env.EMAIL_PASSWORD || '';

  if (!emailUser || !emailPass) {
    console.error('[EMAIL] EMAIL_USER or EMAIL_PASSWORD not configured');
    process.exit(1);
  }

  // Verify booking
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bk = await pool.query(
    'SELECT id,customer_name,customer_email,customer_phone,duration_hours,total_amount,balance_pending,start_time,booking_date,num_guests,boat_type FROM bookings WHERE id=$1',
    ['book_nk2efafe2d']
  );
  if (!bk.rows.length) {
    console.error('[EMAIL] Booking book_nk2efafe2d not found');
    await pool.end();
    process.exit(1);
  }
  const booking = bk.rows[0];
  console.log('[EMAIL] Booking verified:', {
    duration_hours: booking.duration_hours,
    total_amount: booking.total_amount,
    start_time: booking.start_time,
  });

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: emailUser, pass: emailPass },
  });

  // ── EMAIL 1: Customer (Estefany) ───────────────────────────────────────────
  const customerHtml = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#0066cc;padding:24px 20px;border-radius:8px 8px 0 0;text-align:center;">
  <h2 style="color:#fff;margin:0;letter-spacing:1px;">Nadaki Excursions</h2>
  <p style="color:#cde;margin:4px 0 0;">Miami Yacht Charters</p>
</div>
<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:28px 24px;">
  <p style="font-size:16px;">Hello <strong>Estefany</strong>,</p>
  <p>We sincerely apologize for any confusion regarding the time of your upcoming charter. We want to make sure you have the correct schedule clearly confirmed.</p>

  <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;padding:14px 18px;margin:20px 0;">
    <strong>Time Correction:</strong><br>
    The correct charter time is <strong>1:00 PM &ndash; 4:00 PM (3 hours)</strong>, not 1:00 PM &ndash; 5:00 PM as previously shown.<br>
    We apologize for any inconvenience this may have caused.
  </div>

  <p style="font-weight:600;margin:20px 0 8px;">Your Confirmed Booking Details:</p>
  <table style="width:100%;border-collapse:collapse;font-size:15px;">
    <tr style="background:#f8fafc;"><td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;width:40%;">Booking Code</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0066cc;">NK-2EFAFE2D</td></tr>
    <tr><td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Boat</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">40' Sea Ray Yacht | Miami Charter</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Date</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Sunday, May 3, 2026</td></tr>
    <tr><td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Time</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#065F46;">1:00 PM &ndash; 4:00 PM (3 hours)</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Guests</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">4</td></tr>
    <tr><td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Total</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;">$420.00</td></tr>
    <tr style="background:#FEE2E2;"><td style="padding:10px 12px;font-weight:600;">Balance Due</td><td style="padding:10px 12px;font-weight:700;color:#dc2626;">$420.00</td></tr>
  </table>

  <p style="margin-top:24px;">We look forward to welcoming you aboard and ensuring you have an amazing experience on the water. If you have any questions or concerns, please don't hesitate to reach out.</p>

  <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:14px 18px;margin:20px 0;">
    <strong>Contact Us:</strong><br>
    Phone: <a href="tel:+17863270078" style="color:#0066cc;">+1 (786) 327-0078</a><br>
    Email: <a href="mailto:${emailUser}" style="color:#0066cc;">${emailUser}</a>
  </div>

  <p style="color:#666;font-size:13px;margin-top:8px;">Please save this email as your updated booking confirmation.</p>
  <p style="margin-top:20px;">Warm regards,<br><strong>Nadaki Excursions Team</strong></p>
</div>
<p style="text-align:center;color:#aaa;font-size:12px;margin-top:16px;">Nadaki Excursions &bull; Miami, FL &bull; nadakiexcursions.com</p>
</body>
</html>`;

  const customerText = `Hello Estefany,

We sincerely apologize for any confusion regarding the time of your upcoming charter.

TIME CORRECTION:
The correct charter time is 1:00 PM - 4:00 PM (3 hours), NOT 1:00 PM - 5:00 PM as previously shown.

YOUR CONFIRMED BOOKING DETAILS:
  Booking Code: NK-2EFAFE2D
  Boat: 40' Sea Ray Yacht | Miami Charter
  Date: Sunday, May 3, 2026
  Time: 1:00 PM - 4:00 PM (3 hours)  <-- CORRECTED
  Guests: 4
  Total: $420.00
  Balance Due: $420.00

We look forward to welcoming you aboard!

Contact us:
  Phone: +1 (786) 327-0078
  Email: ${emailUser}

Warm regards,
Nadaki Excursions Team`;

  const mail1 = await transporter.sendMail({
    from: `Nadaki Excursions <${emailUser}>`,
    to: 'estefanytorres25@gmail.com',
    subject: 'Important: Time Correction for Your Charter NK-2EFAFE2D – May 3, 2026',
    text: customerText,
    html: customerHtml,
  });
  console.log('[EMAIL 1 - CUSTOMER] SENT ✓');
  console.log('  To: estefanytorres25@gmail.com');
  console.log('  MessageId:', mail1.messageId);

  // ── EMAIL 2: Internal team confirmation ────────────────────────────────────
  const internalHtml = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#1e293b;padding:18px 20px;border-radius:8px 8px 0 0;">
  <h3 style="color:#fff;margin:0;">Nadaki Excursions &mdash; Internal Booking Correction</h3>
</div>
<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
  <p>A correction email has been sent to the customer for booking <strong>NK-2EFAFE2D</strong>.</p>

  <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;padding:12px 16px;margin:16px 0;">
    <strong>Correction Made:</strong> End time updated from 5:00 PM to 4:00 PM. Booking duration is 3 hours (1:00 PM &ndash; 4:00 PM). Price $420 is correct for the 3-hour package.
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Booking ID</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">book_nk2efafe2d (NK-2EFAFE2D)</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Customer</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Estefany Torres &lt;estefanytorres25@gmail.com&gt;</td></tr>
    <tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">7328532187</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Boat</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">40' Sea Ray Yacht | Miami Charter</td></tr>
    <tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Sunday, May 3, 2026</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Time (corrected)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#065F46;">1:00 PM &ndash; 4:00 PM (3h)</td></tr>
    <tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Guests</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">4</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Total</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;">$420.00</td></tr>
    <tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Balance Due</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:700;">$420.00</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;">Customer Notified</td><td style="padding:8px 12px;color:#065F46;font-weight:700;">Yes — ${new Date().toISOString()}</td></tr>
  </table>

  <p style="margin-top:20px;color:#555;font-size:13px;">This is an automated internal notification from the Nadaki management system.</p>
</div>
</body>
</html>`;

  const mail2 = await transporter.sendMail({
    from: `Nadaki System <${emailUser}>`,
    to: emailUser,
    subject: '[INTERNAL] Booking Correction Sent – NK-2EFAFE2D | Estefany Torres | May 3',
    html: internalHtml,
    text: `INTERNAL NOTIFICATION\n\nCorrection email sent to customer for booking NK-2EFAFE2D.\n\nCustomer: Estefany Torres <estefanytorres25@gmail.com>\nPhone: 7328532187\nDate: Sunday, May 3, 2026\nTime (corrected): 1:00 PM - 4:00 PM (3 hours)\nTotal: $420.00\nBalance Due: $420.00\nCustomer notified: ${new Date().toISOString()}\n`,
  });
  console.log('[EMAIL 2 - INTERNAL] SENT ✓');
  console.log('  To:', emailUser);
  console.log('  MessageId:', mail2.messageId);

  // Log both emails in booking internal_notes
  await pool.query(
    `UPDATE bookings SET internal_notes = internal_notes || $1, updated_at=NOW() WHERE id='book_nk2efafe2d'`,
    [`\n[EMAILS SENT 2026-04-27] Time correction email sent to estefanytorres25@gmail.com (msgId:${mail1.messageId}) | Internal notification sent to ${emailUser} (msgId:${mail2.messageId})`]
  );
  console.log('[EMAIL] Both message IDs logged to booking internal_notes');

  await pool.end();
}

main().catch(e => {
  console.error('[EMAIL FATAL]', e.message);
  process.exit(1);
});
