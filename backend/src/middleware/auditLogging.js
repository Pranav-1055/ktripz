const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Audit logging middleware for sensitive operations
 */
class AuditLogger {
  constructor() {
    this.sensitiveOperations = new Set([
      'POST /api/auth/login',
      'POST /api/auth/register',
      'POST /api/payments/initiate',
      'POST /api/payments/verify',
      'POST /api/bookings',
      'PUT /api/bookings/:id',
      'DELETE /api/bookings/:id',
      'POST /api/rides',
      'PUT /api/rides/:id',
      'DELETE /api/rides/:id',
      'PUT /api/users/:id',
      'POST /api/admin/*',
      'PUT /api/admin/*',
      'DELETE /api/admin/*',
    ]);

    this.dataClassifications = {
      PUBLIC: 'public',
      INTERNAL: 'internal',
      CONFIDENTIAL: 'confidential',
      RESTRICTED: 'restricted',
    };
  }

  /**
   * Check if operation requires audit logging
   */
  isSensitiveOperation(method, path) {
    const operation = `${method} ${path}`;
    
    // Check exact matches
    if (this.sensitiveOperations.has(operation)) {
      return true;
    }
    
    // Check pattern matches
    for (const pattern of this.sensitiveOperations) {
      if (pattern.includes('*') || pattern.includes(':')) {
        const regex = pattern
          .replace(/\*/g, '.*')
          .replace(/:[\w]+/g, '[^/]+');
        
        if (new RegExp(`^${regex}$`).test(operation)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Sanitize sensitive data for logging
   */
  sanitizeData(data, classification = this.dataClassifications.INTERNAL) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      'session',
      'ssn',
      'creditCard',
      'bankAccount',
      'cvv',
      'pin',
    ];

    const piiFields = [
      'email',
      'phone',
      'phoneNumber',
      'address',
      'location',
      'coordinates',
      'ip',
      'deviceId',
    ];

    const sanitized = JSON.parse(JSON.stringify(data));

    const sanitizeObject = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();

        // Always mask sensitive fields
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          obj[key] = '[REDACTED]';
          continue;
        }

        // Mask PII based on classification
        if (classification === this.dataClassifications.RESTRICTED ||
            classification === this.dataClassifications.CONFIDENTIAL) {
          if (piiFields.some(field => lowerKey.includes(field))) {
            if (typeof value === 'string') {
              obj[key] = this.maskString(value);
            } else {
              obj[key] = '[MASKED]';
            }
            continue;
          }
        }

        // Recursively sanitize nested objects
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          sanitizeObject(value, fieldPath);
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (item && typeof item === 'object') {
              sanitizeObject(item, `${fieldPath}[${index}]`);
            }
          });
        }
      }
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  /**
   * Mask string values (show first and last characters)
   */
  maskString(str) {
    if (!str || str.length <= 2) {
      return '[MASKED]';
    }
    
    if (str.length <= 6) {
      return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
    }
    
    return str.substring(0, 2) + '*'.repeat(str.length - 4) + str.substring(str.length - 2);
  }

  /**
   * Generate audit log entry
   */
  createAuditEntry(req, res, additionalData = {}) {
    const timestamp = new Date().toISOString();
    const eventId = crypto.randomUUID();
    
    const auditEntry = {
      eventId,
      timestamp,
      eventType: 'API_REQUEST',
      severity: this.getSeverityLevel(req.method, req.path),
      actor: {
        userId: req.user?.uid || null,
        userRole: req.user?.role || null,
        sessionId: req.sessionID || null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        fingerprint: req.fingerprint || null,
      },
      action: {
        method: req.method,
        path: req.path,
        originalUrl: req.originalUrl,
        operation: `${req.method} ${req.path}`,
      },
      resource: {
        type: this.getResourceType(req.path),
        id: this.extractResourceId(req.path, req.params),
      },
      request: {
        headers: this.sanitizeData(req.headers, this.dataClassifications.INTERNAL),
        query: this.sanitizeData(req.query, this.dataClassifications.CONFIDENTIAL),
        body: this.sanitizeData(req.body, this.dataClassifications.RESTRICTED),
        params: this.sanitizeData(req.params, this.dataClassifications.CONFIDENTIAL),
      },
      response: {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
      },
      metadata: {
        requestId: req.requestId,
        processingTime: Date.now() - req.startTime,
        environment: process.env.NODE_ENV,
        ...additionalData,
      },
    };

    return auditEntry;
  }

  /**
   * Get severity level based on operation
   */
  getSeverityLevel(method, path) {
    // Critical operations
    if (path.includes('/admin') || 
        path.includes('/payments') ||
        (method === 'DELETE' && !path.includes('/cache'))) {
      return 'CRITICAL';
    }

    // High severity operations
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      return 'HIGH';
    }

    // Medium severity for authentication
    if (path.includes('/auth')) {
      return 'MEDIUM';
    }

    // Low severity for read operations
    return 'LOW';
  }

  /**
   * Extract resource type from path
   */
  getResourceType(path) {
    const pathSegments = path.split('/').filter(Boolean);
    
    if (pathSegments.length >= 2 && pathSegments[0] === 'api') {
      return pathSegments[1]; // e.g., 'users', 'rides', 'bookings'
    }
    
    return 'unknown';
  }

  /**
   * Extract resource ID from path and params
   */
  extractResourceId(path, params) {
    // Look for ID in params
    if (params) {
      const idFields = ['id', 'userId', 'rideId', 'bookingId', 'vehicleId'];
      for (const field of idFields) {
        if (params[field]) {
          return params[field];
        }
      }
    }

    // Extract from path pattern
    const pathSegments = path.split('/');
    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i];
      // Look for UUID or MongoDB ObjectId patterns
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
          /^[0-9a-f]{24}$/i.test(segment)) {
        return segment;
      }
    }

    return null;
  }

  /**
   * Log audit entry
   */
  logAuditEntry(auditEntry) {
    // Log to structured logger
    logger.audit('Audit Log Entry', auditEntry);

    // For critical operations, also log to security logger
    if (auditEntry.severity === 'CRITICAL') {
      logger.security('Critical Operation Audit', {
        eventId: auditEntry.eventId,
        actor: auditEntry.actor,
        action: auditEntry.action,
        timestamp: auditEntry.timestamp,
      });
    }

    // In production, you might want to send to external audit system
    if (process.env.NODE_ENV === 'production' && process.env.AUDIT_WEBHOOK_URL) {
      this.sendToExternalAuditSystem(auditEntry);
    }
  }

  /**
   * Send audit entry to external system (placeholder)
   */
  async sendToExternalAuditSystem(auditEntry) {
    try {
      // This would integrate with external audit/SIEM systems
      // For now, just log that we would send it
      logger.info('Would send audit entry to external system', {
        eventId: auditEntry.eventId,
        severity: auditEntry.severity,
      });
    } catch (error) {
      logger.error('Failed to send audit entry to external system:', error);
    }
  }
}

