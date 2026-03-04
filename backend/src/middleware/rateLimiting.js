const rateLimit = require('express-rate-limit');
const { RateLimitConfigs } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * Create rate limiter with custom configuration
 */
function createRateLimiter(config, customHandler = null) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: config.message,
        timestamp: new Date().toISOString(),
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: customHandler || ((req, res) => {
      logger.warn(`Rate limit exceeded for ${req.method} ${req.originalUrl} - IP: ${req.ip}, User: ${req.user?.uid || 'anonymous'}`);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: config.message,
          timestamp: new Date().toISOString(),
        },
      });
    }),
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user?.uid || req.ip;
    },
  });
}

/**
 * Enhanced rate limiter that considers user authentication status
 */
function createSmartRateLimiter(config) {
  return rateLimit({
    windowMs: config.windowMs,
    max: (req) => {
      // Authenticated users get higher limits
      if (req.user) {
        return Math.floor(config.max * 1.5);
      }
      return config.max;
    },
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: config.message,
        timestamp: new Date().toISOString(),
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const userInfo = req.user ? `User: ${req.user.uid}` : `IP: ${req.ip}`;
      logger.warn(`Smart rate limit exceeded for ${req.method} ${req.originalUrl} - ${userInfo}`);

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: config.message,
          retryAfter: Math.ceil(config.windowMs / 1000),
          timestamp: new Date().toISOString(),
        },
      });
    },
    keyGenerator: (req) => {
      return req.user?.uid || req.ip;
    },
  });
}

/**
 * Abuse detection middleware
 */
function createAbuseDetector() {
  const suspiciousActivity = new Map();

  return (req, res, next) => {
    const identifier = req.user?.uid || req.ip;
    const now = Date.now();

    // Clean old entries (older than 1 hour)
    for (const [key, data] of suspiciousActivity.entries()) {
      if (now - data.firstSeen > 60 * 60 * 1000) {
        suspiciousActivity.delete(key);
      }
    }

    // Track suspicious patterns
    if (!suspiciousActivity.has(identifier)) {
      suspiciousActivity.set(identifier, {
        firstSeen: now,
        requests: 1,
        endpoints: new Set([req.originalUrl]),
        userAgents: new Set([req.get('User-Agent')]),
      });
    } else {
      const activity = suspiciousActivity.get(identifier);
      activity.requests++;
      activity.endpoints.add(req.originalUrl);
      activity.userAgents.add(req.get('User-Agent'));

      // Detect potential abuse patterns
      const timeWindow = now - activity.firstSeen;
      const requestRate = activity.requests / (timeWindow / 1000); // requests per second

      // Flag suspicious activity
      if (
        requestRate > 100 || // More than 100 requests per second
        activity.endpoints.size > 50 || // Accessing too many different endpoints
        activity.userAgents.size > 5 // Multiple user agents (potential bot)
      ) {
        logger.warn(`Suspicious activity detected for ${identifier}:`, {
          requests: activity.requests,
          timeWindow: timeWindow / 1000,
          requestRate,
          endpoints: activity.endpoints.size,
          userAgents: activity.userAgents.size,
        });

        // Block the request
        return res.status(429).json({
          success: false,
          error: {
            code: 'SUSPICIOUS_ACTIVITY_DETECTED',
            message: 'Suspicious activity detected. Please contact support if you believe this is an error.',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    next();
  };
}

/**
 * Progressive rate limiting - increases restrictions for repeated violations
 */
function createProgressiveRateLimiter(baseConfig) {
  const violations = new Map();

  return rateLimit({
    windowMs: baseConfig.windowMs,
    max: (req) => {
      const identifier = req.user?.uid || req.ip;
      const violationCount = violations.get(identifier) || 0;

      // Reduce limit based on violation history
      const reductionFactor = Math.max(0.1, 1 - (violationCount * 0.2));
      return Math.floor(baseConfig.max * reductionFactor);
    },
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: baseConfig.message,
        timestamp: new Date().toISOString(),
      },
    },
    handler: (req, res) => {
      const identifier = req.user?.uid || req.ip;
      const currentViolations = violations.get(identifier) || 0;
      violations.set(identifier, currentViolations + 1);

      // Clean up old violations (reset after 24 hours)
      setTimeout(() => {
        const current = violations.get(identifier) || 0;
        if (current > 0) {
          violations.set(identifier, current - 1);
        }
      }, 24 * 60 * 60 * 1000);

      logger.warn(`Progressive rate limit exceeded for ${identifier} (violations: ${currentViolations + 1})`);

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: baseConfig.message,
          violations: currentViolations + 1,
          timestamp: new Date().toISOString(),
        },
      });
    },
    keyGenerator: (req) => req.user?.uid || req.ip,
  });
}

// Pre-configured rate limiters for different endpoint types
const RateLimiters = {
  // General API rate limiter
  general: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later',
  }),

  // Authentication endpoints
  auth: createProgressiveRateLimiter(RateLimitConfigs.auth),

  // Booking endpoints
  booking: createSmartRateLimiter(RateLimitConfigs.booking),

  // Search endpoints
  search: createSmartRateLimiter(RateLimitConfigs.search),

  // Payment endpoints
  payment: createProgressiveRateLimiter(RateLimitConfigs.payment),

  // Messaging endpoints
  messaging: createRateLimiter(RateLimitConfigs.messaging),

  // File upload endpoints
  upload: createRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // 5 uploads per window
    message: 'Too many file uploads, please wait before uploading again',
  }),

  // Admin endpoints
  admin: createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // Higher limit for admin operations
    message: 'Too many admin requests, please slow down',
  }),
};

module.exports = {
  createRateLimiter,
  createSmartRateLimiter,
  createProgressiveRateLimiter,
  createAbuseDetector,
  RateLimiters,
};