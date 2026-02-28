const helmet = require('helmet');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Enhanced security headers middleware
 */
function enhancedSecurityHeaders() {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Allow inline styles for existing CSS
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com"
        ],
        scriptSrc: [
          "'self'",
          "https://api.olamaps.io",
          "https://checkout.razorpay.com",
          "https://js.stripe.com",
          "https://www.google.com/recaptcha/",
          "https://www.gstatic.com/recaptcha/"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "blob:"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "data:"
        ],
        connectSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://api.stripe.com",
          "https://api.olamaps.io",
          "https://nominatim.openstreetmap.org",
          "wss://localhost:*", // WebSocket connections
          "ws://localhost:*"
        ],
        frameSrc: [
          "'self'",
          "https://checkout.razorpay.com",
          "https://js.stripe.com",
          "https://www.google.com/recaptcha/"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },

    // HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    // X-Frame-Options
    frameguard: {
      action: 'deny',
    },

    // X-Content-Type-Options
    noSniff: true,

    // X-XSS-Protection
    xssFilter: true,

    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    // Permissions Policy
    permissionsPolicy: {
      features: {
        geolocation: ['self'],
        camera: ['self'],
        microphone: ['none'],
        payment: ['self'],
        usb: ['none'],
        magnetometer: ['none'],
        gyroscope: ['none'],
        accelerometer: ['none'],
      },
    },

    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: false, // Disable for compatibility

    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: {
      policy: 'same-origin-allow-popups',
    },

    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  });
}

/**
 * CORS configuration with enhanced security
 */
function enhancedCorsConfig() {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    ...(process.env.CORS_ORIGIN?.split(',') || []),
  ];

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Debug logging for CORS
      logger.info(`CORS Checking origin: ${origin}`);
      logger.info(`Allowed origins: ${allowedOrigins.join(', ')}`);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked request from origin: ${origin}`);
        callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Request-ID',
      'X-API-Key',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 86400, // 24 hours
  };
}

/**
 * Request fingerprinting for security monitoring
 */
function requestFingerprinting() {
  return (req, res, next) => {
    // Generate request fingerprint
    const fingerprint = crypto
      .createHash('sha256')
      .update(
        [
          req.ip,
          req.get('User-Agent') || '',
          req.get('Accept-Language') || '',
          req.get('Accept-Encoding') || '',
        ].join('|')
      )
      .digest('hex')
      .substring(0, 16);

    req.fingerprint = fingerprint;

    // Log suspicious patterns
    if (req.get('User-Agent')?.includes('bot') ||
      req.get('User-Agent')?.includes('crawler') ||
      req.get('User-Agent')?.includes('spider')) {
      logger.info(`Bot detected: ${req.get('User-Agent')} from ${req.ip}`);
    }

    next();
  };
}

/**
 * API key validation middleware
 */
function validateApiKey() {
  return (req, res, next) => {
    // Skip API key validation for public endpoints
    const publicEndpoints = [
      '/health',
      '/api/auth/login',
      '/api/auth/register',
      '/api/search/cities',
    ];

    if (publicEndpoints.some(endpoint => req.path.startsWith(endpoint))) {
      return next();
    }

    const apiKey = req.get('X-API-Key');
    const validApiKeys = process.env.API_KEYS?.split(',') || [];

    if (!apiKey && req.path.startsWith('/api/')) {
      // For now, we'll make API key optional but log missing keys
      logger.warn(`Missing API key for ${req.method} ${req.path} from ${req.ip}`);
    }

    if (apiKey && !validApiKeys.includes(apiKey)) {
      logger.warn(`Invalid API key attempt from ${req.ip}: ${apiKey}`);
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key',
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
}

/**
 * Request timing attack protection
 */
function timingAttackProtection() {
  return (req, res, next) => {
    const startTime = Date.now();

    // Add random delay to prevent timing attacks
    const randomDelay = Math.floor(Math.random() * 50); // 0-50ms

    res.on('finish', () => {
      const processingTime = Date.now() - startTime;

      // Log unusually fast or slow requests
      if (processingTime < 10) {
        logger.warn(`Unusually fast request: ${req.method} ${req.path} - ${processingTime}ms`);
      } else if (processingTime > 5000) {
        logger.warn(`Slow request: ${req.method} ${req.path} - ${processingTime}ms`);
      }
    });

    setTimeout(() => next(), randomDelay);
  };
}

/**
 * Honeypot middleware to detect bots
 */
function honeypot() {
  return (req, res, next) => {
    // Check for honeypot field in forms
    if (req.body && req.body.honeypot) {
      logger.warn(`Honeypot triggered from ${req.ip} - likely bot`);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid form submission',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check for suspicious bot patterns in URL
    const suspiciousPatterns = [
      '/wp-admin',
      '/admin',
      '/.env',
      '/config',
      '/phpmyadmin',
      '/xmlrpc.php',
      '/wp-login.php',
    ];

    const isOptionsRequest = req.method === 'OPTIONS';
    const isAdminApi = req.path.startsWith('/api/admin');

    if (!isOptionsRequest && !isAdminApi && suspiciousPatterns.some(pattern => req.path.includes(pattern))) {
      logger.warn(`Suspicious path access from ${req.ip}: ${req.path}`);
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
}

/**
 * Secure session configuration
 */
function secureSessionConfig() {
  return {
    name: 'tripo.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true, // Prevent XSS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict', // CSRF protection
    },
    rolling: true, // Reset expiration on activity
  };
}

/**
 * IP whitelist/blacklist middleware
 */
function ipFiltering() {
  const blacklistedIPs = new Set(process.env.BLACKLISTED_IPS?.split(',') || []);
  const whitelistedIPs = new Set(process.env.WHITELISTED_IPS?.split(',') || []);

  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;

    // Check blacklist
    if (blacklistedIPs.has(clientIP)) {
      logger.warn(`Blocked request from blacklisted IP: ${clientIP}`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'IP_BLOCKED',
          message: 'Access denied',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // If whitelist is configured, only allow whitelisted IPs for admin routes
    if (req.path.startsWith('/api/admin') && whitelistedIPs.size > 0) {
      if (!whitelistedIPs.has(clientIP)) {
        logger.warn(`Admin access denied for non-whitelisted IP: ${clientIP}`);
        return res.status(403).json({
          success: false,
          error: {
            code: 'IP_NOT_WHITELISTED',
            message: 'Access denied',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    next();
  };
}

/**
 * Request size and complexity limits
 */
function requestLimits() {
  return (req, res, next) => {
    // Limit URL length
    if (req.url.length > 2048) {
      logger.warn(`URL too long from ${req.ip}: ${req.url.length} characters`);
      return res.status(414).json({
        success: false,
        error: {
          code: 'URL_TOO_LONG',
          message: 'Request URL too long',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Limit number of headers
    const headerCount = Object.keys(req.headers).length;
    if (headerCount > 50) {
      logger.warn(`Too many headers from ${req.ip}: ${headerCount}`);
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_HEADERS',
          message: 'Too many request headers',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Limit query parameter complexity
    const queryString = req.url.split('?')[1];
    if (queryString && queryString.length > 1024) {
      logger.warn(`Query string too long from ${req.ip}: ${queryString.length} characters`);
      return res.status(400).json({
        success: false,
        error: {
          code: 'QUERY_TOO_COMPLEX',
          message: 'Query parameters too complex',
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
}

module.exports = {
  enhancedSecurityHeaders,
  enhancedCorsConfig,
  requestFingerprinting,
  validateApiKey,
  timingAttackProtection,
  honeypot,
  secureSessionConfig,
  ipFiltering,
  requestLimits,
};