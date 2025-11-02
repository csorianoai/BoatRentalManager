const { nanoid } = require('nanoid');
const moment = require('moment');

const REGIONAL_MULTIPLIERS = {
  'Miami': 1.2,
  'Keys': 1.3,
  'Tampa': 1.1,
  'Fort Lauderdale': 1.15,
  'default': 1.0
};

class DynamicPricingService {
  constructor(pool, marineConditionsService) {
    this.pool = pool;
    this.marineConditionsService = marineConditionsService;
  }

  async addCompetitorData(data) {
    const id = `comp_${nanoid(10)}`;
    const result = await this.pool.query(
      `INSERT INTO competitor_data 
       (id, region, competitor_name, boat_type, capacity, price_half_day, price_full_day, recorded_date, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        id,
        data.region || null,
        data.competitorName,
        data.boatType || null,
        data.capacity || null,
        data.priceHalfDay || null,
        data.priceFullDay || null,
        data.recordedDate || new Date(),
        data.source || 'manual',
        data.notes || null
      ]
    );
    return result.rows[0];
  }

  async getCompetitorData(region = null, boatType = null) {
    let query = 'SELECT * FROM competitor_data WHERE 1=1';
    const params = [];
    
    if (region) {
      params.push(region);
      query += ` AND region = $${params.length}`;
    }
    
    if (boatType) {
      params.push(boatType);
      query += ` AND boat_type = $${params.length}`;
    }
    
    query += ' ORDER BY recorded_date DESC LIMIT 50';
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async addMarketEvent(data) {
    const id = `event_${nanoid(10)}`;
    const result = await this.pool.query(
      `INSERT INTO market_events 
       (id, event_name, region, start_date, end_date, price_multiplier, event_type, impact_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        id,
        data.eventName,
        data.region || null,
        data.startDate,
        data.endDate,
        data.priceMultiplier || 1.0,
        data.eventType || 'other',
        data.impactLevel || 'medium'
      ]
    );
    return result.rows[0];
  }

