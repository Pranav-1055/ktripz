const logger = require('../utils/logger');
const metricsService = require('./metricsService');

class AlertingService {
  constructor() {
    this.alerts = new Map();
    this.alertRules = new Map();
    this.alertHistory = [];
    this.maxHistorySize = 1000;
    
    this.setupDefaultAlertRules();
    this.startAlertEvaluation();
  }

  setupDefaultAlertRules() {
    // High error rate alert
    this.addAlertRule('high_error_rate', {
      name: 'High Error Rate',
      description: 'HTTP error rate is above threshold',
      severity: 'critical',
      condition: (metrics) => {
        const totalRequests = metrics.get('http_requests_total') || 0;
        const errorRequests = metrics.get('http_requests_error') || 0;
        
        if (totalRequests === 0) return false;
        
        const errorRate = errorRequests / totalRequests;
        return errorRate > 0.05; // 5% error rate threshold
      },
      cooldown: 300000, // 5 minutes
      actions: ['log', 'webhook']
    });

    // High response time alert
    this.addAlertRule('high_response_time', {
      name: 'High Response Time',
      description: 'API response time is above threshold',
      severity: 'warning',
      condition: (metrics) => {
        // This would check histogram data for 95th percentile
        // Simplified for this example
        return false; // Implement based on actual histogram data
      },
      cooldown: 600000, // 10 minutes
      actions: ['log']
    });

    // High memory usage alert
    this.addAlertRule('high_memory_usage', {
      name: 'High Memory Usage',
      description: 'Memory usage is above threshold',
      severity: 'warning',
      condition: (metrics) => {
        const heapUsed = metrics.get('nodejs_memory_heap_used_bytes') || 0;
        const heapTotal = metrics.get('nodejs_memory_heap_total_bytes') || 1;
        
        const memoryUsage = heapUsed / heapTotal;
        return memoryUsage > 0.85; // 85% memory usage threshold
      },
      cooldown: 300000, // 5 minutes
      actions: ['log', 'webhook']
    });

    // Payment failure rate alert
    this.addAlertRule('payment_failure_rate', {
      name: 'High Payment Failure Rate',
      description: 'Payment failure rate is above threshold',
      severity: 'critical',
      condition: (metrics) => {
        const totalPayments = metrics.get('payments_processed_total') || 0;
        const failedPayments = metrics.get('payment_failures_total') || 0;
        
        if (totalPayments === 0) return false;
        
        const failureRate = failedPayments / totalPayments;
        return failureRate > 0.02; // 2% payment failure rate threshold
      },
      cooldown: 180000, // 3 minutes
      actions: ['log', 'webhook', 'email']
    });

    // Booking failure rate alert
    this.addAlertRule('booking_failure_rate', {
      name: 'High Booking Failure Rate',
      description: 'Booking failure rate is above threshold',
      severity: 'warning',
      condition: (metrics) => {
        const totalBookings = metrics.get('bookings_created_total') || 0;
        const failedBookings = metrics.get('booking_failures_total') || 0;
        
        if (totalBookings === 0) return false;
        
        const failureRate = failedBookings / totalBookings;
        return failureRate > 0.05; // 5% booking failure rate threshold
      },
      cooldown: 300000, // 5 minutes
      actions: ['log', 'webhook']
    });

    // Database connection alert
    this.addAlertRule('database_connection_issues', {
      name: 'Database Connection Issues',
      description: 'Database connection count is abnormal',
      severity: 'critical',
      condition: (metrics) => {
        const dbConnections = metrics.get('database_connections') || 0;
        return dbConnections === 0; // No database connections
      },
      cooldown: 60000, // 1 minute
      actions: ['log', 'webhook', 'email']
    });

    // Redis connection alert
    this.addAlertRule('redis_connection_issues', {
      name: 'Redis Connection Issues',
      description: 'Redis connection count is abnormal',
      severity: 'warning',
      condition: (metrics) => {
        const redisConnections = metrics.get('redis_connections') || 0;
        return redisConnections === 0; // No Redis connections
      },
      cooldown: 60000, // 1 minute
      actions: ['log', 'webhook']
    });

    // Low active users alert (business metric)
    this.addAlertRule('low_active_users', {
      name: 'Low Active Users',
      description: 'Active user count is unusually low',
      severity: 'info',
      condition: (metrics) => {
        const activeUsers = metrics.get('active_users_total') || 0;
        const hour = new Date().getHours();
        
        // Only alert during business hours (9 AM - 9 PM)
        if (hour < 9 || hour > 21) return false;
        
        return activeUsers < 10; // Less than 10 active users during business hours
      },
      cooldown: 1800000, // 30 minutes
      actions: ['log']
    });
  }

  addAlertRule(id, rule) {
    this.alertRules.set(id, {
      id,
      ...rule,
      lastTriggered: null,
      triggerCount: 0
    });
    
    logger.info(`Alert rule added: ${rule.name}`, {
      category: 'alerting',
      ruleId: id,
      severity: rule.severity
    });
  }

  removeAlertRule(id) {
    const removed = this.alertRules.delete(id);
    if (removed) {
      logger.info(`Alert rule removed: ${id}`, {
        category: 'alerting',
        ruleId: id
      });
    }
    return removed;
  }

  async evaluateAlerts() {
    const currentTime = Date.now();
    const metrics = metricsService.counters; // Get current metrics
    
    for (const [ruleId, rule] of this.alertRules) {
      try {
        // Check cooldown period
        if (rule.lastTriggered && (currentTime - rule.lastTriggered) < rule.cooldown) {
          continue;
        }

        // Evaluate condition
        const shouldAlert = rule.condition(metrics);
        
        if (shouldAlert) {
          await this.triggerAlert(ruleId, rule);
        }
      } catch (error) {
        logger.error(`Failed to evaluate alert rule: ${ruleId}`, {
          category: 'alerting',
          error: error.message,
          ruleId
        });
      }
    }
  }

