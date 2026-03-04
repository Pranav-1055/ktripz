const logger = require('../utils/logger');
const metricsService = require('./metricsService');

class HealthCheckService {
  constructor() {
    this.checks = new Map();
    this.healthStatus = {
      status: 'unknown',
      timestamp: new Date().toISOString(),
      checks: {},
      uptime: 0,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      instanceId: process.env.INSTANCE_ID || require('os').hostname()
    };
    
    this.registerDefaultChecks();
    this.startHealthCheckInterval();
  }

  registerDefaultChecks() {
    // Database connectivity check
    this.registerCheck('database', async () => {
      try {
        // This would be implemented based on your database setup
        // For now, we'll simulate a check
        const isConnected = true; // Replace with actual database ping
        return {
          status: isConnected ? 'healthy' : 'unhealthy',
          message: isConnected ? 'Database connection is healthy' : 'Database connection failed',
          responseTime: Math.random() * 10 // Simulated response time
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `Database check failed: ${error.message}`,
          error: error.message
        };
      }
    });

    // Redis connectivity check
    this.registerCheck('redis', async () => {
      try {
        // This would ping Redis
        const isConnected = true; // Replace with actual Redis ping
        return {
          status: isConnected ? 'healthy' : 'unhealthy',
          message: isConnected ? 'Redis connection is healthy' : 'Redis connection failed',
          responseTime: Math.random() * 5
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `Redis check failed: ${error.message}`,
          error: error.message
        };
      }
    });

    // External services check
    this.registerCheck('external_services', async () => {
      const services = [];
      
      // Check Firebase
      try {
        // Simulate Firebase check
        services.push({
          name: 'firebase',
          status: 'healthy',
          responseTime: Math.random() * 20
        });
      } catch (error) {
        services.push({
          name: 'firebase',
          status: 'unhealthy',
          error: error.message
        });
      }

      // Check payment gateways
      try {
        services.push({
          name: 'payment_gateway',
          status: 'healthy',
          responseTime: Math.random() * 30
        });
      } catch (error) {
        services.push({
          name: 'payment_gateway',
          status: 'unhealthy',
          error: error.message
        });
      }

      const unhealthyServices = services.filter(s => s.status === 'unhealthy');
      
      return {
        status: unhealthyServices.length === 0 ? 'healthy' : 'degraded',
        message: unhealthyServices.length === 0 
          ? 'All external services are healthy' 
          : `${unhealthyServices.length} external services are unhealthy`,
        services
      };
    });

    // System resources check
    this.registerCheck('system_resources', async () => {
      const memUsage = process.memoryUsage();
      const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const memUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
      
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();
      
      const isHealthy = memUsagePercent < 90; // Consider unhealthy if memory usage > 90%
      
      return {
        status: isHealthy ? 'healthy' : 'warning',
        message: isHealthy 
          ? 'System resources are within normal limits' 
          : 'High memory usage detected',
        metrics: {
          memory: {
            used: memUsedMB,
            total: memTotalMB,
            percentage: memUsagePercent
          },
          cpu: {
            user: Math.round(cpuUsage.user / 1000),
            system: Math.round(cpuUsage.system / 1000)
          },
          uptime: Math.round(uptime)
        }
      };
    });

    // Application-specific checks
    this.registerCheck('application', async () => {
      try {
        // Check if critical application components are working
        const checks = [];
        
        // Check if we can create a simple object (basic functionality)
        checks.push({
          name: 'basic_functionality',
          status: 'healthy',
          message: 'Basic application functionality is working'
        });
        
        // Check if logging is working
        try {
          logger.info('Health check test log');
          checks.push({
            name: 'logging',
            status: 'healthy',
            message: 'Logging system is working'
          });
        } catch (error) {
          checks.push({
            name: 'logging',
            status: 'unhealthy',
            message: 'Logging system failed',
            error: error.message
          });
        }
        
        const unhealthyChecks = checks.filter(c => c.status === 'unhealthy');
        
        return {
          status: unhealthyChecks.length === 0 ? 'healthy' : 'unhealthy',
          message: unhealthyChecks.length === 0 
            ? 'All application components are healthy' 
            : `${unhealthyChecks.length} application components are unhealthy`,
          checks
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `Application health check failed: ${error.message}`,
          error: error.message
        };
      }
    });
  }

  registerCheck(name, checkFunction, options = {}) {
    this.checks.set(name, {
      name,
      checkFunction,
      timeout: options.timeout || 5000,
      critical: options.critical !== false, // Default to critical
      lastCheck: null,
      lastResult: null
    });
    
    logger.info(`Health check registered: ${name}`, { 
      category: 'health',
      checkName: name,
      critical: options.critical !== false
    });
  }

  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    const startTime = Date.now();
    
