const express = require('express');
const healthCheckService = require('../services/healthCheckService');
const metricsService = require('../services/metricsService');
const logger = require('../utils/logger');

const router = express.Router();

// Simple health check endpoint (for load balancers)
router.get('/health', async (req, res) => {
  try {
    const healthStatus = healthCheckService.getSimpleHealthStatus();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      status: healthStatus.status,
      timestamp: healthStatus.timestamp,
      uptime: healthStatus.uptime,
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      instanceId: process.env.INSTANCE_ID || require('os').hostname()
    });
  } catch (error) {
    logger.error('Health check endpoint failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Detailed health check endpoint
router.get('/health/detailed', async (req, res) => {
  try {
    const healthStatus = await healthCheckService.runAllChecks();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Detailed health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed',
      message: error.message
    });
  }
});

// Individual health check endpoint
router.get('/health/:checkName', async (req, res) => {
  try {
    const { checkName } = req.params;
    const result = await healthCheckService.runCheck(checkName);
    
    const statusCode = result.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(result);
  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        status: 'error',
        message: `Health check '${req.params.checkName}' not found`,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error(`Health check ${req.params.checkName} failed`, { error: error.message });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    const isReady = await healthCheckService.isReady();
    
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Readiness probe failed', { error: error.message });
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Liveness probe (for Kubernetes)
router.get('/live', async (req, res) => {
  try {
    const liveness = await healthCheckService.isAlive();
    res.status(200).json(liveness);
  } catch (error) {
    logger.error('Liveness probe failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Metrics endpoint (Prometheus format)
router.get('/metrics', (req, res) => {
  try {
    const metrics = metricsService.getMetricsForPrometheus();
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics);
  } catch (error) {
    logger.error('Metrics endpoint failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// System info endpoint
router.get('/info', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const systemInfo = {
      application: {
        name: 'tripo-backend',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        instanceId: process.env.INSTANCE_ID || require('os').hostname(),
        uptime: Math.round(process.uptime()),
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid
      },
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000),
        system: Math.round(cpuUsage.system / 1000)
      },
      timestamp: new Date().toISOString()
    };
    
    res.status(200).json(systemInfo);
  } catch (error) {
    logger.error('System info endpoint failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get system info',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;