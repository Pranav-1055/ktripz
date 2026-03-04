const logger = require('../utils/logger');

class MetricsService {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.timers = new Map();
    
    // Initialize default metrics
    this.initializeDefaultMetrics();
    
    // Start metrics collection interval
    this.startMetricsCollection();
  }

  initializeDefaultMetrics() {
    // HTTP request metrics
    this.counters.set('http_requests_total', 0);
    this.counters.set('http_requests_success', 0);
    this.counters.set('http_requests_error', 0);
    
    // Business metrics
    this.counters.set('rides_created_total', 0);
    this.counters.set('bookings_created_total', 0);
    this.counters.set('bookings_confirmed_total', 0);
    this.counters.set('bookings_cancelled_total', 0);
    this.counters.set('payments_processed_total', 0);
    this.counters.set('payment_failures_total', 0);
    this.counters.set('booking_failures_total', 0);
    
    // System metrics
    this.gauges.set('active_users_total', 0);
    this.gauges.set('active_rides_total', 0);
    this.gauges.set('database_connections', 0);
    this.gauges.set('redis_connections', 0);
    
    // Performance metrics
    this.histograms.set('http_request_duration_seconds', []);
    this.histograms.set('search_request_duration_seconds', []);
    this.histograms.set('booking_request_duration_seconds', []);
    this.histograms.set('payment_request_duration_seconds', []);
  }

  // Counter methods
  incrementCounter(name, value = 1, labels = {}) {
    const key = this.getMetricKey(name, labels);
    const currentValue = this.counters.get(key) || 0;
    this.counters.set(key, currentValue + value);
    
    logger.metric(name, currentValue + value, { type: 'counter', labels });
  }

  // Gauge methods
  setGauge(name, value, labels = {}) {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, value);
    
    logger.metric(name, value, { type: 'gauge', labels });
  }

  incrementGauge(name, value = 1, labels = {}) {
    const key = this.getMetricKey(name, labels);
    const currentValue = this.gauges.get(key) || 0;
    this.gauges.set(key, currentValue + value);
    
    logger.metric(name, currentValue + value, { type: 'gauge', labels });
  }

  decrementGauge(name, value = 1, labels = {}) {
    const key = this.getMetricKey(name, labels);
    const currentValue = this.gauges.get(key) || 0;
    this.gauges.set(key, Math.max(0, currentValue - value));
    
    logger.metric(name, Math.max(0, currentValue - value), { type: 'gauge', labels });
  }

  // Histogram methods
  recordHistogram(name, value, labels = {}) {
    const key = this.getMetricKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    // Keep only last 1000 values to prevent memory issues
    if (values.length > 1000) {
      values.shift();
    }
    
    this.histograms.set(key, values);
    
    logger.metric(name, value, { type: 'histogram', labels });
  }

  // Timer methods
  startTimer(name, labels = {}) {
    const key = this.getMetricKey(name, labels);
    this.timers.set(key, Date.now());
    return key;
  }

  endTimer(timerKey) {
    const startTime = this.timers.get(timerKey);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.timers.delete(timerKey);
      
      // Extract metric name from key
      const metricName = timerKey.split('|')[0];
      this.recordHistogram(`${metricName}_duration_seconds`, duration / 1000);
      
      return duration;
    }
    return 0;
  }

  // Convenience method for timing operations
  async timeOperation(name, operation, labels = {}) {
    const timerKey = this.startTimer(name, labels);
    try {
      const result = await operation();
      const duration = this.endTimer(timerKey);
      logger.performance(name, duration, labels);
      return result;
    } catch (error) {
      this.endTimer(timerKey);
      this.incrementCounter(`${name}_errors_total`, 1, labels);
      throw error;
    }
  }

  // HTTP request tracking
  recordHttpRequest(method, path, statusCode, duration) {
    const labels = { method, path, status: statusCode.toString() };
    
    this.incrementCounter('http_requests_total', 1, labels);
    
    if (statusCode >= 200 && statusCode < 400) {
      this.incrementCounter('http_requests_success', 1, labels);
    } else if (statusCode >= 400) {
      this.incrementCounter('http_requests_error', 1, labels);
    }
    
    this.recordHistogram('http_request_duration_seconds', duration / 1000, labels);
  }

  // Business metrics
  recordRideCreated(driverId, origin, destination) {
    this.incrementCounter('rides_created_total');
    this.incrementGauge('active_rides_total');
    
    logger.metric('ride_created', 1, {
      driverId,
      origin,
      destination,
      timestamp: new Date().toISOString()
    });
  }

  recordBookingCreated(rideId, passengerId, seatsBooked) {
    this.incrementCounter('bookings_created_total');
    
    logger.metric('booking_created', 1, {
      rideId,
      passengerId,
      seatsBooked,
      timestamp: new Date().toISOString()
    });
  }

  recordBookingConfirmed(bookingId, amount) {
    this.incrementCounter('bookings_confirmed_total');
    
    logger.metric('booking_confirmed', amount, {
      bookingId,
      timestamp: new Date().toISOString()
    });
  }

  recordBookingCancelled(bookingId, reason) {
    this.incrementCounter('bookings_cancelled_total');
    
    logger.metric('booking_cancelled', 1, {
      bookingId,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  recordPaymentProcessed(paymentId, amount, method) {
    this.incrementCounter('payments_processed_total');
    
    logger.metric('payment_processed', amount, {
      paymentId,
      method,
      timestamp: new Date().toISOString()
    });
  }

  recordPaymentFailure(paymentId, error, amount) {
    this.incrementCounter('payment_failures_total');
    
    logger.metric('payment_failure', 1, {
      paymentId,
      error: error.message,
      amount,
      timestamp: new Date().toISOString()
    });
  }

  recordBookingFailure(error, context = {}) {
    this.incrementCounter('booking_failures_total');
    
    logger.metric('booking_failure', 1, {
      error: error.message,
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  // User activity tracking
  recordUserLogin(userId, method) {
    this.incrementGauge('active_users_total');
    
    logger.metric('user_login', 1, {
      userId,
      method,
      timestamp: new Date().toISOString()
    });
  }

  recordUserLogout(userId) {
    this.decrementGauge('active_users_total');
    
    logger.metric('user_logout', 1, {
      userId,
      timestamp: new Date().toISOString()
    });
  }

  // Search metrics
  recordSearchRequest(origin, destination, filters, resultCount, duration) {
    this.recordHistogram('search_request_duration_seconds', duration / 1000);
    
    logger.metric('search_request', resultCount, {
      origin,
      destination,
      filters: JSON.stringify(filters),
      resultCount,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  // System health metrics
  recordDatabaseConnection(count) {
    this.setGauge('database_connections', count);
  }

  recordRedisConnection(count) {
    this.setGauge('redis_connections', count);
  }

  // Get metrics for Prometheus endpoint
  getMetricsForPrometheus() {
    const lines = [];
    
    // Counters
    for (const [key, value] of this.counters) {
      const { name, labels } = this.parseMetricKey(key);
      const labelString = this.formatLabels(labels);
      lines.push(`${name}${labelString} ${value}`);
    }
    
    // Gauges
    for (const [key, value] of this.gauges) {
      const { name, labels } = this.parseMetricKey(key);
      const labelString = this.formatLabels(labels);
      lines.push(`${name}${labelString} ${value}`);
    }
    
    // Histograms (simplified - just average for now)
    for (const [key, values] of this.histograms) {
      if (values.length > 0) {
        const { name, labels } = this.parseMetricKey(key);
        const labelString = this.formatLabels(labels);
        
        // Calculate percentiles
        const sorted = [...values].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        
        lines.push(`${name}{${labels ? labels + ',' : ''}quantile="0.50"} ${p50}`);
        lines.push(`${name}{${labels ? labels + ',' : ''}quantile="0.95"} ${p95}`);
        lines.push(`${name}{${labels ? labels + ',' : ''}quantile="0.99"} ${p99}`);
      }
    }
    
    return lines.join('\n');
  }

  // Helper methods
  getMetricKey(name, labels = {}) {
    const labelString = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    return labelString ? `${name}|${labelString}` : name;
  }

  parseMetricKey(key) {
    const parts = key.split('|');
    const name = parts[0];
    const labels = parts[1] || '';
    return { name, labels };
  }

  formatLabels(labels) {
    return labels ? `{${labels}}` : '';
  }

  // Start periodic metrics collection
  startMetricsCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
    
    // Log metrics summary every 5 minutes
    setInterval(() => {
      this.logMetricsSummary();
    }, 300000);
  }

  collectSystemMetrics() {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.setGauge('nodejs_memory_heap_used_bytes', memUsage.heapUsed);
    this.setGauge('nodejs_memory_heap_total_bytes', memUsage.heapTotal);
    this.setGauge('nodejs_memory_external_bytes', memUsage.external);
    
    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.setGauge('nodejs_cpu_user_seconds_total', cpuUsage.user / 1000000);
    this.setGauge('nodejs_cpu_system_seconds_total', cpuUsage.system / 1000000);
    
    // Event loop lag (simplified)
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      this.recordHistogram('nodejs_eventloop_lag_seconds', lag / 1000);
    });
  }

  logMetricsSummary() {
    const summary = {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histogramCounts: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, values]) => [key, values.length])
      )
    };
    
    logger.info('Metrics Summary', { category: 'metrics', summary });
  }

  // Reset metrics (useful for testing)
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timers.clear();
    this.initializeDefaultMetrics();
  }
}

// Export singleton instance
module.exports = new MetricsService();