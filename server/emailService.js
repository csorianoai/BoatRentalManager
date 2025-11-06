const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { nanoid } = require('nanoid');

class EmailService {
  constructor(pool) {
    this.pool = pool;
    this.imap = null;
    this.isConnected = false;
  }

  // Initialize IMAP connection
  connect() {
    return new Promise((resolve, reject) => {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('⚠️ Email credentials not configured. Skipping email sync.');
        return resolve(false);
      }

      const imapHost = process.env.EMAIL_IMAP_HOST || 'outlook.office365.com';
      const isGmail = imapHost.includes('gmail.com');

      // Gmail-specific configuration
      const imapConfig = {
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        host: imapHost,
        port: parseInt(process.env.EMAIL_IMAP_PORT) || 993,
        tls: true,
        authTimeout: 30000
      };

      // Gmail requires stricter TLS, Outlook needs relaxed
      if (isGmail) {
        imapConfig.tlsOptions = { 
          servername: imapHost,
          rejectUnauthorized: true
        };
      } else {
        imapConfig.tlsOptions = { 
          rejectUnauthorized: false 
        };
      }

      this.imap = new Imap(imapConfig);

      this.imap.once('ready', () => {
        console.log('✅ Email IMAP connection established');
        this.isConnected = true;
        resolve(true);
      });

      this.imap.once('error', (err) => {
        console.error('❌ IMAP connection error:', err.message);
        this.isConnected = false;
        reject(err);
      });

      this.imap.once('end', () => {
        console.log('📧 IMAP connection ended');
        this.isConnected = false;
      });

      this.imap.connect();
    });
  }

  // Disconnect from IMAP
  disconnect() {
    if (this.imap && this.isConnected) {
      this.imap.end();
    }
  }

  // Detect platform from email sender or subject
  detectPlatform(from, subject) {
    const email = from.toLowerCase();
    const subj = subject.toLowerCase();
    
    const platformPatterns = [
      { name: 'airbnb', patterns: ['airbnb.com', 'airbnb'] },
      { name: 'getmyboat', patterns: ['getmyboat.com', 'get my boat'] },
      { name: 'boatsetter', patterns: ['boatsetter.com', 'boat setter'] },
      { name: 'viator', patterns: ['viator.com', 'tripadvisor', 'viator'] },
      { name: 'expedia', patterns: ['expedia.com', 'expedia'] },
      { name: 'tripadvisor', patterns: ['tripadvisor.com'] },
      { name: 'groupon', patterns: ['groupon.com', 'groupon'] },
      { name: 'booking.com', patterns: ['booking.com', 'booking'] },
      { name: 'fareharbor', patterns: ['fareharbor.com', 'fare harbor'] },
      { name: 'bokun', patterns: ['bokun.io', 'bokun'] },
      { name: 'rezdy', patterns: ['rezdy.com', 'rezdy'] },
      { name: 'peek', patterns: ['peek.com', 'peek'] },
      { name: 'xola', patterns: ['xola.com', 'xola'] }
    ];

    for (const platform of platformPatterns) {
      for (const pattern of platform.patterns) {
        if (email.includes(pattern) || subj.includes(pattern)) {
          return platform.name;
        }
      }
    }

    return 'email'; // Default to generic email platform
  }

  // Extract customer info from email
  extractCustomerInfo(from, text, html) {
    // Try to extract email
    const emailMatch = from.match(/<?([^<>]+@[^<>]+)>?/);
    const customerEmail = emailMatch ? emailMatch[1] : from;
    
    // Try to extract name from "Name <email>" format
    const nameMatch = from.match(/^([^<]+)\s*</);
    let customerName = nameMatch ? nameMatch[1].trim() : customerEmail.split('@')[0];
    
    // Try to extract phone from text
    const phonePatterns = [
      /\b(\+?1?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/,
      /\b(\+?\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4})\b/
    ];
    
    let customerPhone = null;
    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match) {
        customerPhone = match[1];
        break;
      }
    }

    return {
      customerName,
      customerEmail,
      customerPhone
    };
  }

  // Parse email and create message thread
  async parseAndIngestEmail(mail) {
    try {
      const platform = this.detectPlatform(mail.from.text, mail.subject);
      const { customerName, customerEmail, customerPhone } = this.extractCustomerInfo(
        mail.from.text,
        mail.text || '',
        mail.html || ''
      );

      // Check if thread exists for this email
      let threadResult = await this.pool.query(
        `SELECT id FROM message_threads 
         WHERE customer_email = $1 AND platform = $2
         ORDER BY last_message_at DESC LIMIT 1`,
        [customerEmail, platform]
      );

      let threadId;
      
      if (threadResult.rows.length > 0) {
        // Use existing thread
        threadId = threadResult.rows[0].id;
        
        // Update thread
        await this.pool.query(
          `UPDATE message_threads SET
            last_message_at = NOW(),
            unread_count = unread_count + 1,
            updated_at = NOW()
          WHERE id = $1`,
          [threadId]
        );
      } else {
        // Create new thread
        threadId = `thread_${nanoid(10)}`;
        await this.pool.query(
          `INSERT INTO message_threads (
            id, platform, customer_name, customer_email, customer_phone,
            subject, status, unread_count, last_message_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'open', 1, NOW(), NOW(), NOW())`,
          [threadId, platform, customerName, customerEmail, customerPhone, mail.subject]
        );
      }

      // Create the message
      const messageId = `msg_${nanoid(10)}`;
      await this.pool.query(
        `INSERT INTO platform_messages (
          id, thread_id, direction, message_text, sender_name, sender_email,
          platform_message_id, raw_data, created_at
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW())`,
        [
          messageId,
          threadId,
          mail.text || mail.html || '',
          customerName,
          customerEmail,
          mail.messageId,
          JSON.stringify({
            subject: mail.subject,
            from: mail.from.text,
            to: mail.to?.text,
            date: mail.date,
            html: mail.html ? mail.html.substring(0, 1000) : null // Store first 1000 chars
          })
        ]
      );

      console.log(`✅ Ingested email from ${customerEmail} (${platform}) into thread ${threadId}`);
      return { threadId, messageId, platform };

    } catch (error) {
      console.error('Error parsing email:', error);
      throw error;
    }
  }

  // Sync unread emails
  async syncUnreadEmails() {
    return new Promise(async (resolve, reject) => {
      if (!this.isConnected) {
        try {
          const connected = await this.connect();
          if (!connected) {
            // Email credentials not configured
            return resolve({ synced: 0 });
          }
        } catch (err) {
          return reject(err);
        }
      }

      if (!this.imap) {
        return resolve({ synced: 0 });
      }

      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.error('Error opening inbox:', err);
          return reject(err);
        }

        // Search for unseen emails
        this.imap.search(['UNSEEN'], async (err, results) => {
          if (err) {
            console.error('Error searching emails:', err);
            return reject(err);
          }

          if (!results || results.length === 0) {
            console.log('📭 No new emails to sync');
            return resolve({ synced: 0 });
          }

          console.log(`📬 Found ${results.length} unread email(s)`);
          
          const fetch = this.imap.fetch(results, {
            bodies: '',
            markSeen: false // Don't mark as read yet
          });

          const processedEmails = [];

          fetch.on('message', (msg, seqno) => {
            msg.on('body', (stream, info) => {
              simpleParser(stream, async (err, mail) => {
                if (err) {
                  console.error('Error parsing email:', err);
                  return;
                }

                try {
                  const result = await this.parseAndIngestEmail(mail);
                  processedEmails.push(result);
                  
                  // Mark as seen after successful processing
                  this.imap.addFlags(seqno, ['\\Seen'], (err) => {
                    if (err) console.error('Error marking email as seen:', err);
                  });
                } catch (error) {
                  console.error('Error ingesting email:', error);
                }
              });
            });
          });

          fetch.once('error', (err) => {
            console.error('Fetch error:', err);
            reject(err);
          });

          fetch.once('end', () => {
            console.log(`✅ Email sync completed: ${processedEmails.length} emails processed`);
            resolve({ synced: processedEmails.length, emails: processedEmails });
          });
        });
      });
    });
  }

  // Manual email ingestion (for testing or manual entry)
  async manualIngest(emailData) {
    const threadId = emailData.threadId || `thread_${nanoid(10)}`;
    const messageId = `msg_${nanoid(10)}`;

    // Create or update thread
    if (!emailData.threadId) {
      await this.pool.query(
        `INSERT INTO message_threads (
          id, platform, customer_name, customer_email, customer_phone,
          subject, status, unread_count, last_message_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'open', 1, NOW(), NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          last_message_at = NOW(),
          unread_count = message_threads.unread_count + 1,
          updated_at = NOW()`,
        [
          threadId,
          emailData.platform,
          emailData.customerName,
          emailData.customerEmail,
          emailData.customerPhone || null,
          emailData.subject
        ]
      );
    }

    // Create message
    await this.pool.query(
      `INSERT INTO platform_messages (
        id, thread_id, direction, message_text, sender_name, sender_email, created_at
      ) VALUES ($1, $2, 'inbound', $3, $4, $5, NOW())`,
      [messageId, threadId, emailData.messageText, emailData.customerName, emailData.customerEmail]
    );

    return { threadId, messageId };
  }
}

module.exports = EmailService;