  async triggerAlert(ruleId, rule) {
    const alert = {
      id: `${ruleId}_${Date.now()}`,
      ruleId,
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      timestamp: new Date().toISOString(),
      status: 'firing',
      metadata: {
        instanceId: process.env.INSTANCE_ID || require('os').hostname(),
        environment: process.env.NODE_ENV || 'development'
      }
    };

    // Update rule state
    rule.lastTriggered = Date.now();
    rule.triggerCount++;

    // Store alert
    this.alerts.set(alert.id, alert);
    this.addToHistory(alert);

    // Log alert
    logger.warn(`Alert triggered: ${rule.name}`, {
      category: 'alerting',
      alertId: alert.id,
      ruleId,
      severity: rule.severity,
      description: rule.description
    });

    // Execute alert actions
    await this.executeAlertActions(alert, rule.actions);

    // Record alert metric
    metricsService.incrementCounter('alerts_triggered_total', 1, {
      rule: ruleId,
      severity: rule.severity
    });
  }

  async executeAlertActions(alert, actions) {
    for (const action of actions) {
      try {
        switch (action) {
          case 'log':
            await this.logAlert(alert);
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert);
            break;
          case 'email':
            await this.sendEmailAlert(alert);
            break;
          case 'slack':
            await this.sendSlackAlert(alert);
            break;
          default:
            logger.warn(`Unknown alert action: ${action}`, {
              category: 'alerting',
              alertId: alert.id
            });
        }
      } catch (error) {
        logger.error(`Failed to execute alert action: ${action}`, {
          category: 'alerting',
          alertId: alert.id,
          error: error.message
        });
      }
    }
  }

  async logAlert(alert) {
    logger.warn(`ALERT: ${alert.name}`, {
      category: 'alert',
      alertId: alert.id,
      severity: alert.severity,
      description: alert.description,
      timestamp: alert.timestamp,
      metadata: alert.metadata
    });
  }

  async sendWebhookAlert(alert) {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.debug('No webhook URL configured for alerts');
      return;
    }

    try {
      const fetch = require('node-fetch');
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          alert,
          service: 'tripo-backend',
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status}`);
      }

      logger.info('Alert webhook sent successfully', {
        category: 'alerting',
        alertId: alert.id,
        webhookUrl: webhookUrl.replace(/\/\/.*@/, '//***@') // Hide credentials
      });
    } catch (error) {
      logger.error('Failed to send alert webhook', {
        category: 'alerting',
        alertId: alert.id,
        error: error.message
      });
    }
  }

  async sendEmailAlert(alert) {
    // This would integrate with your email service (SendGrid, etc.)
    logger.info('Email alert would be sent', {
      category: 'alerting',
      alertId: alert.id,
      note: 'Email integration not implemented in this example'
    });
  }

  async sendSlackAlert(alert) {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) {
      logger.debug('No Slack webhook URL configured for alerts');
      return;
    }

    try {
      const fetch = require('node-fetch');
      const color = alert.severity === 'critical' ? 'danger' : 
                   alert.severity === 'warning' ? 'warning' : 'good';

      const slackMessage = {
        text: `🚨 Alert: ${alert.name}`,
        attachments: [{
          color,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Service',
              value: 'TripO Backend',
              short: true
            },
            {
              title: 'Description',
              value: alert.description,
              short: false
            },
            {
              title: 'Instance',
              value: alert.metadata.instanceId,
              short: true
            },
            {
              title: 'Environment',
              value: alert.metadata.environment,
              short: true
            }
          ],
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000)
        }]
      };

      const response = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackMessage)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook request failed: ${response.status}`);
      }

      logger.info('Alert sent to Slack successfully', {
        category: 'alerting',
        alertId: alert.id
      });
    } catch (error) {
      logger.error('Failed to send Slack alert', {
        category: 'alerting',
        alertId: alert.id,
        error: error.message
      });
    }
  }

  addToHistory(alert) {
    this.alertHistory.unshift(alert);
    
    // Keep history size manageable
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(0, this.maxHistorySize);
    }
  }

  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(alert => alert.status === 'firing');
  }

  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(0, limit);
  }

  getAlertRules() {
    return Array.from(this.alertRules.values());
  }

  resolveAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date().toISOString();
      
      logger.info(`Alert resolved: ${alert.name}`, {
        category: 'alerting',
        alertId,
        duration: new Date(alert.resolvedAt).getTime() - new Date(alert.timestamp).getTime()
      });
      
      return true;
    }
    return false;
  }

  startAlertEvaluation() {
    // Evaluate alerts every 30 seconds
    setInterval(async () => {
      try {
        await this.evaluateAlerts();
      } catch (error) {
        logger.error('Alert evaluation failed', {
          category: 'alerting',
          error: error.message
        });
      }
    }, 30000);

    logger.info('Alert evaluation started', {
      category: 'alerting',
      interval: '30 seconds',
      rulesCount: this.alertRules.size
    });
  }

  // Test alert functionality
  async testAlert(ruleId) {
    const rule = this.alertRules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule not found: ${ruleId}`);
    }

    await this.triggerAlert(ruleId, rule);
    logger.info(`Test alert triggered: ${ruleId}`, {
      category: 'alerting',
      ruleId
    });
  }
}

// Export singleton instance
module.exports = new AlertingService();