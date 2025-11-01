const { nanoid } = require('nanoid');

class AvailabilityService {
  constructor(pool) {
    this.pool = pool;
  }

  async checkAvailability(boatId, date, startTime, endTime) {
    const result = await this.pool.query(
      `SELECT * FROM availability_blocks 
       WHERE boat_id = $1 
         AND block_date = $2 
         AND status = 'blocked'
         AND (
           (start_time <= $3 AND end_time > $3) OR
           (start_time < $4 AND end_time >= $4) OR
           (start_time >= $3 AND end_time <= $4)
         )`,
      [boatId, date, startTime, endTime]
    );
    
    return {
      isAvailable: result.rows.length === 0,
      conflicts: result.rows
    };
  }

  async createBlock(blockData) {
    const id = `block_${nanoid(10)}`;
    const result = await this.pool.query(
      `INSERT INTO availability_blocks 
       (id, boat_id, block_date, start_time, end_time, block_type, booking_id, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        id,
        blockData.boatId,
        blockData.blockDate,
        blockData.startTime,
        blockData.endTime,
        blockData.blockType || 'manual',
        blockData.bookingId || null,
        blockData.reason || null,
        'blocked'
      ]
    );
    return result.rows[0];
  }

  async releaseBlock(blockId) {
    const result = await this.pool.query(
      `UPDATE availability_blocks 
       SET status = 'released', released_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [blockId]
    );
    return result.rows[0];
  }

  async releaseBlocksByBooking(bookingId) {
    const result = await this.pool.query(
      `UPDATE availability_blocks 
       SET status = 'released', released_at = CURRENT_TIMESTAMP
       WHERE booking_id = $1 AND status = 'blocked'
       RETURNING *`,
      [bookingId]
    );
    return result.rows;
  }

  async getBlocksByBoat(boatId, startDate, endDate) {
    const result = await this.pool.query(
      `SELECT * FROM availability_blocks 
       WHERE boat_id = $1 
         AND block_date >= $2 
         AND block_date <= $3
         AND status = 'blocked'
       ORDER BY block_date, start_time`,
      [boatId, startDate, endDate]
    );
    return result.rows;
  }

  async getAllBlocks(startDate, endDate) {
    let query = 'SELECT * FROM availability_blocks WHERE status = $1';
    const params = ['blocked'];
    
    if (startDate) {
      params.push(startDate);
      query += ` AND block_date >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      query += ` AND block_date <= $${params.length}`;
    }
    
    query += ' ORDER BY block_date, start_time';
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async createBookingBlock(bookingData) {
    const { boatId, bookingDate, startTime, durationHours, bookingId } = bookingData;
    
    const startHour = parseInt(startTime.split(':')[0]);
    const startMinute = parseInt(startTime.split(':')[1] || '0');
    const endHour = startHour + durationHours;
    const endTime = `${endHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
    
    const availability = await this.checkAvailability(boatId, bookingDate, startTime, endTime);
    
    if (!availability.isAvailable) {
      throw new Error('Boat is not available for the requested time slot');
    }
    
    const block = await this.createBlock({
      boatId,
      blockDate: bookingDate,
      startTime,
      endTime,
      blockType: 'booking',
      bookingId,
      reason: `Booking ${bookingId}`
    });
    
    return block;
  }

  parseTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  timeToString(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}

module.exports = AvailabilityService;
