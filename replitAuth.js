// Replit Auth integration - Official blueprint implementation
// Reference: blueprint:javascript_log_in_with_replit

const client = require('openid-client');
const { Strategy } = require('openid-client/passport');
const passport = require('passport');
const session = require('express-session');
const memoize = require('memoizee');
const connectPg = require('connect-pg-simple');
const { Pool } = require('pg');

// Create PostgreSQL pool for auth
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Memoized OIDC configuration (cached for 1 hour)
const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL || 'https://replit.com/oidc'),
      process.env.REPL_ID
    );
  },
  { maxAge: 3600 * 1000 }
);

// Session configuration with PostgreSQL store
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: 'sessions',
  });
  
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

// Update user session with fresh tokens
function updateUserSession(user, tokens) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

// Insert or update user in database
async function upsertUser(claims) {
  await pool.query(`
    INSERT INTO users (id, email, first_name, last_name, profile_image_url)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) 
    DO UPDATE SET
      email = EXCLUDED.email,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      profile_image_url = EXCLUDED.profile_image_url,
      updated_at = CURRENT_TIMESTAMP
  `, [
    claims['sub'],
    claims['email'],
    claims['first_name'],
    claims['last_name'],
    claims['profile_image_url']
  ]);
}

// Setup authentication middleware and routes
async function setupAuth(app) {
  app.set('trust proxy', 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  // Verify function for passport strategy
  const verify = async (tokenSet, userinfo, done) => {
    try {
      const user = {};
      updateUserSession(user, tokenSet);
      await upsertUser(tokenSet.claims());
      done(null, user);
    } catch (error) {
      console.error('Error in verify callback:', error);
      done(error);
    }
  };

  // Helper to get or create strategy for a domain
  const strategies = new Map();
  const getStrategy = (domain) => {
    if (!strategies.has(domain)) {
      const strategy = new Strategy(
        {
          name: `replitauth:${domain}`,
          config,
          scope: 'openid email profile offline_access',
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      strategies.set(domain, strategy);
      console.log(`✅ Registered auth strategy for: ${domain}`);
    }
    return `replitauth:${domain}`;
  };

  // Serialize/deserialize user
  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user, cb) => cb(null, user));

  // Login route - following official blueprint pattern
  app.get('/api/login', (req, res, next) => {
    try {
      console.log(`🔐 Login attempt - hostname: ${req.hostname}`);
      const strategyName = getStrategy(req.hostname);
      passport.authenticate(strategyName, {
        prompt: 'login consent',
        scope: ['openid', 'email', 'profile', 'offline_access'],
      })(req, res, next);
    } catch (error) {
      console.error('❌ Login error:', error);
      res.status(500).send('Error during login: ' + error.message);
    }
  });

  // OAuth callback route - following official blueprint pattern
  app.get('/api/callback', (req, res, next) => {
    try {
      console.log(`🔙 Callback - hostname: ${req.hostname}, code: ${req.query.code ? 'present' : 'missing'}`);
      const strategyName = getStrategy(req.hostname);
      
      passport.authenticate(strategyName, {
        successReturnToOrRedirect: '/',
        failureRedirect: '/api/login',
      })(req, res, next);
    } catch (error) {
      console.error('❌ Callback error:', error);
      res.status(500).send('Error during callback: ' + error.message);
    }
  });

  // Logout route
  app.get('/api/logout', (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });

  // Get current user route
  app.get('/api/auth/user', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Failed to fetch user' });
    }
  });
}

// Middleware to protect authenticated routes
async function isAuthenticated(req, res, next) {
  const user = req.user;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // Token expired, try to refresh
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    console.error('Token refresh failed:', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

module.exports = {
  setupAuth,
  isAuthenticated,
  getSession
};
