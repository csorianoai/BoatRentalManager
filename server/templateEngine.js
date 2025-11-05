const moment = require('moment');

/**
 * Template Engine for intelligent message templates
 * Replaces dynamic placeholders with real-time data
 */
class TemplateEngine {
  
  /**
   * Render template with dynamic data
   * @param {string} template - Template content with placeholders
   * @param {Object} data - Data object with replacement values
   * @returns {string} Rendered template
   */
  render(template, data = {}) {
    if (!template || typeof template !== 'string') {
      return '';
    }

    let rendered = template;

    // Replace all placeholders
    const placeholders = this.extractPlaceholders(template);
    
    placeholders.forEach(placeholder => {
      const value = this.resolvePlaceholder(placeholder, data);
      const regex = new RegExp(`\\{\\{\\s*${placeholder}\\s*\\}\\}`, 'g');
      rendered = rendered.replace(regex, value);
    });

    return rendered;
  }

  /**
   * Extract all placeholders from template
   * @param {string} template - Template content
   * @returns {Array<string>} List of placeholder names
   */
  extractPlaceholders(template) {
    const regex = /\{\{\s*([^\}]+)\s*\}\}/g;
    const placeholders = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      placeholders.push(match[1].trim());
    }

    return [...new Set(placeholders)]; // Remove duplicates
  }

  /**
   * Resolve a single placeholder with data
   * @param {string} placeholder - Placeholder name
   * @param {Object} data - Data object
   * @returns {string} Resolved value
   */
  resolvePlaceholder(placeholder, data) {
    const handlers = {
      // Customer data
      'customer_name': () => data.customerName || 'Guest',
      'customer_email': () => data.customerEmail || '',
      'customer_phone': () => data.customerPhone || '',
      
      // Booking data
      'booking_date': () => this.formatDate(data.bookingDate),
      'booking_time': () => data.bookingTime || '',
      'booking_duration': () => data.duration || '',
      'booking_people': () => data.peopleCount || '',
      
      // Boat data
      'boat_name': () => data.boatName || '',
      'boat_type': () => data.boatType || '',
      'boat_capacity': () => data.capacity || '',
      'boat_location': () => data.location || '',
      
      // Pricing data
      'base_price': () => this.formatPrice(data.basePrice),
      'final_price': () => this.formatPrice(data.finalPrice),
      'total_price': () => this.formatPrice(data.totalPrice || data.finalPrice),
      'discount': () => this.formatPrice(data.discount),
      'discount_percentage': () => data.discountPercentage ? `${data.discountPercentage}%` : '',
      
      // Available boats list
      'available_boats': () => this.formatBoatList(data.availableBoats),
      'available_boats_with_prices': () => this.formatBoatListWithPrices(data.availableBoats),
      
      // Date/time
      'today': () => moment().format('MMMM D, YYYY'),
      'current_time': () => moment().format('h:mm A'),
      'tomorrow': () => moment().add(1, 'day').format('MMMM D, YYYY'),
      
      // Company data
      'company_name': () => 'Nadaki Excursions',
      'company_phone': () => data.companyPhone || '+1 (XXX) XXX-XXXX',
      'company_email': () => data.companyEmail || 'sales@nadakiexcursions.com',
      'company_website': () => 'https://www.nadakiexcursions.com',
      
      // Links
      'booking_link': () => data.bookingLink || 'https://www.nadakiexcursions.com/book',
      'payment_link': () => data.paymentLink || '',
      
      // Preferences detected from inquiry
      'preferences': () => this.formatPreferences(data.preferences)
    };

    const handler = handlers[placeholder];
    return handler ? handler() : `{{${placeholder}}}`;
  }

  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    
    const date = moment(dateStr);
    if (!date.isValid()) return dateStr;
    
    return date.format('MMMM D, YYYY');
  }

  /**
   * Format price with currency
   */
  formatPrice(price) {
    if (price === null || price === undefined) return '';
    
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return price;
    
    return `$${numPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Format list of boats
   */
  formatBoatList(boats) {
    if (!boats || !Array.isArray(boats) || boats.length === 0) {
      return 'No hay barcos disponibles en este momento';
    }

    return boats.map((boat, index) => 
      `${index + 1}. ${boat.name || boat.boatName} (${boat.capacity} personas)`
    ).join('\n');
  }

  /**
   * Format list of boats with prices
   */
  formatBoatListWithPrices(boats) {
    if (!boats || !Array.isArray(boats) || boats.length === 0) {
      return 'No hay barcos disponibles en este momento';
    }

    return boats.map((boat, index) => {
      const name = boat.name || boat.boatName;
      const price = this.formatPrice(boat.price || boat.finalPrice || boat.basePrice);
      const capacity = boat.capacity;
      const type = boat.type || boat.boatType || '';
      
      return `${index + 1}. ${name} - ${type} (${capacity} personas) - ${price}`;
    }).join('\n');
  }

  /**
   * Format customer preferences
   */
  formatPreferences(preferences) {
    if (!preferences || !Array.isArray(preferences) || preferences.length === 0) {
      return '';
    }

    return preferences.join(', ');
  }

  /**
   * Validate template syntax
   * @param {string} template - Template to validate
   * @returns {Object} Validation result with isValid and errors
   */
  validateTemplate(template) {
    const errors = [];

    // Check for unclosed placeholders
    const openBraces = (template.match(/\{\{/g) || []).length;
    const closeBraces = (template.match(/\}\}/g) || []).length;

    if (openBraces !== closeBraces) {
      errors.push('Unclosed placeholder brackets detected');
    }

    // Check for nested placeholders
    if (template.match(/\{\{[^\}]*\{\{/)) {
      errors.push('Nested placeholders are not allowed');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get list of available placeholders
   * @returns {Array<Object>} List of placeholders with descriptions
   */
  getAvailablePlaceholders() {
    return [
      { name: 'customer_name', description: 'Customer name', example: 'John Doe' },
      { name: 'customer_email', description: 'Customer email', example: 'john@example.com' },
      { name: 'customer_phone', description: 'Customer phone', example: '+1 234 567 8900' },
      
      { name: 'booking_date', description: 'Booking date', example: 'December 25, 2024' },
      { name: 'booking_time', description: 'Booking time', example: '2:00 PM' },
      { name: 'booking_duration', description: 'Trip duration in hours', example: '4' },
      { name: 'booking_people', description: 'Number of people', example: '6' },
      
      { name: 'boat_name', description: 'Boat name', example: 'Sunset Dream' },
      { name: 'boat_type', description: 'Type of boat', example: 'Yacht' },
      { name: 'boat_capacity', description: 'Boat capacity', example: '12' },
      { name: 'boat_location', description: 'Boat location', example: 'Miami Marina' },
      
      { name: 'base_price', description: 'Base price', example: '$500.00' },
      { name: 'final_price', description: 'Final price', example: '$450.00' },
      { name: 'total_price', description: 'Total price', example: '$450.00' },
      { name: 'discount', description: 'Discount amount', example: '$50.00' },
      { name: 'discount_percentage', description: 'Discount percentage', example: '10%' },
      
      { name: 'available_boats', description: 'List of available boats', example: '1. Sunset Dream (12 personas)\n2. Ocean Breeze (8 personas)' },
      { name: 'available_boats_with_prices', description: 'List of boats with prices', example: '1. Sunset Dream - Yacht (12 personas) - $500.00' },
      
      { name: 'today', description: 'Today\'s date', example: 'December 1, 2024' },
      { name: 'current_time', description: 'Current time', example: '3:45 PM' },
      { name: 'tomorrow', description: 'Tomorrow\'s date', example: 'December 2, 2024' },
      
      { name: 'company_name', description: 'Company name', example: 'Nadaki Excursions' },
      { name: 'company_phone', description: 'Company phone', example: '+1 (XXX) XXX-XXXX' },
      { name: 'company_email', description: 'Company email', example: 'sales@nadakiexcursions.com' },
      { name: 'company_website', description: 'Company website', example: 'https://www.nadakiexcursions.com' },
      
      { name: 'booking_link', description: 'Direct booking link', example: 'https://www.nadakiexcursions.com/book' },
      { name: 'payment_link', description: 'Payment link', example: 'https://pay.nadakiexcursions.com/...' },
      
      { name: 'preferences', description: 'Customer preferences detected', example: 'Sunset Cruise, Snorkeling' }
    ];
  }
}

module.exports = new TemplateEngine();