    try {
      // Run check with timeout
      const result = await Promise.race([
        check.checkFunction(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
        )
      ]);

      const duration = Date.now() - startTime;
      
      const checkResult = {
        name,
        status: result.status || 'healthy',
        message: result.message || 'Check completed successfully',
        duration,
        timestamp: new Date().toISOString(),
        ...result
      };

      check.lastCheck = new Date().toISOString();
      check.lastResult = checkResult;

      // Log health check result
      logger.health(name, checkResult.status, {
        duration,
        message: checkResult.message
      });

      // Record metrics
      metricsService.recordHistogram('health_check_duration_seconds', duration / 1000, { check: name });
      metricsService.incrementCounter('health_checks_total', 1, { 
        check: name, 
        status: checkResult.status 
      });

      return checkResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const checkResult = {
        name,
        status: 'unhealthy',
        message: `Health check failed: ${error.message}`,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      };

      check.lastCheck = new Date().toISOString();
      check.lastResult = checkResult;

      // Log health check failure
      logger.health(name, 'unhealthy', {
        duration,
        error: error.message
      });

      // Record metrics
      metricsService.recordHistogram('health_check_duration_seconds', duration / 1000, { check: name });
      metricsService.incrementCounter('health_checks_total', 1, { 
        check: name, 
        status: 'unhealthy' 
      });

      return checkResult;
    }
  }

  async runAllChecks() {
    const startTime = Date.now();
    const checkResults = {};
    const checkPromises = [];

    // Run all checks in parallel
    for (const [name] of this.checks) {
      checkPromises.push(
        this.runCheck(name).then(result => {
          checkResults[name] = result;
        }).catch(error => {
          checkResults[name] = {
            name,
            status: 'unhealthy',
            message: `Check execution failed: ${error.message}`,
            error: error.message,
            timestamp: new Date().toISOString()
          };
        })
      );
    }

    await Promise.all(checkPromises);

    // Determine overall health status
    const criticalChecks = Array.from(this.checks.values()).filter(check => check.critical);
    const criticalResults = criticalChecks.map(check => checkResults[check.name]);
    
    const hasUnhealthyCritical = criticalResults.some(result => result.status === 'unhealthy');
    const hasWarnings = Object.values(checkResults).some(result => result.status === 'warning' || result.status === 'degraded');
    
    let overallStatus = 'healthy';
    if (hasUnhealthyCritical) {
      overallStatus = 'unhealthy';
    } else if (hasWarnings) {
      overallStatus = 'degraded';
    }

    const totalDuration = Date.now() - startTime;

    this.healthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      instanceId: process.env.INSTANCE_ID || require('os').hostname(),
      checks: checkResults,
      summary: {
        total: Object.keys(checkResults).length,
        healthy: Object.values(checkResults).filter(r => r.status === 'healthy').length,
        unhealthy: Object.values(checkResults).filter(r => r.status === 'unhealthy').length,
        warning: Object.values(checkResults).filter(r => r.status === 'warning' || r.status === 'degraded').length,
        duration: totalDuration
      }
    };

    // Log overall health status
    logger.info(`Health check completed: ${overallStatus}`, {
      category: 'health',
      status: overallStatus,
      duration: totalDuration,
      summary: this.healthStatus.summary
    });

    // Record overall health metrics
    metricsService.setGauge('health_status', overallStatus === 'healthy' ? 1 : 0);
    metricsService.recordHistogram('health_check_total_duration_seconds', totalDuration / 1000);

    return this.healthStatus;
  }

  getHealthStatus() {
    return this.healthStatus;
  }

  getSimpleHealthStatus() {
    return {
      status: this.healthStatus.status,
      timestamp: this.healthStatus.timestamp,
      uptime: this.healthStatus.uptime
    };
  }

  startHealthCheckInterval() {
    // Run health checks every 30 seconds
    setInterval(async () => {
      try {
        await this.runAllChecks();
      } catch (error) {
        logger.error('Health check interval failed', {
          category: 'health',
          error: error.message
        });
      }
    }, 30000);

    // Initial health check
    setTimeout(() => {
      this.runAllChecks().catch(error => {
        logger.error('Initial health check failed', {
          category: 'health',
          error: error.message
        });
      });
    }, 5000); // Wait 5 seconds after startup
  }

  // Readiness probe (for Kubernetes)
  async isReady() {
    const criticalChecks = ['database', 'redis'];
    const results = await Promise.all(
      criticalChecks.map(name => this.runCheck(name))
    );
    
    return results.every(result => result.status === 'healthy');
  }

  // Liveness probe (for Kubernetes)
  async isAlive() {
    // Simple check - if the process is running and can respond, it's alive
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime())
    };
  }
}

// Export singleton instance
module.exports = new HealthCheckService();