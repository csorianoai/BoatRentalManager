// Temporary script to sync database schema with SSL
const fs = require('fs');
const { execSync } = require('child_process');

// Read current config
const config = JSON.parse(fs.readFileSync('drizzle.config.json', 'utf8'));

// Create temp config with SSL
const tempConfig = {
  ...config,
  dbCredentials: {
    ...config.dbCredentials,
    url: `${process.env.DATABASE_URL}?sslmode=require`
  }
};

// Write temp config
fs.writeFileSync('drizzle.config.temp.json', JSON.stringify(tempConfig, null, 2));

try {
  // Run drizzle-kit push with temp config
  console.log('🔄 Syncing database schema with SSL...');
  execSync('npx drizzle-kit push --config=drizzle.config.temp.json', {
    stdio: 'inherit'
  });
  console.log('✅ Database schema synced successfully!');
} catch (error) {
  console.error('❌ Failed to sync database schema');
  process.exit(1);
} finally {
  // Cleanup temp file
  if (fs.existsSync('drizzle.config.temp.json')) {
    fs.unlinkSync('drizzle.config.temp.json');
  }
}
