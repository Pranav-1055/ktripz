const winston = require('winston');
const path = require('path');
const os = require('os');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  audit: 5,
  security: 6,
  compliance: 7,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
  audit: 'blue',
  security: 'red bold',
  compliance: 'cyan',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define format for logs with enhanced metadata
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    // Add system metadata for production monitoring
    const metadata = {
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      service: 'tripo-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      instanceId: process.env.INSTANCE_ID || os.hostname(),
      pid: process.pid,
      ...info
    };

    // Add request context if available
    if (info.requestId) {
      metadata.requestId = info.requestId;
    }
    if (info.userId) {
      metadata.userId = info.userId;
    }
    if (info.correlationId) {
      metadata.correlationId = info.correlationId;
    }

    return JSON.stringify(metadata);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, requestId, userId, ...meta } = info;
      let logMessage = `${timestamp} ${level}: ${message}`;

      if (requestId) logMessage += ` [req:${requestId}]`;
      if (userId) logMessage += ` [user:${userId}]`;

      if (Object.keys(meta).length > 0) {
        logMessage += ` ${JSON.stringify(meta)}`;
      }

      return logMessage;
    }
  )
);

// Ensure logs directory exists
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define which transports the logger must use
const transports = [
  // Console transport with development-friendly format
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? format : consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  })
];

// Only add file transports if not disabled (e.g. for testing or local dev conflict avoidance)
if (process.env.DISABLE_FILE_LOGGING !== 'true') {
  transports.push(
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: format,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: format,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Audit logs - separate file for compliance
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'audit',
      format: format,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),

    // Security logs - separate file for security events
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'security',
      format: format,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),

    // Compliance logs - separate file for data access tracking
    new winston.transports.File({
      filename: path.join(logsDir, 'compliance.log'),
      level: 'compliance',
      format: format,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
});

// Add custom logging methods
logger.audit = function (message, meta = {}) {
  this.log('audit', message, { ...meta, category: 'audit' });
};

logger.security = function (message, meta = {}) {
  this.log('security', message, { ...meta, category: 'security' });
};

logger.compliance = function (message, meta = {}) {
  this.log('compliance', message, { ...meta, category: 'compliance' });
};

// Performance logging
logger.performance = function (operation, duration, meta = {}) {
  this.info(`Performance: ${operation} completed in ${duration}ms`, {
    ...meta,
    category: 'performance',
    operation,
    duration,
    performanceMetric: true
  });
};

// Business metrics logging
logger.metric = function (metricName, value, tags = {}) {
  this.info(`Metric: ${metricName}`, {
    category: 'metric',
    metricName,
    value,
    tags,
    isMetric: true
  });
};

// Request logging with correlation ID
logger.request = function (req, res, duration) {
  const logData = {
    category: 'request',
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    duration,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    requestId: req.requestId,
    userId: req.user?.id,
    correlationId: req.correlationId
  };

  if (res.statusCode >= 400) {
    this.warn(`HTTP ${res.statusCode} ${req.method} ${req.originalUrl}`, logData);
  } else {
    this.info(`HTTP ${res.statusCode} ${req.method} ${req.originalUrl}`, logData);
  }
};

// Error logging with context
logger.errorWithContext = function (error, context = {}) {
  this.error(error.message, {
    category: 'error',
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    },
    ...context
  });
};

// Health check logging
logger.health = function (component, status, details = {}) {
  this.info(`Health Check: ${component} - ${status}`, {
    category: 'health',
    component,
    status,
    details,
    isHealthCheck: true
  });
};

module.exports = logger;