const cacheService = require('./cacheService');
const firebaseOptimizationService = require('./firebaseOptimizationService');
const searchService = require('./searchService');
const logger = require('../utils/logger');
const cron = require('node-cron');

/**
 * Cache warmup service to preload frequently accessed data
 * Improves mobile app performance by ensuring popular data is always cached
 */
class CacheWarmupService {
  constructor() {
    this.isWarming = false;
    this.warmupSchedule = '*/15 * * * *'; // Every 15 minutes
    this.lastWarmup = null;
  }

  /**
   * Initialize cache warmup service with scheduled tasks
   */
  initialize() {
    try {
      // Schedule regular cache warmup
      cron.schedule(this.warmupSchedule, () => {
        this.performWarmup();
      });

      // Perform initial warmup
      setTimeout(() => {
        this.performWarmup();
      }, 5000); // Wait 5 seconds after startup

      logger.info('Cache warmup service initialized');
    } catch (error) {
      logger.error('Error initializing cache warmup service:', error);
    }
  }

  /**
   * Perform comprehensive cache warmup
   */
  async performWarmup() {
    if (this.isWarming) {
      logger.debug('Cache warmup already in progress, skipping');
      return;
    }

    try {
      this.isWarming = true;
      const startTime = Date.now();
      
      logger.info('Starting cache warmup...');

      // Warmup tasks in parallel for better performance
      const warmupTasks = [
        this.warmupPopularRoutes(),
        this.warmupCityData(),
        this.warmupFrequentSearches(),
        this.warmupRecentRides(),
        this.warmupAnalyticsData()
      ];

      const results = await Promise.allSettled(warmupTasks);
      
      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      const duration = Date.now() - startTime;
      this.lastWarmup = new Date();

      logger.info(`Cache warmup completed: ${successful} successful, ${failed} failed (${duration}ms)`);

      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Warmup task ${index} failed:`, result.reason);
        }
      });

    } catch (error) {
      logger.error('Error during cache warmup:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warmup popular routes data
   */
  async warmupPopularRoutes() {
    try {
      logger.debug('Warming up popular routes...');
      
      // Get popular routes (this will cache them)
      const popularRoutes = await searchService.getPopularRoutes(20);
      
      // Pre-cache searches for popular routes
      for (const route of popularRoutes.slice(0, 10)) {
        const searchFilters = {
          originCity: route.origin,
          destinationCity: route.destination,
          limit: 20,
          sortBy: 'departureTime'
        };
        
        try {
          await searchService.searchRides(searchFilters);
        } catch (error) {
          logger.debug(`Failed to warmup search for ${route.origin}-${route.destination}:`, error.message);
        }
      }

      logger.debug(`Warmed up ${popularRoutes.length} popular routes`);
      return popularRoutes.length;
    } catch (error) {
      logger.error('Error warming up popular routes:', error);
      throw error;
    }
  }

  /**
   * Warmup city data for autocomplete
   */
  async warmupCityData() {
    try {
      logger.debug('Warming up city data...');
      
      // This will be cached by the search service
      await firebaseOptimizationService.preloadFrequentData();
      
      logger.debug('City data warmed up');
      return true;
    } catch (error) {
      logger.error('Error warming up city data:', error);
      throw error;
    }
  }

  /**
   * Warmup frequent search patterns
   */
  async warmupFrequentSearches() {
    try {
      logger.debug('Warming up frequent searches...');
      
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Common search patterns
      const commonSearches = [
        { departureDate: today, limit: 20, sortBy: 'departureTime' },
        { departureDate: tomorrow, limit: 20, sortBy: 'departureTime' },
        { minSeats: 1, limit: 20, sortBy: 'price' },
        { maxPrice: 500, limit: 20, sortBy: 'rating' },
        { sortBy: 'departureTime', sortOrder: 'asc', limit: 30 },
        { sortBy: 'price', sortOrder: 'asc', limit: 30 }
      ];

      let warmedCount = 0;
      for (const searchFilter of commonSearches) {
        try {
          await searchService.searchRides(searchFilter);
          warmedCount++;
        } catch (error) {
          logger.debug('Failed to warmup search:', error.message);
        }
      }

      logger.debug(`Warmed up ${warmedCount} frequent searches`);
      return warmedCount;
    } catch (error) {
      logger.error('Error warming up frequent searches:', error);
      throw error;
    }
  }

  /**
   * Warmup recent rides data
   */
  async warmupRecentRides() {
    try {
      logger.debug('Warming up recent rides...');
      
      // Get recent published rides
      const recentRidesFilter = {
        status: 'published',
        limit: 50,
        sortBy: 'publishedAt',
        sortOrder: 'desc'
      };

      await searchService.searchRides(recentRidesFilter);
      
      logger.debug('Recent rides warmed up');
      return true;
    } catch (error) {
      logger.error('Error warming up recent rides:', error);
      throw error;
    }
  }

  /**
   * Warmup analytics data
   */
  async warmupAnalyticsData() {
    try {
      logger.debug('Warming up analytics data...');
      
      // Pre-calculate and cache basic analytics
      const analyticsTypes = [
        'daily_rides',
        'popular_routes',
        'user_activity',
        'booking_stats'
      ];

      let warmedCount = 0;
      for (const type of analyticsTypes) {
        try {
          // This would typically call your analytics service
          // For now, we'll just cache some basic data
          await cacheService.cacheAnalytics(type, {
            timestamp: Date.now(),
            type,
            data: `Cached ${type} data`
          });
          warmedCount++;
        } catch (error) {
          logger.debug(`Failed to warmup analytics ${type}:`, error.message);
        }
      }

      logger.debug(`Warmed up ${warmedCount} analytics types`);
      return warmedCount;
    } catch (error) {
      logger.error('Error warming up analytics data:', error);
      throw error;
    }
  }

  /**
   * Warmup specific route data
   */
  async warmupRoute(originCity, destinationCity) {
    try {
      const searchFilters = {
        originCity,
        destinationCity,
        limit: 20,
        sortBy: 'departureTime'
      };

      await searchService.searchRides(searchFilters);
      logger.debug(`Warmed up route: ${originCity} -> ${destinationCity}`);
      return true;
    } catch (error) {
      logger.error(`Error warming up route ${originCity}-${destinationCity}:`, error);
      return false;
    }
  }

  /**
   * Warmup user-specific data
   */
  async warmupUserData(userId) {
    try {
      // This would typically pre-cache user's frequent searches,
      // booking history, and preferences
      await firebaseOptimizationService.getOptimizedUserData(userId);
      
      logger.debug(`Warmed up user data: ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Error warming up user data ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get warmup service status
   */
  getStatus() {
    return {
      isWarming: this.isWarming,
      lastWarmup: this.lastWarmup,
      schedule: this.warmupSchedule,
      nextWarmup: this.getNextWarmupTime()
    };
  }

  /**
   * Calculate next warmup time
   */
  getNextWarmupTime() {
    if (!this.lastWarmup) return 'Soon';
    
    const nextTime = new Date(this.lastWarmup.getTime() + 15 * 60 * 1000); // 15 minutes
    return nextTime;
  }

  /**
   * Force immediate warmup
   */
  async forceWarmup() {
    logger.info('Forcing immediate cache warmup...');
    await this.performWarmup();
  }

  /**
   * Clear all caches and perform fresh warmup
   */
  async refreshAllCaches() {
    try {
      logger.info('Refreshing all caches...');
      
      // Clear existing caches
      await firebaseOptimizationService.invalidateAllCaches();
      
      // Perform fresh warmup
      await this.performWarmup();
      
      logger.info('All caches refreshed');
      return true;
    } catch (error) {
      logger.error('Error refreshing caches:', error);
      return false;
    }
  }
}

module.exports = new CacheWarmupService();