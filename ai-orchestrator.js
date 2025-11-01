/**
 * AI Orchestrator for Nadaki Excursions
 * Phase 6: AI-Powered Booking Assistant
 * 
 * This module coordinates all AI services:
 * - Language detection and translation
 * - Intent classification
 * - Boat recommendations
 * - Dynamic pricing
 * - Real-time availability checking
 * - Human agent escalation
 */

// NOTE: This module receives pool and openai instances from server.js
// to reuse existing connections and avoid duplicated resources
let pool = null;
let openai = null;

// Initialize function called from server.js
function initialize(dbPool, openaiClient) {
  pool = dbPool;
  openai = openaiClient;
}

// ============================================================================
// 1. LANGUAGE DETECTION SERVICE
// ============================================================================

/**
 * Detects the language of a message (Spanish or English)
 * Uses simple heuristics for fast detection
 */
async function detectLanguage(message) {
  // Spanish indicators
  const spanishWords = ['hola', 'qué', 'cómo', 'está', 'cuánto', 'cuándo', 'dónde', 'quiero', 'necesito', 'gracias'];
  const englishWords = ['hello', 'what', 'how', 'when', 'where', 'want', 'need', 'thanks', 'please'];
  
  const lowerMessage = message.toLowerCase();
  const spanishMatches = spanishWords.filter(word => lowerMessage.includes(word)).length;
  const englishMatches = englishWords.filter(word => lowerMessage.includes(word)).length;
  
  // Default to Spanish if ambiguous (primary market is Spanish-speaking)
  return spanishMatches >= englishMatches ? 'es' : 'en';
}

/**
 * REMOVED: Translation service (too slow - would exceed 2s target)
 * Instead, we use multilingual prompts that understand both Spanish and English
 */

// ============================================================================
// 2. SIMPLIFIED INTENT DETECTION (keyword-based, fast)
// ============================================================================

/**
 * Fast keyword-based intent detection (replaces slow OpenAI function calling)
 * Returns: { intent, extractedKeywords }
 */
function detectIntent(message) {
  const lowerMessage = message.toLowerCase();
  
  // Booking keywords
  const bookingKeywords = ['reservar', 'reserva', 'book', 'booking', 'agendar', 'confirmar'];
  // Availability keywords
  const availabilityKeywords = ['disponible', 'disponibilidad', 'available', 'availability', 'libre', 'free'];
  // Recommendation keywords
  const recommendKeywords = ['recomendar', 'recomendación', 'suggest', 'recommendation', 'mejor', 'best'];
  // Support keywords
  const supportKeywords = ['problema', 'issue', 'ayuda', 'help', 'queja', 'complaint', 'cancelar', 'cancel'];
  
  // Check for booking intent
  if (bookingKeywords.some(kw => lowerMessage.includes(kw))) {
    return { intent: 'booking', confidence: 80 };
  }
  
  // Check for availability
  if (availabilityKeywords.some(kw => lowerMessage.includes(kw))) {
    return { intent: 'availability_check', confidence: 75 };
  }
  
  // Check for recommendations
  if (recommendKeywords.some(kw => lowerMessage.includes(kw))) {
    return { intent: 'recommendation', confidence: 75 };
  }
  
  // Check for support
  if (supportKeywords.some(kw => lowerMessage.includes(kw))) {
    return { intent: 'support', confidence: 70 };
  }
  
  // Default to inquiry
  return { intent: 'inquiry', confidence: 60 };
}

// ============================================================================
// 3. BOAT RECOMMENDATION ENGINE
// ============================================================================

/**
 * Recommends boat types based on customer preferences
 */
