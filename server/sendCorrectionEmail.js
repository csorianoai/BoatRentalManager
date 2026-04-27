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

  // Verify booking was corrected before sending
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bk = await pool.query(
    'SELECT id,customer_name,customer_email,duration_hours,total_amount,balance_pending,payment_status FROM bookings WHERE id=$1',
    ['book_nk2efafe2d']
  );
  if (!bk.rows.length) {
    console.error('[EMAIL] Booking book_nk2efafe2d not found — email NOT sent');
    await pool.end();
    process.exit(1);
  }
  const booking = bk.rows[0];
  if (parseFloat(booking.total_amount) !== 560) {
    console.error('[EMAIL] Booking total_amount is not $560 — correction may not have been applied — email NOT sent');
    console.error('  total_amount:', booking.total_amount);
    await pool.end();
    process.exit(1);
  }
  console.log('[EMAIL] Booking correction verified: $' + booking.total_amount + ' | balance: $' + booking.balance_pending);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: emailUser, pass: emailPass },
  });

  const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#0066cc;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
  <h2 style="color:#fff;margin:0;">Nadaki Excursions</h2>
</div>
<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
  <p>Hello <strong>Estefany</strong>,</p>
  <p>We noticed a pricing mismatch on your booking <strong>NK-2EFAFE2D</strong> and have corrected it.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Boat</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">40' Sea Ray Yacht | Miami Charter</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Sunday, May 3, 2026</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Time</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">1:00 PM &ndash; 5:00 PM</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0;">Duration</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">4 hours</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-weight:600;">Guests</td><td style="padding:8px 12px;">4</td></tr>
  </table>
  <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;padding:12px 16px;margin:16px 0;">
    <strong>Pricing Correction:</strong> The 3-hour charter rate is $420, but your reservation is for 4 hours. The correct 4-hour charter total is <strong>$560</strong>.
  </div>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr style="background:#D1FAE5;"><td style="padding:8px 12px;font-weight:600;">Correct total</td><td style="padding:8px 12px;font-weight:700;color:#065F46;">$560.00</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600;">Amount paid</td><td style="padding:8px 12px;">$0.00</td></tr>
    <tr style="background:#FEE2E2;"><td style="padding:8px 12px;font-weight:600;">Balance due</td><td style="padding:8px 12px;font-weight:700;color:#dc2626;">$560.00</td></tr>
  </table>
  <p>We apologize for the confusion and appreciate your understanding.</p>
  <p>If you have any questions, please reply to this email or call us at <strong>+1 (786) 327-0078</strong>.</p>
  <p style="margin-top:24px;">Thank you,<br><strong>Nadaki Excursions</strong></p>
</div>
</body>
</html>`;

  const textBody = `Hello Estefany,

We noticed a pricing mismatch on your booking NK-2EFAFE2D.

Your reservation is for:
  Boat: 40' Sea Ray Yacht | Miami Charter
  Date: Sunday, May 3, 2026
  Time: 1:00 PM - 5:00 PM
  Duration: 4 hours
  Guests: 4

The 3-hour charter price is $420, but your booking is for 4 hours.
The correct 4-hour charter total is $560.

We have updated your booking to reflect the correct total:
  Correct total: $560.00
  Amount paid: $0.00
  Balance due: $560.00

We apologize for the confusion and appreciate your understanding.

If you have any questions, reply to this email or call us at +1 (786) 327-0078.

Thank you,
Nadaki Excursions`;

  const mailOptions = {
    from: `Nadaki Excursions <${emailUser}>`,
    to: 'estefanytorres25@gmail.com',
    subject: 'Correction to Your Nadaki Excursions Booking NK-2EFAFE2D',
    text: textBody,
    html: htmlBody,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('[EMAIL SENT] ✓');
  console.log('  To:', mailOptions.to);
  console.log('  Subject:', mailOptions.subject);
  console.log('  MessageId:', info.messageId);
  console.log('  Response:', info.response);

  // Log email sent in booking internal_notes
  await pool.query(
    `UPDATE bookings SET internal_notes = internal_notes || $1, updated_at = NOW() WHERE id = 'book_nk2efafe2d'`,
    ['\n[EMAIL SENT 2026-04-27] Correction email sent to estefanytorres25@gmail.com | MessageId: ' + info.messageId]
  );
  console.log('[EMAIL] Status logged to booking internal_notes');

  await pool.end();
}

main().catch(e => {
  console.error('[EMAIL FATAL]', e.message);
  process.exit(1);
});
