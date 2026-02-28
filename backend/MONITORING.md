# TripO Monitoring and Logging Guide

This guide covers the comprehensive monitoring and logging setup for the TripO BlaBlaCar-like ride-sharing backend API.

## Overview

The monitoring stack includes:

- **Structured Logging**: Winston-based logging with multiple log levels and outputs
- **Metrics Collection**: Custom metrics service with Prometheus-compatible output
- **Health Checks**: Comprehensive health monitoring for all system components
- **Alerting**: Rule-based alerting system with multiple notification channels
- **Performance Monitoring**: Request tracking, response times, and system resources
- **Business Metrics**: Ride, booking, payment, and user activity tracking

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │───▶│  Metrics        │───▶│   Prometheus    │
│   (Node.js)     │    │  Service        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Structured    │    │  Health Check   │    │    Grafana      │
│   Logging       │    │  Service        │    │   Dashboard     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Log Files     │    │   Alerting      │    │   Monitoring    │
│   (JSON)        │    │   Service       │    │   Dashboards    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Logging System

### Log Levels

- **error**: Application errors and exceptions
- **warn**: Warning conditions and slow requests
- **info**: General application information
- **http**: HTTP request/response logging
- **debug**: Detailed debugging information
- **audit**: Security and compliance events
- **security**: Security-related events
- **compliance**: Data access and privacy events

### Log Files

All logs are stored in the `./logs/` directory:

- `combined.log`: All log levels
- `error.log`: Error level and above
- `audit.log`: Audit events for compliance
- `security.log`: Security-related events
- `compliance.log`: Data access tracking

### Log Format

Logs are structured in JSON format with the following fields:

```json
{
  "timestamp": "2024-01-09T14:30:00.000Z",
  "level": "info",
  "message": "HTTP 200 GET /api/rides",
  "service": "tripo-backend",
  "version": "1.0.0",
  "environment": "production",
  "instanceId": "api-1",
  "pid": 1234,
  "requestId": "req-uuid-here",
  "userId": "user-id-here",
  "correlationId": "correlation-uuid-here",
  "category": "request",
  "method": "GET",
  "url": "/api/rides",
  "statusCode": 200,
  "duration": 150,
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.100"
}
```

### Custom Logging Methods

```javascript
const logger = require('./utils/logger');

// Standard logging
logger.info('Application started');
logger.error('Database connection failed', { error: error.message });

// Performance logging
logger.performance('database_query', 250, { query: 'SELECT * FROM rides' });

// Business metrics
logger.metric('ride_created', 1, { origin: 'Paris', destination: 'Lyon' });

// Request logging (automatic via middleware)
logger.request(req, res, duration);

// Error with context
logger.errorWithContext(error, { userId, requestId });

// Health checks
logger.health('database', 'healthy', { responseTime: 50 });

// Audit logging
logger.audit('User login', { userId, ip, userAgent });

// Security events
logger.security('Failed login attempt', { ip, attempts: 3 });

// Compliance events
logger.compliance('User data accessed', { userId, dataType: 'profile' });
```

## Metrics Collection

### Metric Types

1. **Counters**: Monotonically increasing values
   - `http_requests_total`
   - `rides_created_total`
   - `bookings_confirmed_total`
   - `payments_processed_total`

2. **Gauges**: Current state values
   - `active_users_total`
   - `active_rides_total`
   - `database_connections`
   - `memory_usage_bytes`

3. **Histograms**: Distribution of values
   - `http_request_duration_seconds`
   - `search_request_duration_seconds`
   - `payment_request_duration_seconds`

### Business Metrics

```javascript
const metricsService = require('./services/metricsService');

// Record business events
metricsService.recordRideCreated(driverId, origin, destination);
metricsService.recordBookingCreated(rideId, passengerId, seatsBooked);
metricsService.recordPaymentProcessed(paymentId, amount, method);
metricsService.recordSearchRequest(origin, destination, filters, resultCount, duration);

// User activity
metricsService.recordUserLogin(userId, method);
metricsService.recordUserLogout(userId);

// Performance timing
const timer = metricsService.startTimer('database_query');
// ... perform operation
const duration = metricsService.endTimer(timer);

// Or use convenience method
const result = await metricsService.timeOperation('api_call', async () => {
  return await apiCall();
});
```

### System Metrics

Automatically collected:
- Node.js memory usage (heap, external, RSS)
- CPU usage (user, system time)
- Event loop lag
- Active connections
- Request rates and response times

## Health Checks

### Health Check Types

