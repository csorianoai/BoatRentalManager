const moment = require('moment');

/**
 * Service for analyzing customer inquiry messages to extract booking intent
 * Detects dates, party size, boat preferences, and booking requirements
 */
class MessageAnalysisService {
  
  /**
   * Parse customer inquiry to extract booking details
   * @param {string} messageContent - The customer's message
   * @returns {Object} Parsed inquiry with dates, people count, preferences
   */
  parseCustomerInquiry(messageContent) {
    if (!messageContent || typeof messageContent !== 'string') {
      return {
        dates: [],
        peopleCount: null,
        boatType: null,
        duration: null,
        preferences: [],
        confidence: 0
      };
    }

    const text = messageContent.toLowerCase();
    
    return {
      dates: this.extractDates(text),
      peopleCount: this.extractPeopleCount(text),
      boatType: this.extractBoatType(text),
      duration: this.extractDuration(text),
      preferences: this.extractPreferences(text),
      confidence: this.calculateConfidence(text)
    };
  }

  /**
   * Extract dates from message text
   * Supports multiple date formats and relative dates
   */
  extractDates(text) {
    const dates = [];
    
    // Common date patterns
    const patterns = [
      // MM/DD/YYYY or DD/MM/YYYY
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g,
      // Month DD, YYYY or DD Month YYYY
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{2,4})?/gi,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{2,4})?/gi,
      // Relative dates
      /(tomorrow|mañana)/gi,
      /(next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))/gi,
      /(próximo\s+(lunes|martes|miércoles|jueves|viernes|sábado|domingo))/gi,
      // "this weekend", "este fin de semana"
      /(this\s+weekend|este\s+fin\s+de\s+semana)/gi
    ];

    patterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const dateStr = match[0];
        const parsed = this.parseRelativeDate(dateStr);
        if (parsed && moment(parsed).isValid()) {
          dates.push(moment(parsed).format('YYYY-MM-DD'));
        }
      }
    });

    // Remove duplicates
    return [...new Set(dates)];
  }

  /**
   * Parse relative date strings like "tomorrow", "next friday"
   */
  parseRelativeDate(dateStr) {
    const lower = dateStr.toLowerCase().trim();
    const now = moment();

    // Tomorrow
    if (lower.includes('tomorrow') || lower.includes('mañana')) {
      return now.add(1, 'days').format('YYYY-MM-DD');
    }

    // This weekend (Saturday)
    if (lower.includes('weekend') || lower.includes('fin de semana')) {
      const saturday = now.clone().day(6); // 6 = Saturday
      if (now.day() > 6) saturday.add(1, 'week');
      return saturday.format('YYYY-MM-DD');
    }

    // Next [day of week]
    const dayMatch = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    const diaMatch = lower.match(/próximo\s+(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/);
    
    if (dayMatch || diaMatch) {
      const days = {
        monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
        lunes: 1, martes: 2, miércoles: 3, jueves: 4, viernes: 5, sábado: 6, domingo: 0
      };
      const day = dayMatch ? dayMatch[1] : diaMatch[1];
      const targetDay = days[day];
      const nextDate = now.clone().day(targetDay + 7); // Next week
      return nextDate.format('YYYY-MM-DD');
    }

    // Try to parse as date string
    const parsed = moment(dateStr, [
      'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD',
      'MMMM DD, YYYY', 'DD MMMM YYYY',
      'MMM DD, YYYY', 'DD MMM YYYY'
    ], true);

    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
  }

  /**
   * Extract number of people from message
   */
  extractPeopleCount(text) {
    // Patterns for number of people
    const patterns = [
      /(\d+)\s*(people|persons|passengers|guests|pax)/i,
      /(\d+)\s*(personas|pasajeros|invitados)/i,
      /(party\s+of|grupo\s+de)\s+(\d+)/i,
      /for\s+(\d+)/i,
      /para\s+(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const number = parseInt(match[1] || match[2]);
        if (number > 0 && number <= 100) {
          return number;
        }
      }
    }

    return null;
  }

  /**
   * Extract boat type preference
   */
  extractBoatType(text) {
    const types = {
      yacht: ['yacht', 'yate'],
      sailboat: ['sailboat', 'sailing', 'velero', 'navegación'],
      catamaran: ['catamaran', 'catamarán'],
      pontoon: ['pontoon', 'pontón'],
      speedboat: ['speedboat', 'speed boat', 'lancha rápida', 'lancha'],
      fishing: ['fishing boat', 'pesca', 'fishing charter']
    };

    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return type;
      }
    }

    return null;
  }

  /**
   * Extract trip duration
   */
  extractDuration(text) {
    const patterns = [
      /(\d+)\s*(hour|hr|hora)/i,
      /(half|media)\s*(day|día)/i,
      /(full|completo)\s*(day|día)/i,
      /(\d+)\s*(day|día)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[0].includes('half') || match[0].includes('media')) {
          return 4;
        }
        if (match[0].includes('full') || match[0].includes('completo')) {
          return 8;
        }
        const number = parseInt(match[1]);
        if (match[0].includes('day') || match[0].includes('día')) {
          return number * 8; // Convert days to hours
        }
        return number;
      }
    }

    return null;
  }

  /**
   * Extract customer preferences and special requests
   */
  extractPreferences(text) {
    const preferences = [];

    const keywords = {
      'Sunset Cruise': ['sunset', 'atardecer', 'puesta de sol'],
      'Snorkeling': ['snorkel', 'snorkeling', 'buceo'],
      'Fishing': ['fishing', 'pesca', 'fish'],
      'Party/Event': ['party', 'celebration', 'birthday', 'fiesta', 'celebración', 'cumpleaños'],
      'Romantic': ['romantic', 'romance', 'anniversary', 'romántico', 'aniversario'],
      'Family Friendly': ['family', 'kids', 'children', 'familia', 'niños'],
      'Catering': ['catering', 'food', 'drinks', 'comida', 'bebidas'],
      'Photography': ['photo', 'photographer', 'pictures', 'fotos', 'fotógrafo'],
      'Water Sports': ['water sports', 'jet ski', 'tubing', 'deportes acuáticos'],
      'Island Hopping': ['island', 'islands', 'isla', 'islas'],
      'Luxury Experience': ['luxury', 'premium', 'vip', 'lujo']
    };

    for (const [preference, terms] of Object.entries(keywords)) {
      if (terms.some(term => text.includes(term))) {
        preferences.push(preference);
      }
    }

    return preferences;
  }

  /**
   * Calculate confidence score (0-1) based on how much information was extracted
   */
  calculateConfidence(text) {
    let score = 0;
    const weights = {
      hasDate: 0.3,
      hasPeople: 0.3,
      hasDuration: 0.2,
      hasBoatType: 0.1,
      hasPreferences: 0.1
    };

    if (this.extractDates(text).length > 0) score += weights.hasDate;
    if (this.extractPeopleCount(text) !== null) score += weights.hasPeople;
    if (this.extractDuration(text) !== null) score += weights.hasDuration;
    if (this.extractBoatType(text) !== null) score += weights.hasBoatType;
    if (this.extractPreferences(text).length > 0) score += weights.hasPreferences;

    return Math.round(score * 100) / 100; // Round to 2 decimals
  }

  /**
   * Generate a summary of the parsed inquiry
   */
  generateSummary(parsedInquiry) {
    const parts = [];

    if (parsedInquiry.dates && parsedInquiry.dates.length > 0) {
      const dateStr = parsedInquiry.dates.map(d => moment(d).format('MMM DD, YYYY')).join(' or ');
      parts.push(`📅 Date(s): ${dateStr}`);
    }

    if (parsedInquiry.peopleCount) {
      parts.push(`👥 ${parsedInquiry.peopleCount} people`);
    }

    if (parsedInquiry.duration) {
      parts.push(`⏱️ ${parsedInquiry.duration} hours`);
    }

    if (parsedInquiry.boatType) {
      parts.push(`🚤 Boat type: ${parsedInquiry.boatType}`);
    }

    if (parsedInquiry.preferences && parsedInquiry.preferences.length > 0) {
      parts.push(`✨ Interests: ${parsedInquiry.preferences.join(', ')}`);
    }

    if (parts.length === 0) {
      return 'No specific booking details detected';
    }

    return parts.join('\n');
  }
}

module.exports = new MessageAnalysisService();