// Create singleton instance
const auditLogger = new AuditLogger();

/**
 * Audit logging middleware
 */
function auditLogging(options = {}) {
  const {
    logAllRequests = false,
    logSensitiveOnly = true,
    includeResponseBody = false,
  } = options;

  return (req, res, next) => {
    req.startTime = Date.now();
    
    // Capture original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    
    let responseBody = null;

    // Override response methods to capture response data
    if (includeResponseBody) {
      res.send = function(body) {
        responseBody = body;
        return originalSend.call(this, body);
      };

      res.json = function(obj) {
        responseBody = obj;
        return originalJson.call(this, obj);
      };
    }

    // Log audit entry when response finishes
    res.on('finish', () => {
      const shouldLog = logAllRequests || 
                       auditLogger.isSensitiveOperation(req.method, req.path);

      if (shouldLog) {
        const additionalData = {};
        
        if (includeResponseBody && responseBody) {
          additionalData.responseBody = auditLogger.sanitizeData(
            responseBody, 
            auditLogger.dataClassifications.CONFIDENTIAL
          );
        }

        const auditEntry = auditLogger.createAuditEntry(req, res, additionalData);
        auditLogger.logAuditEntry(auditEntry);
      }
    });

    next();
  };
}

/**
 * Security event logging
 */
function logSecurityEvent(eventType, details, req = null) {
  const securityEvent = {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    severity: 'HIGH',
    details: auditLogger.sanitizeData(details, auditLogger.dataClassifications.INTERNAL),
    source: {
      ipAddress: req?.ip || 'system',
      userAgent: req?.get('User-Agent') || null,
      userId: req?.user?.uid || null,
    },
    environment: process.env.NODE_ENV,
  };

  logger.security('Security Event', securityEvent);
  
  // Send to external security monitoring if configured
  if (process.env.SECURITY_WEBHOOK_URL) {
    // Would integrate with security monitoring systems
    logger.info('Would send security event to monitoring system', {
      eventId: securityEvent.eventId,
      eventType,
    });
  }
}

/**
 * Compliance logging for data access
 */
function logDataAccess(dataType, operation, resourceId, req) {
  const complianceEvent = {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType: 'DATA_ACCESS',
    dataType,
    operation,
    resourceId,
    actor: {
      userId: req.user?.uid,
      userRole: req.user?.role,
      ipAddress: req.ip,
    },
    legalBasis: 'legitimate_interest', // Would be determined based on context
    purpose: 'service_provision',
    retention: '7_years',
  };

  logger.compliance('Data Access Log', complianceEvent);
}

module.exports = {
  AuditLogger,
  auditLogging,
  logSecurityEvent,
  logDataAccess,
  auditLogger, // Export singleton instance
};