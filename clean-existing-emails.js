// Script to clean existing emails in the database using cleanEmailContent()
const { Pool } = require('pg');
const { convert } = require('html-to-text');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Clean email content - convert HTML to readable text and remove tracking links
function cleanEmailContent(text, html) {
  let content = '';

  // Prefer plain text if available
  if (text && text.trim()) {
    content = text;
  } else if (html) {
    // Convert HTML to clean text
    content = convert(html, {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } }, // Remove URLs
        { selector: 'img', format: 'skip' }, // Skip images
        { selector: 'style', format: 'skip' }, // Skip style tags
        { selector: 'script', format: 'skip' } // Skip scripts
      ]
    });
  }

  // Remove tracking URLs and long parameter strings (both http and https)
  content = content
    .replace(/<https?:\/\/[^>]+>/g, '') // Remove <http://...> and <https://...> tracking links
    .replace(/\[https?:\/\/[^\]]+\]/g, '') // Remove [https://...] style asset links
    .replace(/https?:\/\/click\.[^\s]+/g, '') // Remove click tracking links (http/https)
    .replace(/https?:\/\/[^\s]*track[^\s]*/gi, '') // Remove tracking URLs containing 'track'
    .replace(/https?:\/\/[^\s]*redirect[^\s]*/gi, '') // Remove redirect URLs
    .replace(/https?:\/\/assets\.[^\s]+/g, '') // Remove asset URLs
    .replace(/[?&]utm_[^&\s]+/g, '') // Remove UTM parameters only (preserve other params)
    .replace(/[?&]trk=[^&\s]+/g, '') // Remove LinkedIn tracking only
    .replace(/[?&]ref=[^&\s]+/g, '') // Remove ref tracking only
    .replace(/[?&]p=[a-zA-Z0-9=]+/g, '') // Remove generic tracking parameters only
    .replace(/\[image:[^\]]*\]/g, '') // Remove [image: ...] placeholders
    .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
    .replace(/[ \t]{2,}/g, ' ') // Normalize multiple spaces/tabs only (preserve line breaks)
    .trim();

  return content;
}

async function cleanExistingEmails() {
  try {
    console.log('🧹 Starting email cleaning process...');

    // Get all messages that need cleaning
    const result = await pool.query(`
      SELECT id, message_content
      FROM platform_messages 
      WHERE message_content LIKE '%http%' 
         OR message_content LIKE '%[https://%' 
         OR message_content LIKE '%<http%'
      ORDER BY created_at DESC
    `);

    console.log(`📧 Found ${result.rows.length} messages to clean`);

    let cleanedCount = 0;
    for (const row of result.rows) {
      const originalContent = row.message_content;
      
      // Clean the content (treat as plain text since it's already in DB)
      const cleanedContent = cleanEmailContent(originalContent, null);

      // Only update if content actually changed
      if (cleanedContent !== originalContent) {
        await pool.query(
          'UPDATE platform_messages SET message_content = $1 WHERE id = $2',
          [cleanedContent, row.id]
        );
        cleanedCount++;
        console.log(`✅ Cleaned message ${row.id}`);
      }
    }

    console.log(`\n✨ Cleaning complete! Cleaned ${cleanedCount} out of ${result.rows.length} messages`);
    
  } catch (error) {
    console.error('❌ Error cleaning emails:', error);
  } finally {
    await pool.end();
  }
}

// Run the cleanup
cleanExistingEmails();