async function recommendBoats(preferences) {
  const recommendations = [];
  
  const { groupSize, duration, preferences: customerPrefs = [], budget } = preferences;
  
  // Define boat types with characteristics
  const boatTypes = [
    {
      name: 'Tour de medio día (4 horas)',
      capacity: '6-8 personas',
      duration: 'half-day',
      priceRange: '$800-$1200',
      features: ['snorkeling', 'coastal', 'family-friendly', 'quick'],
      score: 0
    },
    {
      name: 'Tour de día completo (8 horas)',
      capacity: '8-12 personas',
      duration: 'full-day',
      priceRange: '$1500-$2000',
      features: ['snorkeling', 'fishing', 'island-hopping', 'lunch-included', 'adventure'],
      score: 0
    },
    {
      name: 'Excursión de pesca',
      capacity: '4-6 personas',
      duration: 'half-day',
      priceRange: '$900-$1300',
      features: ['fishing', 'equipment-included', 'experienced-captain'],
      score: 0
    },
    {
      name: 'Tour privado VIP',
      capacity: '6-10 personas',
      duration: 'custom',
      priceRange: '$2000-$3000',
      features: ['private', 'luxury', 'customizable', 'premium-service'],
      score: 0
    }
  ];
  
  // Score each boat type
  boatTypes.forEach(boat => {
    // Match duration preference
    if (duration && boat.duration === duration) {
      boat.score += 30;
    }
    
    // Match group size
    if (groupSize) {
      const [min, max] = boat.capacity.split('-').map(s => parseInt(s));
      if (groupSize >= min && groupSize <= max) {
        boat.score += 25;
      }
    }
    
    // Match customer preferences (features)
    customerPrefs.forEach(pref => {
      if (boat.features.some(feature => feature.toLowerCase().includes(pref.toLowerCase()) || 
                                        pref.toLowerCase().includes(feature))) {
        boat.score += 15;
      }
    });
    
    // Match budget
    if (budget) {
      const budgetLower = budget.toLowerCase();
      if ((budgetLower.includes('low') || budgetLower.includes('eco') || budgetLower.includes('barato')) && 
          boat.priceRange.includes('$800')) {
        boat.score += 20;
      }
      if ((budgetLower.includes('premium') || budgetLower.includes('luxury') || budgetLower.includes('vip')) && 
          boat.priceRange.includes('$2000')) {
        boat.score += 20;
      }
    }
  });
  
  // Sort by score and return top 3
  return boatTypes
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(boat => ({
      name: boat.name,
      capacity: boat.capacity,
      priceRange: boat.priceRange,
      features: boat.features,
      score: boat.score
    }));
}

// ============================================================================
// 4. DYNAMIC PRICING CALCULATOR
// ============================================================================

/**
 * Calculates price based on boat type, duration, season, and group size
 */
function calculatePrice(boatType, durationHours, groupSize, date) {
  let basePrice = 0;
  
  // Base prices by boat type
  if (boatType.includes('medio día') || boatType.includes('half-day')) {
    basePrice = 1000;
  } else if (boatType.includes('día completo') || boatType.includes('full-day')) {
    basePrice = 1700;
  } else if (boatType.includes('pesca') || boatType.includes('fishing')) {
    basePrice = 1100;
  } else if (boatType.includes('VIP') || boatType.includes('privado') || boatType.includes('private')) {
    basePrice = 2500;
  } else {
    // Default pricing based on duration
    basePrice = durationHours >= 6 ? 1700 : 1000;
  }
  
  // Seasonal adjustments
  if (date) {
    const month = new Date(date).getMonth() + 1; // 1-12
    // High season (December-April): +15%
    if (month >= 12 || month <= 4) {
      basePrice = Math.floor(basePrice * 1.15);
    }
    // Mid season (May, November): normal
    // Low season (June-October): -10%
    if (month >= 6 && month <= 10) {
      basePrice = Math.floor(basePrice * 0.90);
    }
  }
  
  // Group size adjustments
  if (groupSize) {
    if (groupSize >= 10) {
      // Large group surcharge
      basePrice = Math.floor(basePrice * 1.10);
    } else if (groupSize <= 2) {
      // Small group minimum
      basePrice = Math.max(basePrice, 900);
    }
  }
  
  return basePrice;
}

// ============================================================================
// 5. AVAILABILITY CHECKER
// ============================================================================

/**
 * Checks if the requested date/time is available
 * Integrates with existing captain assignment logic
 */
async function checkAvailability(date, startTime, durationHours = 4) {
  try {
    // Get all available captains
    const captainsResult = await pool.query(
      "SELECT * FROM captains WHERE status = 'available'"
    );
    
    if (captainsResult.rows.length === 0) {
      return { available: false, reason: 'No captains available for that date' };
    }
    
    // Calculate end time
    const moment = require('moment');
    const endTime = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm')
      .add(durationHours, 'hours')
      .format('HH:mm');
    
    // Check each captain for conflicts
    let availableCaptains = 0;
    for (const captain of captainsResult.rows) {
      // Check availability blocks
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
      `, [captain.id, date, startTime, endTime]);
      
      if (availResult.rows.length > 0) continue; // Captain unavailable
      
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
      `, [captain.id, date, startTime, endTime]);
      
      if (conflictResult.rows.length === 0) {
        availableCaptains++;
      }
    }
    
    return {
      available: availableCaptains > 0,
      availableCaptains,
      reason: availableCaptains > 0 ? null : 'All captains are booked for that time'
    };
  } catch (error) {
    console.error('Availability check error:', error);
    return { available: true, reason: null }; // Default to available on error
  }
}

// ============================================================================
// 6. HUMAN ESCALATION HANDLER
// ============================================================================

/**
 * Escalates conversation to human agent
 */
