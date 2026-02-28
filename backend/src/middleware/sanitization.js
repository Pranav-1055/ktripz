const validator = require('validator');
const { DataSanitizer } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * Request sanitization middleware
 */
function sanitizeRequest(options = {}) {
  const {
    sanitizeBody = true,
    sanitizeQuery = true,
    sanitizeParams = true,
    logSanitization = false,
  } = options;

  return (req, res, next) => {
    try {
      const originalData = {};

      // Sanitize request body
      if (sanitizeBody && req.body) {
        if (logSanitization) {
          originalData.body = JSON.parse(JSON.stringify(req.body));
        }
        req.body = DataSanitizer.sanitizeObject(req.body);
      }

      // Sanitize query parameters
      if (sanitizeQuery && req.query) {
        if (logSanitization) {
          originalData.query = JSON.parse(JSON.stringify(req.query));
        }
        req.query = DataSanitizer.sanitizeObject(req.query);
      }

      // Sanitize URL parameters
      if (sanitizeParams && req.params) {
        if (logSanitization) {
          originalData.params = JSON.parse(JSON.stringify(req.params));
        }
        req.params = DataSanitizer.sanitizeObject(req.params);
      }

      // Log sanitization if enabled and changes were made
      if (logSanitization && Object.keys(originalData).length > 0) {
        const hasChanges = JSON.stringify(originalData) !== JSON.stringify({
          body: req.body,
          query: req.query,
          params: req.params,
        });

        if (hasChanges) {
          logger.info(`Request sanitized for ${req.method} ${req.originalUrl}`, {
            requestId: req.requestId,
            original: originalData,
            sanitized: {
              body: req.body,
              query: req.query,
              params: req.params,
            },
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Sanitization middleware error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'SANITIZATION_ERROR',
          message: 'Request processing error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

/**
 * XSS protection middleware
 */
function xssProtection() {
  return (req, res, next) => {
    // Set XSS protection headers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // Check for potential XSS in request data
    const checkForXSS = (obj, path = '') => {
      if (typeof obj === 'string') {
        // Check for common XSS patterns
        const xssPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /<iframe/gi,
          /<object/gi,
          /<embed/gi,
          /<link/gi,
          /<meta/gi,
        ];

        for (const pattern of xssPatterns) {
          if (pattern.test(obj)) {
            logger.warn(`Potential XSS detected in ${path}:`, obj);
            return true;
          }
        }
      } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          if (checkForXSS(value, `${path}.${key}`)) {
            return true;
          }
        }
      }
      return false;
    };

    // Check request body, query, and params for XSS
    const hasXSS =
      checkForXSS(req.body, 'body') ||
      checkForXSS(req.query, 'query') ||
      checkForXSS(req.params, 'params');

    if (hasXSS) {
      logger.warn(`XSS attempt blocked for ${req.method} ${req.originalUrl} from ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: {
          code: 'XSS_DETECTED',
          message: 'Potentially malicious content detected',
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
}

/**
 * SQL injection protection middleware
 */
function sqlInjectionProtection() {
  return (req, res, next) => {
    // Disabled due to false positives with address data
    next();
  };
}

/**
 * File upload sanitization middleware
 */
function sanitizeFileUpload() {
  return (req, res, next) => {
    if (req.files || req.file) {
      const files = req.files || [req.file];

      for (const file of files) {
        if (file) {
          // Sanitize filename
          file.originalname = validator.escape(file.originalname);

          // Check file type
          const allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
            'text/plain',
          ];

          if (!allowedMimeTypes.includes(file.mimetype)) {
            logger.warn(`Blocked file upload with invalid mime type: ${file.mimetype}`);
            return res.status(400).json({
              success: false,
              error: {
                code: 'INVALID_FILE_TYPE',
                message: 'File type not allowed',
                timestamp: new Date().toISOString(),
              },
            });
          }

          // Check file size (10MB limit)
          if (file.size > 10 * 1024 * 1024) {
            logger.warn(`Blocked file upload exceeding size limit: ${file.size} bytes`);
            return res.status(400).json({
              success: false,
              error: {
                code: 'FILE_TOO_LARGE',
                message: 'File size exceeds limit (10MB)',
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      }
    }

    next();
  };
}

/**
 * Request size limiting middleware
 */
function limitRequestSize(maxSize = '10mb') {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxSizeBytes = typeof maxSize === 'string'
      ? parseSize(maxSize)
      : maxSize;

    if (contentLength > maxSizeBytes) {
      logger.warn(`Request size limit exceeded: ${contentLength} bytes (limit: ${maxSizeBytes})`);
      return res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: 'Request size exceeds limit',
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
}

/**
 * Parse size string to bytes
 */
function parseSize(size) {
  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';

  return Math.floor(value * units[unit]);
}

/**
 * Content type validation middleware
 */
function validateContentType(allowedTypes = ['application/json']) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }

    const contentType = req.get('Content-Type');
    if (!contentType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONTENT_TYPE',
          message: 'Content-Type header is required',
          timestamp: new Date().toISOString(),
        },
      });
    }

    const isAllowed = allowedTypes.some(type =>
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isAllowed) {
      logger.warn(`Invalid content type: ${contentType}`);
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Content type not supported. Allowed: ${allowedTypes.join(', ')}`,
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
}

module.exports = {
  sanitizeRequest,
  xssProtection,
  sqlInjectionProtection,
  sanitizeFileUpload,
  limitRequestSize,
  validateContentType,
};