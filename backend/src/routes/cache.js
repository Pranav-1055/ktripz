const express = require('express');
const { sendResponse, sendError } = require('../middleware');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const cacheService = require('../services/cacheService');
const cacheWarmupService = require('../services/cacheWarmupService');
const firebaseOptimizationService = require('../services/firebaseOptimizationService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/cache/stats - Get cache statistics (Admin only)
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [cacheStats, firebaseStats, warmupStatus] = await Promise.all([
      cacheService.getCacheStats(),
      firebaseOptimizationService.getCacheStats(),
      cacheWarmupService.getStatus()
    ]);

    const stats = {
      redis: cacheStats,
      inMemory: firebaseStats,
      warmup: warmupStatus,
      timestamp: new Date().toISOString()
    };

    sendResponse(res, 200, stats, 'Cache statistics retrieved successfully');
  } catch (error) {
    logger.error('Error getting cache stats:', error);
    sendError(res, 500, 'CACHE_ERROR', 'Failed to get cache statistics');
  }
});

/**
 * POST /api/cache/warmup - Force cache warmup (Admin only)
 */
router.post('/warmup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await cacheWarmupService.forceWarmup();
    
    sendResponse(res, 200, { 
      message: 'Cache warmup initiated',
      timestamp: new Date().toISOString()
    }, 'Cache warmup started successfully');
  } catch (error) {
    logger.error('Error forcing cache warmup:', error);
    sendError(res, 500, 'WARMUP_ERROR', 'Failed to initiate cache warmup');
  }
});

/**
 * POST /api/cache/refresh - Refresh all caches (Admin only)
 */
router.post('/refresh', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await cacheWarmupService.refreshAllCaches();
    
    sendResponse(res, 200, { 
      message: 'All caches refreshed',
      timestamp: new Date().toISOString()
    }, 'Caches refreshed successfully');
  } catch (error) {
    logger.error('Error refreshing caches:', error);
    sendError(res, 500, 'REFRESH_ERROR', 'Failed to refresh caches');
  }
});

/**
 * DELETE /api/cache/invalidate - Invalidate specific cache pattern (Admin only)
 */
router.delete('/invalidate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { pattern } = req.body;
    
    if (!pattern) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Cache pattern is required');
    }

    const invalidatedCount = await cacheService.invalidateCache(pattern);
    
    sendResponse(res, 200, { 
      pattern,
      invalidatedCount,
      timestamp: new Date().toISOString()
    }, `Invalidated ${invalidatedCount} cache entries`);
  } catch (error) {
    logger.error('Error invalidating cache:', error);
    sendError(res, 500, 'INVALIDATION_ERROR', 'Failed to invalidate cache');
  }
});

/**
 * POST /api/cache/warmup/route - Warmup specific route (Admin only)
 */
router.post('/warmup/route', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { originCity, destinationCity } = req.body;
    
    if (!originCity || !destinationCity) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Origin and destination cities are required');
    }

    const success = await cacheWarmupService.warmupRoute(originCity, destinationCity);
    
    if (success) {
      sendResponse(res, 200, { 
        route: `${originCity} -> ${destinationCity}`,
        timestamp: new Date().toISOString()
      }, 'Route cache warmed up successfully');
    } else {
      sendError(res, 500, 'WARMUP_ERROR', 'Failed to warmup route cache');
    }
  } catch (error) {
    logger.error('Error warming up route cache:', error);
    sendError(res, 500, 'WARMUP_ERROR', 'Failed to warmup route cache');
  }
});

/**
 * POST /api/cache/warmup/user - Warmup user-specific cache (Admin only)
 */
router.post('/warmup/user', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'User ID is required');
    }

    const success = await cacheWarmupService.warmupUserData(userId);
    
    if (success) {
      sendResponse(res, 200, { 
        userId,
        timestamp: new Date().toISOString()
      }, 'User cache warmed up successfully');
    } else {
      sendError(res, 500, 'WARMUP_ERROR', 'Failed to warmup user cache');
    }
  } catch (error) {
    logger.error('Error warming up user cache:', error);
    sendError(res, 500, 'WARMUP_ERROR', 'Failed to warmup user cache');
  }
});

/**
 * GET /api/cache/health - Check cache health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      redis: false,
      inMemory: false,
      warmup: false
    };

    // Test Redis connection
    try {
      await cacheService.getCacheStats();
      health.redis = true;
    } catch (error) {
      logger.warn('Redis health check failed:', error.message);
    }

    // Test in-memory cache
    try {
      const stats = firebaseOptimizationService.getCacheStats();
      health.inMemory = stats !== null;
    } catch (error) {
      logger.warn('In-memory cache health check failed:', error.message);
    }

    // Test warmup service
    try {
      const status = cacheWarmupService.getStatus();
      health.warmup = status !== null;
    } catch (error) {
      logger.warn('Warmup service health check failed:', error.message);
    }

    const overallHealth = health.redis && health.inMemory && health.warmup;
    const statusCode = overallHealth ? 200 : 503;

    res.status(statusCode).json({
      success: overallHealth,
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error checking cache health:', error);
    sendError(res, 500, 'HEALTH_CHECK_ERROR', 'Failed to check cache health');
  }
});

module.exports = router;