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
  enhancedCorsConfig,
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

    // Initialize Socket.io server
    const io = initializeSocket(server);
    logger.info('Socket.io server initialized successfully');

    // Make io available to routes
    app.set('io', io);

    // Initialize notification scheduler
    NotificationSchedulerService.initialize();
    logger.info('Notification scheduler initialized successfully');

    // Initialize cache warmup service
    // cacheWarmupService.initialize();
    // logger.info('Cache warmup service initialized successfully');

    // Initialize monitoring services
    logger.info('Metrics service initialized successfully');
    logger.info('Health check service initialized successfully');
    logger.info('Alerting service initialized successfully');

    // Setup periodic cache cleanup
    setInterval(() => {
      firebaseOptimizationService.cleanupInMemoryCache();
    }, 300000); // Every 5 minutes

    // CORS middleware - applied early to handle preflight requests
    app.use(cors(enhancedCorsConfig()));

    // Enhanced security middleware - applied after CORS
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
    // Serve uploads directory
    // Ensure the path is absolute and verify existence
    const uploadsPath = require('path').join(process.cwd(), 'uploads');
    if (!require('fs').existsSync(uploadsPath)) {
      require('fs').mkdirSync(uploadsPath, { recursive: true });
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

    // Only start server if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      server.listen(PORT, () => {
        logger.info(`TripO Backend API server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
        logger.info(`Health check available at: http://localhost:${PORT}/health`);
        logger.info(`WebSocket server ready for connections`);
      });
    }

  } catch (error) {
    logger.error('Failed to start server:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
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

    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);

  // Record critical error metric
  metricsService.incrementCounter('uncaught_exceptions_total', 1);

  // Graceful shutdown
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);

  // Record critical error metric
  metricsService.incrementCounter('unhandled_rejections_total', 1);

  // Graceful shutdown
  process.exit(1);
});

// Initialize server setup
startServer();

module.exports = app;

// Force restart 6
console.log('Server updated and restarted at', new Date().toISOString());