  async getActiveMarketEvents(region = null) {
    const today = new Date();
    let query = `
      SELECT * FROM market_events 
      WHERE start_date <= $1 AND end_date >= $1
    `;
    const params = [today];
    
    if (region) {
      params.push(region);
      query += ` AND (region = $${params.length} OR region IS NULL)`;
    }
    
    query += ' ORDER BY price_multiplier DESC';
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async predictDemand(region, boatType, targetDate) {
    const historicalBookings = await this.pool.query(
      `SELECT 
        COUNT(*) as booking_count,
        AVG(total_amount) as avg_amount,
        EXTRACT(DOW FROM booking_date::date) as day_of_week,
        EXTRACT(MONTH FROM booking_date::date) as month
       FROM bookings 
       WHERE booking_date::date >= $1
         AND status IN ('confirmed', 'completed')
       GROUP BY day_of_week, month
       ORDER BY booking_count DESC`,
      [moment().subtract(6, 'months').format('YYYY-MM-DD')]
    );

    const targetDOW = moment(targetDate).day();
    const targetMonth = moment(targetDate).month() + 1;

    let demandScore = 50;
    let confidence = 0.5;

    if (historicalBookings.rows.length > 0) {
      const relevantData = historicalBookings.rows.filter(
        row => parseInt(row.day_of_week) === targetDOW || parseInt(row.month) === targetMonth
      );

      if (relevantData.length > 0) {
        const avgBookings = relevantData.reduce((sum, row) => sum + parseInt(row.booking_count), 0) / relevantData.length;
        demandScore = Math.min(100, Math.round(avgBookings * 10));
        confidence = Math.min(0.95, relevantData.length / 10);
      }
    }

    const regionalMultiplier = REGIONAL_MULTIPLIERS[region] || REGIONAL_MULTIPLIERS.default;
    demandScore = Math.round(demandScore * regionalMultiplier);

    const events = await this.getActiveMarketEvents(region);
    let eventMultiplier = 1.0;
    if (events.length > 0) {
      eventMultiplier = Math.max(...events.map(e => parseFloat(e.price_multiplier) || 1.0));
      demandScore = Math.round(demandScore * eventMultiplier);
    }

    const isWeekend = targetDOW === 0 || targetDOW === 6;
    if (isWeekend) {
      demandScore = Math.round(demandScore * 1.3);
    }

    const isSummerMonth = targetMonth >= 6 && targetMonth <= 8;
    if (isSummerMonth) {
      demandScore = Math.round(demandScore * 1.2);
    }

    const recommendedMultiplier = this.calculatePriceMultiplier(demandScore);

    const id = `forecast_${nanoid(10)}`;
    await this.pool.query(
      `INSERT INTO demand_forecasts 
       (id, forecast_date, region, boat_type, predicted_demand_score, recommended_price_multiplier, confidence_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, targetDate, region, boatType, demandScore, recommendedMultiplier, confidence]
    );

    return {
      forecastDate: targetDate,
      region,
      boatType,
      demandScore: Math.min(100, demandScore),
      recommendedMultiplier,
      confidence,
      factors: {
        regional: regionalMultiplier,
        events: eventMultiplier,
        weekend: isWeekend,
        summer: isSummerMonth,
        historicalData: historicalBookings.rows.length
      }
    };
  }

  calculatePriceMultiplier(demandScore) {
    if (demandScore >= 80) return 1.4;
    if (demandScore >= 60) return 1.25;
    if (demandScore >= 40) return 1.1;
    if (demandScore >= 20) return 1.0;
    return 0.9;
  }

  async generatePriceRecommendation(boatId, date, durationHours, region = 'Miami') {
    const boatResult = await this.pool.query(
      'SELECT * FROM boats WHERE id = $1',
      [boatId]
    );

    if (boatResult.rows.length === 0) {
      throw new Error('Boat not found');
    }

    const boat = boatResult.rows[0];

    const policyResult = await this.pool.query(
      'SELECT * FROM platform_pricing_policies WHERE boat_id = $1 AND is_active = 1 LIMIT 1',
      [boatId]
    );

    let basePrice = durationHours >= 6 ? 400 : 250;
    if (policyResult.rows.length > 0) {
      basePrice = durationHours >= 6 
        ? policyResult.rows[0].base_price_full_day 
        : policyResult.rows[0].base_price_half_day;
    }

    const forecast = await this.predictDemand(region, boat.boat_type, date);

    let recommendedPrice = basePrice * forecast.recommendedMultiplier;

    let weatherFactor = 1.0;
    try {
      const marineConditions = await this.marineConditionsService.getCurrentConditions();
      
      if (marineConditions && marineConditions.wind) {
        const windSpeed = marineConditions.wind.speed || 0;
        if (windSpeed > 25) {
          weatherFactor = 0.8;
        } else if (windSpeed > 15) {
          weatherFactor = 0.9;
        }
      }

      if (marineConditions && marineConditions.conditions) {
        const description = (marineConditions.conditions.description || '').toLowerCase();
        if (description.includes('storm') || description.includes('rain')) {
          weatherFactor *= 0.85;
        } else if (description.includes('clear') || description.includes('sunny')) {
          weatherFactor *= 1.05;
        }
      }
    } catch (error) {
      console.log('Weather data unavailable, using default factor');
    }

    recommendedPrice = Math.round(recommendedPrice * weatherFactor);

    const competitorData = await this.getCompetitorData(region, boat.boat_type);
    let competitiveFactor = 1.0;
    
    if (competitorData.length > 0) {
      const avgCompetitorPrice = competitorData.reduce((sum, comp) => {
        const price = durationHours >= 6 ? comp.price_full_day : comp.price_half_day;
        return sum + (parseFloat(price) || 0);
      }, 0) / competitorData.length;

      if (avgCompetitorPrice > 0) {
        const priceRatio = recommendedPrice / avgCompetitorPrice;
        if (priceRatio > 1.2) {
          competitiveFactor = 0.95;
        } else if (priceRatio < 0.8) {
          competitiveFactor = 1.05;
        }
      }
    }

    recommendedPrice = Math.round(recommendedPrice * competitiveFactor);

    const id = `rec_${nanoid(10)}`;
    const factors = {
      demandScore: forecast.demandScore,
      demandMultiplier: forecast.recommendedMultiplier,
      weatherFactor,
      competitiveFactor,
      regionalMultiplier: forecast.factors.regional,
      eventMultiplier: forecast.factors.events,
      confidence: forecast.confidence
    };

    await this.pool.query(
      `INSERT INTO pricing_recommendations 
       (id, boat_id, recommended_date, duration_hours, base_price, recommended_price, factors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, boatId, date, durationHours, basePrice, recommendedPrice, JSON.stringify(factors)]
    );

    return {
      id,
      boatId,
      boatName: boat.name,
      recommendedDate: date,
      durationHours,
      basePrice,
      recommendedPrice,
      factors,
      forecast
    };
  }

  async getMarketInsights(region = null) {
    const competitorData = await this.getCompetitorData(region);
    const activeEvents = await this.getActiveMarketEvents(region);

    const recentForecasts = await this.pool.query(
      `SELECT * FROM demand_forecasts 
       WHERE forecast_date >= $1
       ORDER BY generated_at DESC 
       LIMIT 10`,
      [new Date()]
    );

    const avgDemandScore = recentForecasts.rows.length > 0
      ? recentForecasts.rows.reduce((sum, f) => sum + (f.predicted_demand_score || 0), 0) / recentForecasts.rows.length
      : 50;

    const competitorAnalysis = {
      totalCompetitors: competitorData.length,
      avgPriceHalfDay: competitorData.length > 0
        ? competitorData.reduce((sum, c) => sum + (parseFloat(c.price_half_day) || 0), 0) / competitorData.length
        : 0,
      avgPriceFullDay: competitorData.length > 0
        ? competitorData.reduce((sum, c) => sum + (parseFloat(c.price_full_day) || 0), 0) / competitorData.length
        : 0
    };

    return {
      region: region || 'All Regions',
      currentDemandLevel: avgDemandScore >= 60 ? 'High' : avgDemandScore >= 40 ? 'Medium' : 'Low',
      avgDemandScore: Math.round(avgDemandScore),
      activeEvents: activeEvents.length,
      competitorAnalysis,
      regionalMultiplier: REGIONAL_MULTIPLIERS[region] || REGIONAL_MULTIPLIERS.default,
      recommendations: recentForecasts.rows.slice(0, 5)
    };
  }

  async identifyOpportunities(region = 'Miami') {
    const opportunities = [];

    const upcomingWeek = [];
    for (let i = 0; i < 7; i++) {
      upcomingWeek.push(moment().add(i, 'days').format('YYYY-MM-DD'));
    }

    for (const date of upcomingWeek) {
      const forecast = await this.predictDemand(region, 'yacht', date);
      
      if (forecast.demandScore >= 70) {
        opportunities.push({
          type: 'high_demand',
          date,
          demandScore: forecast.demandScore,
          recommendedAction: 'Increase prices by ' + Math.round((forecast.recommendedMultiplier - 1) * 100) + '%',
          expectedRevenue: 'High',
          priority: forecast.demandScore >= 85 ? 'critical' : 'high'
        });
      }

      if (forecast.demandScore <= 30) {
        opportunities.push({
          type: 'low_demand',
          date,
          demandScore: forecast.demandScore,
          recommendedAction: 'Offer promotion or discount to stimulate bookings',
          expectedRevenue: 'Low',
          priority: 'medium'
        });
      }
    }

    const activeEvents = await this.getActiveMarketEvents(region);
    activeEvents.forEach(event => {
      opportunities.push({
        type: 'event_opportunity',
        date: event.start_date,
        eventName: event.event_name,
        recommendedAction: 'Apply ' + ((parseFloat(event.price_multiplier) - 1) * 100).toFixed(0) + '% price increase',
        expectedRevenue: event.impact_level === 'high' ? 'Very High' : 'High',
        priority: 'high'
      });
    });

    const competitorData = await this.getCompetitorData(region);
    if (competitorData.length > 0) {
      const avgCompPrice = competitorData.reduce((sum, c) => sum + (parseFloat(c.price_half_day) || 0), 0) / competitorData.length;
      
      const ourBoats = await this.pool.query('SELECT * FROM boats WHERE status = $1', ['active']);
      
      for (const boat of ourBoats.rows) {
        const ourPolicy = await this.pool.query(
          'SELECT * FROM platform_pricing_policies WHERE boat_id = $1 AND is_active = 1 LIMIT 1',
          [boat.id]
        );

        if (ourPolicy.rows.length > 0) {
          const ourPrice = ourPolicy.rows[0].base_price_half_day;
          const priceDiff = ((ourPrice - avgCompPrice) / avgCompPrice) * 100;

          if (priceDiff < -15) {
            opportunities.push({
              type: 'underpriced',
              boatName: boat.name,
              ourPrice,
              competitorAvg: Math.round(avgCompPrice),
              recommendedAction: 'Consider raising price to market average',
              expectedRevenue: 'Medium',
              priority: 'medium'
            });
          } else if (priceDiff > 20) {
            opportunities.push({
              type: 'overpriced',
              boatName: boat.name,
              ourPrice,
              competitorAvg: Math.round(avgCompPrice),
              recommendedAction: 'Consider lowering price or adding value',
              expectedRevenue: 'Low',
              priority: 'low'
            });
          }
        }
      }
    }

    return opportunities.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async getRecentRecommendations(limit = 20) {
    const result = await this.pool.query(
      `SELECT pr.*, b.name as boat_name 
       FROM pricing_recommendations pr
       LEFT JOIN boats b ON pr.boat_id = b.id
       ORDER BY pr.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

module.exports = DynamicPricingService;
