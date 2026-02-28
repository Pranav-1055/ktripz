const metricsService = require('../services/metricsService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Request tracking middleware
const requestTracking = (req, res, next) => {
  // Add request ID for correlation
  req.requestId = uuidv4();
  req.startTime = Date.now();
  
  // Add correlation ID if not present
  req.correlationId = req.headers['x-correlation-id'] || req.requestId;
  
  // Set response headers
  res.set('X-Request-ID', req.requestId);
  res.set('X-Correlation-ID', req.correlationId);
  
  // Override res.json to capture response data
  const originalJson = res.json;
  res.json = function(data) {
    res.responseData = data;
    return originalJson.call(this, data);
  };
  
  // Track request start
  metricsService.incrementCounter('http_requests_total', 1, {
    method: req.method,
    endpoint: req.route?.path || req.path,
    status: 'started'
  });
  
  next();
};

// Response tracking middleware
const responseTracking = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Override send method
  res.send = function(data) {
    if (!res.headersSent) {
      recordRequestMetrics(req, res);
    }
    return originalSend.call(this, data);
  };
  
  // Override json method
  res.json = function(data) {
    if (!res.headersSent) {
      recordRequestMetrics(req, res);
    }
    return originalJson.call(this, data);
  };
  
  next();
};

// Record request metrics
function recordRequestMetrics(req, res) {
  const duration = Date.now() - req.startTime;
  const endpoint = req.route?.path || req.path;
  const method = req.method;
  const statusCode = res.statusCode;
  
  // Record HTTP metrics
  metricsService.recordHttpRequest(method, endpoint, statusCode, duration);
  
  // Log request with structured data
  logger.request(req, res, duration);
  
  // Record business metrics based on endpoint
  recordBusinessMetrics(req, res, endpoint, duration);
}

// Record business-specific metrics
function recordBusinessMetrics(req, res, endpoint, duration) {
  const statusCode = res.statusCode;
  const isSuccess = statusCode >= 200 && statusCode < 400;
  
  try {
    // Ride-related metrics
    if (endpoint.includes('/rides')) {
      if (req.method === 'POST' && isSuccess) {
        metricsService.recordRideCreated(
          req.user?.id,
          req.body?.origin?.city,
          req.body?.destination?.city
        );
      }
      
      if (endpoint.includes('/search')) {
        const resultCount = res.responseData?.rides?.length || 0;
        metricsService.recordSearchRequest(
          req.query?.origin,
          req.query?.destination,
          req.query,
          resultCount,
          duration
        );
      }
    }
    
    // Booking-related metrics
    if (endpoint.includes('/bookings')) {
      if (req.method === 'POST') {
        if (isSuccess) {
          metricsService.recordBookingCreated(
            req.body?.rideId,
            req.user?.id,
            req.body?.seatsBooked
          );
        } else {
          metricsService.recordBookingFailure(
            new Error(`Booking failed with status ${statusCode}`),
            {
              rideId: req.body?.rideId,
              userId: req.user?.id,
              statusCode
            }
          );
        }
      }
      
      if (req.method === 'PUT' && endpoint.includes('/confirm') && isSuccess) {
        metricsService.recordBookingConfirmed(
          req.params?.bookingId,
          req.body?.amount
        );
      }
      
      if (req.method === 'DELETE' && isSuccess) {
        metricsService.recordBookingCancelled(
          req.params?.bookingId,
          req.body?.reason || 'user_cancelled'
        );
      }
    }
    
    // Payment-related metrics
    if (endpoint.includes('/payments')) {
      if (req.method === 'POST') {
        if (isSuccess) {
          metricsService.recordPaymentProcessed(
            res.responseData?.paymentId,
            req.body?.amount,
            req.body?.method
          );
        } else {
          metricsService.recordPaymentFailure(
            res.responseData?.paymentId,
            new Error(`Payment failed with status ${statusCode}`),
            req.body?.amount
          );
        }
      }
    }
    
    // Authentication metrics
    if (endpoint.includes('/auth/login') && isSuccess) {
      metricsService.recordUserLogin(
        res.responseData?.user?.id,
        req.body?.method || 'email'
      );
    }
    
    if (endpoint.includes('/auth/logout') && isSuccess) {
      metricsService.recordUserLogout(req.user?.id);
    }
    
  } catch (error) {
    logger.error('Failed to record business metrics', {
      error: error.message,
      endpoint,
      method: req.method,
      statusCode
    });
  }
}

// Performance monitoring middleware
const performanceMonitoring = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Record performance metrics
    const endpoint = req.route?.path || req.path;
    metricsService.recordHistogram('http_request_duration_ms', duration, {
      method: req.method,
      endpoint,
      status: res.statusCode.toString()
    });
    
    // Log slow requests
    if (duration > 1000) { // Log requests slower than 1 second
      logger.warn('Slow request detected', {
        method: req.method,
        endpoint,
        duration,
        statusCode: res.statusCode,
        requestId: req.requestId,
        userId: req.user?.id
      });
    }
  });
  
  next();
};

// Error tracking middleware
const errorTracking = (error, req, res, next) => {
  // Record error metrics
  metricsService.incrementCounter('http_errors_total', 1, {
    method: req.method,
    endpoint: req.route?.path || req.path,
    errorType: error.name || 'UnknownError',
    statusCode: error.status || 500
  });
  
  // Log error with context
  logger.errorWithContext(error, {
    requestId: req.requestId,
    correlationId: req.correlationId,
    userId: req.user?.id,
    method: req.method,
    endpoint: req.route?.path || req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  next(error);
};

// Rate limiting metrics
const rateLimitingMetrics = (req, res, next) => {
  // Check if request was rate limited
  res.on('finish', () => {
    if (res.statusCode === 429) {
      metricsService.incrementCounter('rate_limit_exceeded_total', 1, {
        endpoint: req.route?.path || req.path,
        ip: req.ip
      });
      
      logger.warn('Rate limit exceeded', {
        endpoint: req.route?.path || req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId
      });
    }
  });
  
  next();
};

// Active connections tracking
let activeConnections = 0;

const connectionTracking = (req, res, next) => {
  activeConnections++;
  metricsService.setGauge('active_connections', activeConnections);
  
  res.on('finish', () => {
    activeConnections--;
    metricsService.setGauge('active_connections', activeConnections);
  });
  
  res.on('close', () => {
    activeConnections--;
    metricsService.setGauge('active_connections', activeConnections);
  });
  
  next();
};

module.exports = {
  requestTracking,
  responseTracking,
  performanceMonitoring,
  errorTracking,
  rateLimitingMetrics,
  connectionTracking
};