1. **Database Connectivity**: MongoDB connection status
2. **Redis Connectivity**: Redis connection and response time
3. **External Services**: Firebase, payment gateways, etc.
4. **System Resources**: Memory, CPU usage
5. **Application Health**: Core functionality tests

### Health Endpoints

- `GET /health` - Simple health status (for load balancers)
- `GET /health/detailed` - Comprehensive health report
- `GET /health/:checkName` - Individual health check
- `GET /ready` - Readiness probe (Kubernetes)
- `GET /live` - Liveness probe (Kubernetes)

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-09T14:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "instanceId": "api-1",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection is healthy",
      "responseTime": 15,
      "timestamp": "2024-01-09T14:30:00.000Z"
    },
    "redis": {
      "status": "healthy",
      "message": "Redis connection is healthy",
      "responseTime": 5,
      "timestamp": "2024-01-09T14:30:00.000Z"
    }
  },
  "summary": {
    "total": 5,
    "healthy": 4,
    "unhealthy": 0,
    "warning": 1,
    "duration": 125
  }
}
```

## Alerting System

### Alert Rules

Pre-configured alert rules:

1. **High Error Rate**: HTTP error rate > 5%
2. **High Response Time**: 95th percentile > 2 seconds
3. **High Memory Usage**: Memory usage > 85%
4. **Payment Failure Rate**: Payment failures > 2%
5. **Booking Failure Rate**: Booking failures > 5%
6. **Database Connection Issues**: No database connections
7. **Redis Connection Issues**: No Redis connections

### Alert Channels

- **Log**: Write to alert log file
- **Webhook**: HTTP POST to configured webhook URL
- **Email**: Send email notification (requires configuration)
- **Slack**: Send Slack message (requires webhook URL)

### Alert Configuration

```javascript
// Environment variables for alerting
ALERT_WEBHOOK_URL=https://your-webhook-url.com/alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### Custom Alert Rules

```javascript
const alertingService = require('./services/alertingService');

// Add custom alert rule
alertingService.addAlertRule('custom_metric_alert', {
  name: 'Custom Metric Alert',
  description: 'Custom business metric threshold exceeded',
  severity: 'warning',
  condition: (metrics) => {
    const customMetric = metrics.get('custom_metric_total') || 0;
    return customMetric > 100;
  },
  cooldown: 300000, // 5 minutes
  actions: ['log', 'webhook']
});
```

## Monitoring Dashboards

### Grafana Dashboards

Access Grafana at `http://localhost:3001` (production) with:
- Username: `admin`
- Password: Set via `GRAFANA_ADMIN_PASSWORD` environment variable

### Pre-configured Dashboards

1. **TripO Overview**: High-level application metrics
2. **System Resources**: CPU, memory, disk usage
3. **HTTP Requests**: Request rates, response times, error rates
4. **Business Metrics**: Rides, bookings, payments
5. **Database Performance**: Connection pools, query times
6. **Error Tracking**: Error rates, types, trends

### Prometheus Metrics

Access Prometheus at `http://localhost:9090` for:
- Raw metrics exploration
- Query testing
- Alert rule validation

## Performance Monitoring

### Request Tracking

Every HTTP request is automatically tracked with:
- Request ID and correlation ID
- Response time and status code
- User information (if authenticated)
- Request/response size
- User agent and IP address

### Slow Request Detection

Requests slower than 1 second are automatically logged as warnings:

```json
{
  "level": "warn",
  "message": "Slow request detected",
  "method": "GET",
  "endpoint": "/api/rides/search",
  "duration": 1250,
  "statusCode": 200,
  "requestId": "req-uuid-here",
  "userId": "user-id-here"
}
```

### Performance Optimization

Monitor these key metrics:
- 95th percentile response time < 1 second
- Error rate < 1%
- Memory usage < 80%
- CPU usage < 70%
- Database connection pool utilization < 80%

## Log Analysis

### Structured Query Examples

Using tools like `jq` to analyze JSON logs:

```bash
# Find all errors in the last hour
cat logs/combined.log | jq 'select(.level == "error" and (.timestamp | fromdateiso8601) > (now - 3600))'

# Count requests by endpoint
cat logs/combined.log | jq -r 'select(.category == "request") | .endpoint' | sort | uniq -c

# Find slow requests
cat logs/combined.log | jq 'select(.duration > 1000)'

# Security events analysis
cat logs/security.log | jq 'select(.level == "security")'

# Payment failures
cat logs/combined.log | jq 'select(.metricName == "payment_failure")'
```

### Log Rotation

