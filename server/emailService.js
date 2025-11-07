const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { nanoid } = require('nanoid');
const { convert } = require('html-to-text');

class EmailService {
  constructor(pool) {
    this.pool = pool;
    this.imap = null;
    this.isConnected = false;
  }

  // Clean email content - convert HTML to readable text and remove tracking links
  cleanEmailContent(text, html) {
    let content = '';

    // Debug logging
    console.log('🧹 cleanEmailContent called with:', {
      hasText: !!text,
      textLength: text ? text.length : 0,
      textPreview: text ? text.substring(0, 100) : 'none',
      hasHtml: !!html,
      htmlLength: html ? html.length : 0
    });

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

    if (!content || !content.trim()) {
      console.log('⚠️ cleanEmailContent returning empty content');
      return '';
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

    console.log('✅ cleanEmailContent result:', {
      finalLength: content.length,
      finalPreview: content.substring(0, 100)
    });

    return content;
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

      // Clean email content - convert HTML to readable text and remove tracking
      let cleanContent = this.cleanEmailContent(mail.text, mail.html);
      
      // Fallback: If content is empty, use the subject as content
      if (!cleanContent || cleanContent.trim().length === 0) {
        console.log('⚠️ Email content is empty, using subject as fallback');
        cleanContent = `Asunto: ${mail.subject || '(sin asunto)'}`;
      }
      
      // Debug logging to verify cleaning is working
      const hasAssets = cleanContent.includes('assets.getmyboat.com') || cleanContent.includes('assets.');
      const hasBrackets = cleanContent.includes('[https://');
      if (hasAssets || hasBrackets) {
        console.log('⚠️ Email cleaning may have failed:', {
          from: customerEmail,
          hasAssets,
          hasBrackets,
          contentPreview: cleanContent.substring(0, 200)
        });
      }

      // Extract unique message identifier (message-id header or date + subject)
      const messageDate = mail.date ? new Date(mail.date) : new Date();
      const messageContent = cleanContent;

      // Check if this exact message already exists (prevent duplicates)
      const duplicateCheck = await this.pool.query(
        `SELECT id FROM platform_messages 
         WHERE sender_contact = $1 
         AND message_content = $2
         AND DATE(received_at) = DATE($3)
         LIMIT 1`,
        [customerEmail, messageContent, messageDate]
      );

      if (duplicateCheck.rows.length > 0) {
        console.log(`⏭️  Email already processed (duplicate): ${customerEmail} - ${mail.subject}`);
        return null; // Skip duplicate
      }

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
          id, thread_id, platform, direction, message_content, sender_name, sender_contact,
          status, received_at, created_at
        ) VALUES ($1, $2, $3, 'inbound', $4, $5, $6, 'new', NOW(), NOW())`,
        [
          messageId,
          threadId,
          platform,
          cleanContent,
          customerName,
          customerEmail
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

        // Get the most recent 50 emails (both read and unread)
        const totalMessages = box.messages.total;
        if (totalMessages === 0) {
          console.log('📭 No emails in inbox');
          return resolve({ synced: 0 });
        }

        const startSeq = Math.max(1, totalMessages - 49); // Last 50 emails
        const endSeq = totalMessages;
        const searchRange = `${startSeq}:${endSeq}`;

        console.log(`🔍 Checking last ${endSeq - startSeq + 1} emails in inbox`);

        // Fetch recent emails (read or unread)
        const fetch = this.imap.seq.fetch(searchRange, {
          bodies: '',
          markSeen: false // Don't mark as read
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
