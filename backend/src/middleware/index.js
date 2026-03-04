const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Import auth middleware
const {
  authenticateToken,
  optionalAuth,
  requireRole,
  requirePassenger,
  requireProvider,
  requireAdmin,
} = require('./auth');

// Import validation and sanitization middleware
const {
  createValidationMiddleware,
  ValidationSchemas,
  DataSanitizer,
} = require('../utils/validation');

const {
  createRateLimiter,
  createSmartRateLimiter,
  createAbuseDetector,
  RateLimiters,
} = require('./rateLimiting');

const {
  sanitizeRequest,
  xssProtection,
  sqlInjectionProtection,
  sanitizeFileUpload,
  limitRequestSize,
  validateContentType,
} = require('./sanitization');

/**
 * Setup all middleware
 */
function setupMiddleware(app) {
  // Security middleware - applied early
  app.use(xssProtection());
  // SQL Injection protection disabled as it causes false positives with normal text 
  // and we use Firestore (NoSQL) which is not vulnerable to these specific SQL patterns.
  // app.use(sqlInjectionProtection());
  app.use(limitRequestSize('10mb'));

  // Content type validation for API routes
  app.use('/api/', validateContentType(['application/json', 'multipart/form-data']));

  // Request sanitization
  app.use(sanitizeRequest({
    sanitizeBody: true,
    sanitizeQuery: true,
    sanitizeParams: true,
    logSanitization: process.env.NODE_ENV === 'development',
  }));

  // Abuse detection
  app.use('/api/', createAbuseDetector());

  // Rate limiting middleware with smart detection
  app.use('/api/', RateLimiters.general);

  // Request logging middleware
  app.use((req, res, next) => {
    logger.http(`${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
  });

  // Request ID middleware for tracking
  app.use((req, res, next) => {
    req.requestId = Math.random().toString(36).substring(2, 15);
    res.setHeader('X-Request-ID', req.requestId);
    next();
  });
}

/**
 * Validation error handler middleware
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn(`Validation errors for request ${req.requestId}:`, errors.array());
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array(),
        timestamp: new Date().toISOString(),
      },
    });
  }
  next();
}

/**
 * Async error handler wrapper
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Standard API response helper
 */
function sendResponse(res, statusCode, data, message = null) {
  const response = {
    success: statusCode < 400,
    timestamp: new Date().toISOString(),
  };

  if (message) {
    response.message = message;
  }

  if (data) {
    response.data = data;
  }

  res.status(statusCode).json(response);
}

/**
 * Simple request validation middleware
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];

    // Validate required fields
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      // Check if required field is missing
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({ field, message: `${field} is required` });
        continue;
      }

      // Skip validation if field is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (rules.type === 'string' && typeof value !== 'string') {
        errors.push({ field, message: `${field} must be a string` });
      } else if (rules.type === 'number' && typeof value !== 'number') {
        errors.push({ field, message: `${field} must be a number` });
      } else if (rules.type === 'object' && typeof value !== 'object') {
        errors.push({ field, message: `${field} must be an object` });
      }

      // String length validation
      if (rules.type === 'string' && typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push({ field, message: `${field} must be at least ${rules.minLength} characters long` });
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters long` });
        }
      }

      // Number range validation
      if (rules.type === 'number' && typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push({ field, message: `${field} must be at least ${rules.min}` });
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push({ field, message: `${field} must be at most ${rules.max}` });
        }
      }

      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}` });
      }
    }

    if (errors.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input data', errors);
    }

    next();
  };
}

/**
 * Standard API error response helper
 */
function sendError(res, statusCode, code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  };

  if (details) {
    response.error.details = details;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  setupMiddleware,
  handleValidationErrors,
  validateRequest,
  asyncHandler,
  sendResponse,
  sendError,
  // Auth middleware
  authenticateToken,
  optionalAuth,
  requireRole,
  requirePassenger,
  requireProvider,
  requireAdmin,
  // Validation middleware
  createValidationMiddleware,
  ValidationSchemas,
  DataSanitizer,
  // Rate limiting middleware
  createRateLimiter,
  createSmartRateLimiter,
  RateLimiters,
  // Sanitization middleware
  sanitizeRequest,
  xssProtection,
  sqlInjectionProtection,
  sanitizeFileUpload,
  limitRequestSize,
  validateContentType,
};