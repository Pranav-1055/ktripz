const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');
require('dotenv').config();

const { initializeFirebase } = require('./config/firebase');
const { initializeRedis } = require('./config/redis');
const { initializeSocket } = require('./config/socket');
const { setupMiddleware } = require('./middleware');
const { setupRoutes } = require('./routes');
const NotificationSchedulerService = require('./services/notificationSchedulerService');
const cacheWarmupService = require('./services/cacheWarmupService');
const firebaseOptimizationService = require('./services/firebaseOptimizationService');
const metricsService = require('./services/metricsService');
const healthCheckService = require('./services/healthCheckService');
const alertingService = require('./services/alertingService');
const logger = require('./utils/logger');

// Import enhanced security middleware
const {
  enhancedSecurityHeaders,
  requestFingerprinting,
  validateApiKey,
  timingAttackProtection,
  honeypot,
  ipFiltering,
  requestLimits,
} = require('./middleware/security');

const { auditLogging } = require('./middleware/auditLogging');

// Import metrics middleware
const {
  requestTracking,
  responseTracking,
  performanceMonitoring,
  errorTracking,
  rateLimitingMetrics,
  connectionTracking
} = require('./middleware/metricsMiddleware');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const isVercelRuntime = Boolean(process.env.VERCEL);

app.set('io', null);

function parseAllowedOrigins() {
  const envOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaults = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://tripo-travel.netlify.app',
  ];

  return Array.from(new Set([...defaults, ...envOrigins]));
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  // Allow Netlify preview/production URLs to avoid breakage on new deploy subdomains
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(origin)) return true;

  // Allow common localhost dev origins
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;

  // Allow Vercel preview/production URLs
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;

  return false;
}

// ─── CORS middleware applied at MODULE LEVEL ───────────────────────────────────
// This MUST be before module.exports so that Vercel's serverless runtime
// has CORS configured on the app immediately when it imports this module.
// Previously CORS was inside async startServer(), causing a race condition
// where the first request could arrive before CORS middleware was registered.
const allowedOrigins = parseAllowedOrigins();
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
    logger.warn(`CORS blocked request from origin: ${origin}`);
    return callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Enhanced security middleware
app.use(enhancedSecurityHeaders());
app.use(requestLimits());
app.use(ipFiltering());
app.use(honeypot());
app.use(requestFingerprinting());
app.use(timingAttackProtection());

// Monitoring middleware
app.use(connectionTracking);
app.use(requestTracking);
app.use(performanceMonitoring);
app.use(rateLimitingMetrics);

// Audit logging for sensitive operations
app.use(auditLogging({
  logSensitiveOnly: true,
  includeResponseBody: false,
}));

// API key validation
app.use(validateApiKey());

app.use(compression());

app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Response tracking middleware (after body parsing)
app.use(responseTracking);

// Serve static files for demo
app.use('/demo', express.static('public'));
// Serve uploads directory (ensure skipped on Vercel read-only FS)
const uploadsPath = require('path').join(process.cwd(), 'uploads');
try {
  if (!require('fs').existsSync(uploadsPath)) {
    require('fs').mkdirSync(uploadsPath, { recursive: true });
  }
} catch (e) {
  logger.warn('Could not create uploads directory (expected on serverless read-only filesystems)');
}
app.use('/uploads', express.static(uploadsPath));

// Setup custom middleware
setupMiddleware(app);

// Setup API routes
setupRoutes(app);

// Health and monitoring endpoints
const healthRoutes = require('./routes/health');
app.use('/', healthRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString(),
    },
  });
});

// Global error handler with metrics
app.use(errorTracking);
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'Something went wrong'
        : err.message,
      timestamp: new Date().toISOString(),
    },
  });
});

async function startServer() {
  try {
    // Initialize Firebase Admin SDK
    await initializeFirebase();
    logger.info('Firebase Admin SDK initialized successfully');

    // Initialize Redis connection
    const redisResult = await initializeRedis();
    if (redisResult) {
      logger.info('Redis connection established successfully');
    } else {
      logger.info('Redis not available, continuing without cache');
    }

    if (!isVercelRuntime) {
      const io = initializeSocket(server);
      logger.info('Socket.io server initialized successfully');

      app.set('io', io);

      NotificationSchedulerService.initialize();
      logger.info('Notification scheduler initialized successfully');
    } else {
      logger.info('Skipping Socket.io and background schedulers in Vercel runtime');
    }

    // Initialize cache warmup service
    // cacheWarmupService.initialize();
    // logger.info('Cache warmup service initialized successfully');

    // Initialize monitoring services
    logger.info('Metrics service initialized successfully');
    logger.info('Health check service initialized successfully');
    logger.info('Alerting service initialized successfully');

    // Setup periodic cache cleanup
    if (!isVercelRuntime) {
      setInterval(() => {
        firebaseOptimizationService.cleanupInMemoryCache();
      }, 300000);
    }

    // Only start server if not in test environment AND not on Vercel
    if (process.env.NODE_ENV !== 'test' && !isVercelRuntime) {
      server.listen(PORT, () => {
        logger.info(`TripO Backend API server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
        logger.info(`Health check available at: http://localhost:${PORT}/health`);
        logger.info(`WebSocket server ready for connections`);
      });
    }

  } catch (error) {
    logger.error('Failed to start server components:', error);
    // Do NOT exit the process on Vercel — we still want the Express app to handle requests
    // even if some background components (like Redis) failed to start.
    if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
      // Only exit if we are NOT on Vercel
      // process.exit(1);
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');

    // Close database connections, cleanup resources, etc.
    // Add cleanup code here

    if (!process.env.VERCEL) process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    if (!process.env.VERCEL) process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');

  server.close(() => {
    logger.info('HTTP server closed');
    if (!process.env.VERCEL) process.exit(0);
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    if (!process.env.VERCEL) process.exit(1);
  }, 30000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);

  // Record critical error metric
  metricsService.incrementCounter('uncaught_exceptions_total', 1);

  // Graceful shutdown only if not serverless
  if (!process.env.VERCEL) process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);

  // Record critical error metric
  metricsService.incrementCounter('unhandled_rejections_total', 1);

  // Graceful shutdown only if not serverless
  if (!process.env.VERCEL) process.exit(1);
});

// Initialize server setup
startServer();

module.exports = app;
