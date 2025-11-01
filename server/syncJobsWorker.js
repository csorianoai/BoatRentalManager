const { nanoid } = require('nanoid');
const cron = require('node-cron');

class SyncJobsWorker {
  constructor(pool) {
    this.pool = pool;
    this.isProcessing = false;
    this.cronJob = null;
  }

  start() {
    console.log('🔄 Starting SyncJobsWorker...');
    
    this.cronJob = cron.schedule('*/2 * * * *', async () => {
      await this.processPendingJobs();
    });
    
    this.processPendingJobs();
    
    console.log('✅ SyncJobsWorker started (runs every 2 minutes)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('⏹️  SyncJobsWorker stopped');
    }
  }

  async createSyncJob(jobData) {
    const id = `job_${nanoid(10)}`;
    const result = await this.pool.query(
      `INSERT INTO sync_jobs 
       (id, job_type, target_platform, payload, status, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        id,
        jobData.jobType,
        jobData.targetPlatform,
        JSON.stringify(jobData.payload),
        'pending',
        jobData.maxAttempts || 3
      ]
    );
    return result.rows[0];
  }

  async createBulkSyncJobs(jobType, payload, excludePlatform = null) {
    const platforms = [
      'Airbnb', 'GetMyBoat', 'BoatSetter', 'Viator', 'Expedia',
      'TripAdvisor', 'Groupon', 'Booking.com', 'FareHarbor',
      'Bokun', 'Rezdy', 'Peek', 'Xola'
    ];
    
    const targetPlatforms = excludePlatform 
      ? platforms.filter(p => p !== excludePlatform)
      : platforms;
    
    const jobs = [];
    for (const platform of targetPlatforms) {
      const job = await this.createSyncJob({
        jobType,
        targetPlatform: platform,
        payload
      });
      jobs.push(job);
    }
    
    console.log(`✅ Created ${jobs.length} sync jobs for ${jobType}`);
    return jobs;
  }

  async processPendingJobs() {
    if (this.isProcessing) {
      console.log('⏳ Already processing jobs, skipping this cycle');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const result = await this.pool.query(
        `SELECT * FROM sync_jobs 
         WHERE status = 'pending' 
           AND attempts < max_attempts
         ORDER BY created_at ASC
         LIMIT 10`
      );
      
      const jobs = result.rows;
      
      if (jobs.length === 0) {
        console.log('✅ No pending sync jobs');
        return;
      }
      
      console.log(`🔄 Processing ${jobs.length} sync jobs...`);
      
      for (const job of jobs) {
        await this.processJob(job);
      }
      
      console.log(`✅ Processed ${jobs.length} sync jobs`);
    } catch (error) {
      console.error('❌ Error processing sync jobs:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async processJob(job) {
    try {
      await this.pool.query(
        `UPDATE sync_jobs 
         SET status = 'processing', last_attempt_at = CURRENT_TIMESTAMP, attempts = attempts + 1
         WHERE id = $1`,
        [job.id]
      );
      
      const success = await this.executePlatformAPI(job);
      
      if (success) {
        await this.pool.query(
          `UPDATE sync_jobs 
           SET status = 'completed', completed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [job.id]
        );
        console.log(`✅ Job ${job.id} completed: ${job.job_type} → ${job.target_platform}`);
      } else {
        throw new Error('Platform API returned failure');
      }
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      
      const newAttempts = job.attempts + 1;
      const finalStatus = newAttempts >= job.max_attempts ? 'failed' : 'pending';
      
      await this.pool.query(
        `UPDATE sync_jobs 
         SET status = $1, error_message = $2
         WHERE id = $3`,
        [finalStatus, error.message, job.id]
      );
    }
  }

  async executePlatformAPI(job) {
    console.log(`🔄 Executing ${job.job_type} for ${job.target_platform}...`);
    
    const simulationDelay = Math.random() * 500 + 200;
    await new Promise(resolve => setTimeout(resolve, simulationDelay));
    
    const successRate = 0.95;
    const isSuccess = Math.random() < successRate;
    
    if (!isSuccess) {
      throw new Error(`Simulated API error for ${job.target_platform}`);
    }
    
    switch (job.job_type) {
      case 'block_date':
        console.log(`  ✅ Blocked date on ${job.target_platform}:`, job.payload);
        break;
      case 'unblock_date':
        console.log(`  ✅ Unblocked date on ${job.target_platform}:`, job.payload);
        break;
      case 'update_price':
        console.log(`  ✅ Updated price on ${job.target_platform}:`, job.payload);
        break;
      default:
        console.log(`  ⚠️  Unknown job type: ${job.job_type}`);
    }
    
    return true;
  }

  async getJobStats() {
    const result = await this.pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM sync_jobs
      GROUP BY status
    `);
    
    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };
    
    result.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
    });
    
    return stats;
  }

  async getRecentJobs(limit = 50) {
    const result = await this.pool.query(
      `SELECT * FROM sync_jobs 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async retryFailedJobs() {
    const result = await this.pool.query(
      `UPDATE sync_jobs 
       SET status = 'pending', attempts = 0, error_message = NULL
       WHERE status = 'failed'
       RETURNING *`
    );
    console.log(`🔄 Retrying ${result.rows.length} failed jobs`);
    return result.rows;
  }
}

module.exports = SyncJobsWorker;
