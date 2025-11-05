const { Pool } = require('pg');
const { nanoid } = require('nanoid');

class FleetService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }

  // Transform Postgres snake_case row to camelCase
  transformBoatRow(row) {
    if (!row) return null;
    
    // Parse JSON/JSONB fields if they are strings (for backward compatibility)
    const parseJsonField = (field) => {
      if (!field) return null;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch (e) {
          return field;
        }
      }
      return field;
    };
    
    return {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      boatType: row.boat_type,
      status: row.status,
      description: row.description,
      fullDescription: row.full_description,
      features: parseJsonField(row.features),
      amenities: parseJsonField(row.amenities),
      photos: parseJsonField(row.photos),
      platformIds: parseJsonField(row.platform_ids),
      hourlyRateBase: row.hourly_rate_base,
      dailyRateBase: row.daily_rate_base,
      location: row.location,
      year: row.year,
      make: row.make,
      model: row.model,
      length: row.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Get all boats
  async getAllBoats() {
    const result = await this.pool.query(
      `SELECT * FROM boats ORDER BY created_at DESC`
    );
    return result.rows.map(row => this.transformBoatRow(row));
  }

  // Get boat by ID
  async getBoatById(id) {
    const result = await this.pool.query(
      `SELECT * FROM boats WHERE id = $1`,
      [id]
    );
    return this.transformBoatRow(result.rows[0]);
  }

  // Create a new boat
  async createBoat(boatData) {
    const id = `boat_${nanoid(10)}`;
    
    const result = await this.pool.query(
      `INSERT INTO boats (
        id, name, capacity, boat_type, status,
        description, full_description, features, amenities, photos,
        platform_ids, hourly_rate_base, daily_rate_base, location,
        year, make, model, length, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING *`,
      [
        id,
        boatData.name,
        boatData.capacity,
        boatData.boatType,
        boatData.status || 'active',
        boatData.description || null,
        boatData.fullDescription || null,
        boatData.features ? JSON.stringify(boatData.features) : null,
        boatData.amenities ? JSON.stringify(boatData.amenities) : null,
        boatData.photos ? JSON.stringify(boatData.photos) : null,
        boatData.platformIds ? JSON.stringify(boatData.platformIds) : null,
        boatData.hourlyRateBase || null,
        boatData.dailyRateBase || null,
        boatData.location || null,
        boatData.year || null,
        boatData.make || null,
        boatData.model || null,
        boatData.length || null
      ]
    );

    return this.transformBoatRow(result.rows[0]);
  }

  // Update boat
  async updateBoat(id, boatData) {
    const result = await this.pool.query(
      `UPDATE boats SET
        name = $1,
        capacity = $2,
        boat_type = $3,
        status = $4,
        description = $5,
        full_description = $6,
        features = $7,
        amenities = $8,
        photos = $9,
        platform_ids = COALESCE($10, platform_ids),
        hourly_rate_base = $11,
        daily_rate_base = $12,
        location = $13,
        year = $14,
        make = $15,
        model = $16,
        length = $17,
        updated_at = NOW()
      WHERE id = $18
      RETURNING *`,
      [
        boatData.name,
        boatData.capacity,
        boatData.boatType,
        boatData.status,
        boatData.description || null,
        boatData.fullDescription || null,
        boatData.features ? JSON.stringify(boatData.features) : null,
        boatData.amenities ? JSON.stringify(boatData.amenities) : null,
        boatData.photos ? JSON.stringify(boatData.photos) : null,
        boatData.platformIds ? JSON.stringify(boatData.platformIds) : null,
        boatData.hourlyRateBase || null,
        boatData.dailyRateBase || null,
        boatData.location || null,
        boatData.year || null,
        boatData.make || null,
        boatData.model || null,
        boatData.length || null,
        id
      ]
    );

    return this.transformBoatRow(result.rows[0]);
  }

  // Update platform IDs only
  async updatePlatformIds(id, platformIds) {
    const result = await this.pool.query(
      `UPDATE boats SET
        platform_ids = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [platformIds ? JSON.stringify(platformIds) : null, id]
    );

    return this.transformBoatRow(result.rows[0]);
  }

  // Delete boat
  async deleteBoat(id) {
    await this.pool.query(`DELETE FROM boats WHERE id = $1`, [id]);
  }

  // Get availability for calendar
  async getAvailability(year, month, boatId = null) {
    let query = `
      SELECT * FROM boat_availability
      WHERE date >= $1 AND date < $2
    `;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12 
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const params = [startDate, endDate];

    if (boatId) {
      params.push(boatId);
      query += ` AND boat_id = $${params.length}`;
    }

    query += ` ORDER BY date ASC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // Search available boats
  async searchAvailableBoats(date, capacity = null, type = null) {
    // Get boats matching criteria
    let query = `
      SELECT b.* FROM boats b
      WHERE b.status = 'active'
    `;
    const params = [];

    if (capacity) {
      params.push(capacity);
      query += ` AND b.capacity >= $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND b.boat_type = $${params.length}`;
    }

    const boatsResult = await this.pool.query(query, params);
    const boats = boatsResult.rows;

    // Check availability for each boat
    const results = [];
    for (const boat of boats) {
      const availResult = await this.pool.query(
        `SELECT * FROM boat_availability 
         WHERE boat_id = $1 AND date = $2 AND is_available = 0`,
        [boat.id, date]
      );

      const blocked = availResult.rows[0];
      
      results.push({
        ...this.transformBoatRow(boat),
        available: !blocked,
        blockReason: blocked?.block_reason || null
      });
    }

    // Sort: available first
    results.sort((a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0));

    return results;
  }

  // Block a date (called when booking is made)
  async blockDate(boatId, date, reason = 'booking', bookingId = null) {
    const id = `avail_${nanoid(10)}`;
    
    await this.pool.query(
      `INSERT INTO boat_availability 
       (id, boat_id, date, is_available, block_reason, booking_id, created_at, updated_at)
       VALUES ($1, $2, $3, 0, $4, $5, NOW(), NOW())
       ON CONFLICT (boat_id, date) DO UPDATE
       SET is_available = 0, block_reason = $4, booking_id = $5, updated_at = NOW()`,
      [id, boatId, date, reason, bookingId]
    );
  }

  // Unblock a date
  async unblockDate(boatId, date) {
    await this.pool.query(
      `DELETE FROM boat_availability 
       WHERE boat_id = $1 AND date = $2`,
      [boatId, date]
    );
  }
}

module.exports = new FleetService();