async function escalateToHuman(sessionId, reason, customerInfo) {
  try {
    // Update AI context
    await pool.query(`
      UPDATE chat_ai_context 
      SET escalated_to_human = 1,
          escalation_reason = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $1
    `, [sessionId, reason]);
    
    // Update conversation status
    await pool.query(`
      UPDATE chat_conversations 
      SET status = 'escalated',
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $1
    `, [sessionId]);
    
    // Send notification to staff (WhatsApp via Twilio)
    const twilioSid = process.env.TWILIO_SID || '';
    const twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
    
    if (twilioSid && twilioToken && twilioSid.startsWith('AC')) {
      const twilio = require('twilio');
      const client = twilio(twilioSid, twilioToken);
      
      const staffMessage = `
🆘 *ESCALATION - Nadaki Excursions*
Session: ${sessionId}
Customer: ${customerInfo.name || 'Unknown'}
Phone: ${customerInfo.phone || 'N/A'}
Reason: ${reason}

Please respond ASAP via dashboard.
      `.trim();
      
      // Send to staff number (configure in environment)
      await client.messages.create({
        body: staffMessage,
        from: 'whatsapp:+14155238886',
        to: `whatsapp:+${process.env.STAFF_PHONE || '15555555555'}`
      });
    }
    
    console.log(`✅ Escalated session ${sessionId} to human. Reason: ${reason}`);
    return true;
  } catch (error) {
    console.error('Escalation error:', error);
    return false;
  }
}

// ============================================================================
// 7. UPSELL OPPORTUNITY DETECTOR
// ============================================================================

/**
 * Detects upsell opportunities based on conversation and booking data
 */
function detectUpsellOpportunities(intentData, customerPreferences) {
  const opportunities = [];
  
  const { groupSize, duration, preferences = [] } = customerPreferences;
  
  // Upgrade to full-day if half-day booked
  if (duration === 'half-day') {
    opportunities.push({
      type: 'duration_upgrade',
      suggestion: 'Upgrade to full-day tour for only $700 more - includes lunch and more islands!',
      value: 700
    });
  }
  
  // VIP upgrade if group size is suitable
  if (groupSize && groupSize >= 6 && groupSize <= 10) {
    opportunities.push({
      type: 'vip_upgrade',
      suggestion: 'Consider our VIP private tour for exclusive service and customized itinerary',
      value: 1000
    });
  }
  
  // Add-ons based on preferences
  if (preferences.some(p => p.toLowerCase().includes('snorkel'))) {
    opportunities.push({
      type: 'addon',
      suggestion: 'Premium snorkeling gear package with underwater camera ($50)',
      value: 50
    });
  }
  
  if (preferences.some(p => p.toLowerCase().includes('fish'))) {
    opportunities.push({
      type: 'addon',
      suggestion: 'Professional fishing equipment upgrade ($75)',
      value: 75
    });
  }
  
  // Photo package
  opportunities.push({
    type: 'addon',
    suggestion: 'Professional photography package - capture your memories! ($100)',
    value: 100
  });
  
  return opportunities.slice(0, 2); // Return top 2 opportunities
}

// ============================================================================
// 8. MAIN ORCHESTRATOR
// ============================================================================

/**
 * SIMPLIFIED orchestration function - optimized for sub-2s response
 * Only fast operations: language detection, intent detection, DB update
 * No OpenAI calls here - that happens in server.js
 */
async function processAIChat(sessionId, message) {
  const startTime = Date.now();
  
  try {
    // Fast local operations only
    const detectedLanguage = detectLanguage(message);
    const intentData = detectIntent(message);
    
    console.log(`🤖 Quick analysis: ${detectedLanguage} / ${intentData.intent} (${intentData.confidence}%)`);
    
    // Simple context persistence (upsert)
    const contextId = `context_${sessionId}`;
    await pool.query(`
      INSERT INTO chat_ai_context (
        id, session_id, detected_language, detected_intent, 
        intent_confidence, last_interaction_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (session_id) 
      DO UPDATE SET
        detected_language = $3,
        detected_intent = $4,
        intent_confidence = $5,
        last_interaction_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [contextId, sessionId, detectedLanguage, intentData.intent, intentData.confidence]);
    
    const processingTime = Date.now() - startTime;
    console.log(`⏱️ Orchestrator processing: ${processingTime}ms`);
    
    return {
      success: true,
      detectedLanguage,
      intent: intentData.intent,
      confidence: intentData.confidence,
      processingTime
    };
    
  } catch (error) {
    console.error('AI Orchestrator error:', error);
    return {
      success: false,
      error: error.message,
      detectedLanguage: 'es',
      intent: 'inquiry',
      confidence: 50,
      processingTime: Date.now() - startTime
    };
  }
}

module.exports = {
  initialize,
  processAIChat,
  detectLanguage,
  detectIntent,
  recommendBoats,
  calculatePrice,
  checkAvailability,
  escalateToHuman,
  detectUpsellOpportunities
};
