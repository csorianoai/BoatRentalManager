const { nanoid } = require('nanoid');

class PricingService {
  constructor(pool) {
    this.pool = pool;
  }

  async getBoats() {
    const result = await this.pool.query(
      'SELECT * FROM boats WHERE status = $1 ORDER BY name',
      ['active']
    );
    return result.rows;
  }

  async createBoat(boatData) {
    const id = `boat_${nanoid(10)}`;
    const result = await this.pool.query(
      `INSERT INTO boats (id, name, capacity, boat_type, status, description, features)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        id,
        boatData.name,
        boatData.capacity,
        boatData.boatType,
        boatData.status || 'active',
        boatData.description || null,
        JSON.stringify(boatData.features || [])
      ]
    );
    return result.rows[0];
  }

  async getPlatformPricingPolicies(platform = null, boatId = null) {
    let query = 'SELECT * FROM platform_pricing_policies WHERE is_active = 1';
    const params = [];
    
    if (platform) {
      params.push(platform);
      query += ` AND platform = $${params.length}`;
    }
    
    if (boatId) {
      params.push(boatId);
      query += ` AND boat_id = $${params.length}`;
    }
    
    query += ' ORDER BY platform, boat_id';
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async createOrUpdatePricingPolicy(policyData) {
    const id = policyData.id || `policy_${nanoid(10)}`;
    
    const existingResult = await this.pool.query(
      'SELECT id FROM platform_pricing_policies WHERE platform = $1 AND boat_id = $2',
      [policyData.platform, policyData.boatId]
    );
    
    if (existingResult.rows.length > 0) {
      const result = await this.pool.query(
        `UPDATE platform_pricing_policies 
         SET base_price_half_day = $1, base_price_full_day = $2, 
             currency = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
         WHERE platform = $5 AND boat_id = $6
         RETURNING *`,
        [
          policyData.basePriceHalfDay,
          policyData.basePriceFullDay,
          policyData.currency || 'USD',
          policyData.isActive !== undefined ? policyData.isActive : 1,
          policyData.platform,
          policyData.boatId
        ]
      );
      return result.rows[0];
    } else {
      const result = await this.pool.query(
        `INSERT INTO platform_pricing_policies 
         (id, platform, boat_id, base_price_half_day, base_price_full_day, currency, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          id,
          policyData.platform,
          policyData.boatId,
          policyData.basePriceHalfDay,
          policyData.basePriceFullDay,
          policyData.currency || 'USD',
          policyData.isActive !== undefined ? policyData.isActive : 1
        ]
      );
      return result.rows[0];
    }
  }

  async getActivePricingAdjustments(platform = null, boatId = null) {
    const now = new Date();
    let query = `
      SELECT * FROM pricing_adjustments 
      WHERE is_active = 1 
        AND (valid_from IS NULL OR valid_from <= $1)
        AND (valid_until IS NULL OR valid_until >= $1)
    `;
    const params = [now];
    
    query += ' ORDER BY priority ASC, created_at ASC';
    
    const result = await this.pool.query(query, params);
    
    return result.rows.filter(adj => {
      if (adj.scope === 'all_platforms') return true;
      
      if (adj.scope === 'specific_platforms' && platform) {
        const targets = adj.target_platforms || [];
        return targets.includes(platform);
      }
      
      if (adj.scope === 'specific_boats' && boatId) {
        const targets = adj.target_boats || [];
        return targets.includes(boatId);
      }
      
      return false;
    });
  }

  async createPricingAdjustment(adjustmentData) {
    const id = `adj_${nanoid(10)}`;
    const result = await this.pool.query(
      `INSERT INTO pricing_adjustments 
       (id, name, description, adjustment_type, adjustment_value, scope, 
        target_platforms, target_boats, valid_from, valid_until, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        id,
        adjustmentData.name,
        adjustmentData.description || null,
        adjustmentData.adjustmentType,
        adjustmentData.adjustmentValue,
        adjustmentData.scope,
        JSON.stringify(adjustmentData.targetPlatforms || null),
        JSON.stringify(adjustmentData.targetBoats || null),
        adjustmentData.validFrom || null,
        adjustmentData.validUntil || null,
        adjustmentData.priority || 0,
        adjustmentData.isActive !== undefined ? adjustmentData.isActive : 1
      ]
    );
    return result.rows[0];
  }

  async updatePricingAdjustment(id, adjustmentData) {
    const result = await this.pool.query(
      `UPDATE pricing_adjustments 
       SET name = $1, description = $2, adjustment_type = $3, adjustment_value = $4,
           scope = $5, target_platforms = $6, target_boats = $7, 
           valid_from = $8, valid_until = $9, priority = $10, is_active = $11,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 RETURNING *`,
      [
        adjustmentData.name,
        adjustmentData.description || null,
        adjustmentData.adjustmentType,
        adjustmentData.adjustmentValue,
        adjustmentData.scope,
        JSON.stringify(adjustmentData.targetPlatforms || null),
        JSON.stringify(adjustmentData.targetBoats || null),
        adjustmentData.validFrom || null,
        adjustmentData.validUntil || null,
        adjustmentData.priority || 0,
        adjustmentData.isActive !== undefined ? adjustmentData.isActive : 1,
        id
      ]
    );
    return result.rows[0];
  }

  async deletePricingAdjustment(id) {
    await this.pool.query('UPDATE pricing_adjustments SET is_active = 0 WHERE id = $1', [id]);
  }

  async getAllPricingAdjustments() {
    const result = await this.pool.query(
      'SELECT * FROM pricing_adjustments ORDER BY priority ASC, created_at DESC'
    );
    return result.rows;
  }

  async calculateEffectivePrice(platform, boatId, duration, date = new Date()) {
    const policies = await this.getPlatformPricingPolicies(platform, boatId);
    
    if (policies.length === 0) {
      throw new Error(`No pricing policy found for platform: ${platform}, boat: ${boatId}`);
    }
    
    const policy = policies[0];
    let basePrice = duration >= 6 ? policy.base_price_full_day : policy.base_price_half_day;
    
    const adjustments = await this.getActivePricingAdjustments(platform, boatId);
    
    let effectivePrice = basePrice;
    const appliedAdjustments = [];
    
    for (const adj of adjustments) {
      if (adj.adjustment_type === 'percentage') {
        const adjustmentAmount = Math.floor(effectivePrice * (adj.adjustment_value / 100));
        effectivePrice += adjustmentAmount;
        appliedAdjustments.push({
          name: adj.name,
          type: 'percentage',
          value: adj.adjustment_value,
          appliedAmount: adjustmentAmount
        });
      } else if (adj.adjustment_type === 'fixed_amount') {
        effectivePrice += adj.adjustment_value;
        appliedAdjustments.push({
          name: adj.name,
          type: 'fixed_amount',
          value: adj.adjustment_value,
          appliedAmount: adj.adjustment_value
        });
      }
    }
    
    effectivePrice = Math.max(0, effectivePrice);
    
    return {
      platform,
      boatId,
      duration,
      basePrice,
      effectivePrice,
      currency: policy.currency,
      appliedAdjustments,
      calculatedAt: new Date()
    };
  }

  async previewAdjustmentImpact(adjustmentData) {
    const platforms = adjustmentData.scope === 'all_platforms' 
      ? await this.getAllPlatforms()
      : adjustmentData.targetPlatforms || [];
    
    const boats = await this.getBoats();
    const impactData = [];
    
    for (const platform of platforms) {
      for (const boat of boats) {
        try {
          const currentPrice = await this.calculateEffectivePrice(platform, boat.id, 4);
          
          let projectedPrice = currentPrice.effectivePrice;
          if (adjustmentData.adjustmentType === 'percentage') {
            projectedPrice += Math.floor(projectedPrice * (adjustmentData.adjustmentValue / 100));
          } else {
            projectedPrice += adjustmentData.adjustmentValue;
          }
          
          impactData.push({
            platform,
            boat: boat.name,
            currentPrice: currentPrice.effectivePrice,
            projectedPrice,
            difference: projectedPrice - currentPrice.effectivePrice
          });
        } catch (error) {
          console.log(`Skipping ${platform}/${boat.id}: ${error.message}`);
        }
      }
    }
    
    return impactData;
  }

  async getAllPlatforms() {
    return [
      'Airbnb', 'GetMyBoat', 'BoatSetter', 'Viator', 'Expedia',
      'TripAdvisor', 'Groupon', 'Booking.com', 'FareHarbor',
      'Bokun', 'Rezdy', 'Peek', 'Xola'
    ];
  }
}

module.exports = PricingService;