Logs are automatically rotated when they reach:
- Combined logs: 5MB, keep 5 files
- Error logs: 5MB, keep 5 files
- Audit logs: 10MB, keep 10 files
- Security logs: 10MB, keep 10 files

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```bash
   # Check memory metrics
   curl http://localhost:3000/metrics | grep nodejs_memory
   
   # Check detailed health
   curl http://localhost:3000/health/detailed
   ```

2. **Database Connection Issues**
   ```bash
   # Check database health
   curl http://localhost:3000/health/database
   
   # Check logs
   tail -f logs/error.log | jq 'select(.category == "database")'
   ```

3. **High Error Rates**
   ```bash
   # Check error metrics
   curl http://localhost:3000/metrics | grep http_requests_error
   
   # Analyze error logs
   cat logs/error.log | jq 'select(.level == "error")' | tail -10
   ```

### Monitoring Commands

```bash
# Check application health
curl http://localhost:3000/health

# Get detailed health report
curl http://localhost:3000/health/detailed

# View metrics (Prometheus format)
curl http://localhost:3000/metrics

# Get system information
curl http://localhost:3000/info

# Check specific health component
curl http://localhost:3000/health/database

# Test readiness (Kubernetes)
curl http://localhost:3000/ready

# Test liveness (Kubernetes)
curl http://localhost:3000/live
```

## Best Practices

### Logging Best Practices

1. **Use Structured Logging**: Always use JSON format for production
2. **Include Context**: Add request IDs, user IDs, correlation IDs
3. **Log Levels**: Use appropriate log levels for different events
4. **Sensitive Data**: Never log passwords, tokens, or PII
5. **Performance**: Avoid excessive logging in hot paths

### Metrics Best Practices

1. **Meaningful Names**: Use descriptive metric names
2. **Consistent Labels**: Use consistent label names across metrics
3. **Cardinality**: Avoid high-cardinality labels (like user IDs)
4. **Business Metrics**: Track business KPIs, not just technical metrics
5. **Alerting**: Set up alerts for critical business and technical metrics

### Monitoring Best Practices

1. **Health Checks**: Implement comprehensive health checks
2. **SLOs/SLIs**: Define Service Level Objectives and Indicators
3. **Dashboards**: Create role-specific dashboards
4. **Alerting**: Avoid alert fatigue with proper thresholds
5. **Documentation**: Document all metrics and their meanings

## Security and Compliance

### Audit Logging

All sensitive operations are logged for compliance:
- User authentication and authorization
- Data access and modifications
- Administrative actions
- Security events

### Data Privacy

- PII is never logged in plain text
- User IDs are hashed in logs when necessary
- Compliance logs track data access patterns
- Log retention follows data protection regulations

### Security Monitoring

- Failed authentication attempts
- Suspicious activity patterns
- Rate limiting violations
- Security header violations

## Integration with External Systems

### ELK Stack Integration

To integrate with Elasticsearch, Logstash, and Kibana:

```javascript
// Add Elasticsearch transport to Winston
const { ElasticsearchTransport } = require('winston-elasticsearch');

logger.add(new ElasticsearchTransport({
  level: 'info',
  clientOpts: { node: 'http://elasticsearch:9200' },
  index: 'tripo-logs'
}));
```

### Datadog Integration

```javascript
// Add Datadog transport
const DatadogWinston = require('datadog-winston');

logger.add(new DatadogWinston({
  apiKey: process.env.DATADOG_API_KEY,
  hostname: process.env.INSTANCE_ID,
  service: 'tripo-backend',
  ddsource: 'nodejs'
}));
```

### New Relic Integration

```javascript
// New Relic APM integration
require('newrelic');

// Custom metrics
const newrelic = require('newrelic');
newrelic.recordMetric('Custom/RideCreated', 1);
```

## Maintenance

### Regular Tasks

1. **Weekly**: Review error logs and metrics trends
2. **Monthly**: Update alert thresholds based on traffic patterns
3. **Quarterly**: Review and optimize monitoring configuration
4. **Annually**: Audit logging and monitoring compliance

### Log Cleanup

```bash
# Clean old logs (older than 30 days)
find logs/ -name "*.log" -mtime +30 -delete

# Compress old logs
find logs/ -name "*.log" -mtime +7 -exec gzip {} \;
```

### Monitoring Maintenance

```bash
# Restart monitoring services
docker-compose -f docker-compose.prod.yml restart prometheus grafana

# Update Grafana dashboards
docker-compose -f docker-compose.prod.yml exec grafana grafana-cli admin reset-admin-password newpassword

# Prometheus configuration reload
curl -X POST http://localhost:9090/-/reload
```