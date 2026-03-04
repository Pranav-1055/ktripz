const { cache, session } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Enhanced caching service for TripO application
 * Provides optimized caching strategies for Firebase search results,
 * user sessions, and popular routes
 */
class CacheService {
  constructor() {
    this.defaultTTL = {
      searchResults: 300,      // 5 minutes
      popularRoutes: 3600,     // 1 hour
      userSession: 86400,      // 24 hours
      cityData: 7200,          // 2 hours
      vehicleData: 1800,       // 30 minutes
      rideDetails: 600,        // 10 minutes
      userProfile: 1800,       // 30 minutes
      analytics: 900           // 15 minutes
    };
  }

  /**
   * Cache Firebase search results with optimized key structure
   */
  async cacheSearchResults(searchParams, results) {
    try {
      const cacheKey = this.generateSearchCacheKey(searchParams);
      await cache.set(cacheKey, {
        results,
        timestamp: Date.now(),
        searchParams,
        resultCount: results.rides?.length || 0
      }, this.defaultTTL.searchResults);
      
      logger.debug(`Cached search results: ${cacheKey} (${results.rides?.length || 0} rides)`);
      return true;
    } catch (error) {
      logger.error('Error caching search results:', error);
      return false;
    }
  }

  /**
   * Get cached Firebase search results
   */
  async getCachedSearchResults(searchParams) {
    try {
      const cacheKey = this.generateSearchCacheKey(searchParams);
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        logger.debug(`Cache hit for search: ${cacheKey}`);
        return cached.results;
      }
      
      logger.debug(`Cache miss for search: ${cacheKey}`);
      return null;
    } catch (error) {
      logger.error('Error getting cached search results:', error);
      return null;
    }
  }

  /**
   * Cache popular routes with frequency data
   */
  async cachePopularRoutes(routes) {
    try {
      const cacheKey = 'popular_routes';
      const cacheData = {
        routes,
        timestamp: Date.now(),
        totalRoutes: routes.length
      };
      
      await cache.set(cacheKey, cacheData, this.defaultTTL.popularRoutes);
      
      // Also cache individual route popularity for quick lookups
      for (const route of routes) {
        const routeKey = `route_popularity:${route.origin}-${route.destination}`;
        await cache.set(routeKey, {
          count: route.count,
          rank: routes.indexOf(route) + 1,
          timestamp: Date.now()
        }, this.defaultTTL.popularRoutes);
      }
      
      logger.debug(`Cached ${routes.length} popular routes`);
      return true;
    } catch (error) {
      logger.error('Error caching popular routes:', error);
      return false;
    }
  }

  /**
   * Get cached popular routes
   */
  async getCachedPopularRoutes() {
    try {
      const cached = await cache.get('popular_routes');
      if (cached) {
        logger.debug('Cache hit for popular routes');
        return cached.routes;
      }
      
      logger.debug('Cache miss for popular routes');
      return null;
    } catch (error) {
      logger.error('Error getting cached popular routes:', error);
      return null;
    }
  }

  /**
   * Cache user session data with enhanced structure
   */
  async cacheUserSession(userId, sessionData) {
    try {
      const enhancedSession = {
        ...sessionData,
        lastActivity: Date.now(),
        cacheTimestamp: Date.now()
      };
      
      await session.set(userId, enhancedSession, this.defaultTTL.userSession);
      
      // Cache user preferences separately for quick access
      if (sessionData.preferences) {
        await cache.set(`user_prefs:${userId}`, sessionData.preferences, this.defaultTTL.userProfile);
      }
      
      logger.debug(`Cached session for user: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error caching user session:', error);
      return false;
    }
  }

  /**
   * Get cached user session
   */
  async getCachedUserSession(userId) {
    try {
      const cached = await session.get(userId);
      if (cached) {
        // Update last activity timestamp
        cached.lastActivity = Date.now();
        await session.set(userId, cached, this.defaultTTL.userSession);
        
        logger.debug(`Cache hit for user session: ${userId}`);
        return cached;
      }
      
      logger.debug(`Cache miss for user session: ${userId}`);
      return null;
    } catch (error) {
      logger.error('Error getting cached user session:', error);
      return null;
    }
  }

  /**
   * Cache city data for autocomplete and search optimization
   */
  async cacheCityData(cities) {
    try {
      const cacheKey = 'city_data';
      const cityData = {
        cities: cities.map(city => ({
          name: city.name,
          coordinates: city.coordinates,
          popularity: city.rideCount || 0
        })),
        timestamp: Date.now()
      };
      
      await cache.set(cacheKey, cityData, this.defaultTTL.cityData);
      
      // Cache individual city lookups for autocomplete
      for (const city of cities) {
        const cityKey = `city:${city.name.toLowerCase()}`;
        await cache.set(cityKey, city, this.defaultTTL.cityData);
      }
      
      logger.debug(`Cached ${cities.length} cities`);
      return true;
    } catch (error) {
      logger.error('Error caching city data:', error);
      return false;
    }
  }

  /**
   * Get cached city data
   */
  async getCachedCityData() {
    try {
      const cached = await cache.get('city_data');
      if (cached) {
        logger.debug('Cache hit for city data');
        return cached.cities;
      }
      
      logger.debug('Cache miss for city data');
      return null;
    } catch (error) {
      logger.error('Error getting cached city data:', error);
      return null;
    }
  }

  /**
   * Cache ride details for quick access
   */
  async cacheRideDetails(rideId, rideData) {
    try {
      const cacheKey = `ride:${rideId}`;
      const cacheData = {
        ...rideData,
        cacheTimestamp: Date.now()
      };
      
      await cache.set(cacheKey, cacheData, this.defaultTTL.rideDetails);
      logger.debug(`Cached ride details: ${rideId}`);
      return true;
    } catch (error) {
      logger.error('Error caching ride details:', error);
      return false;
    }
  }

  /**
   * Get cached ride details
   */
  async getCachedRideDetails(rideId) {
    try {
      const cacheKey = `ride:${rideId}`;
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        logger.debug(`Cache hit for ride: ${rideId}`);
        return cached;
      }
      
      logger.debug(`Cache miss for ride: ${rideId}`);
      return null;
    } catch (error) {
      logger.error('Error getting cached ride details:', error);
      return null;
    }
  }

  /**
   * Cache user profile data
   */
  async cacheUserProfile(userId, profileData) {
    try {
      const cacheKey = `user_profile:${userId}`;
      const cacheData = {
        ...profileData,
        cacheTimestamp: Date.now()
      };
      
      await cache.set(cacheKey, cacheData, this.defaultTTL.userProfile);
      logger.debug(`Cached user profile: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error caching user profile:', error);
      return false;
    }
  }

  /**
   * Get cached user profile
   */
  async getCachedUserProfile(userId) {
    try {
      const cacheKey = `user_profile:${userId}`;
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        logger.debug(`Cache hit for user profile: ${userId}`);
        return cached;
      }
      
      logger.debug(`Cache miss for user profile: ${userId}`);
      return null;
    } catch (error) {
      logger.error('Error getting cached user profile:', error);
      return null;
    }
  }

  /**
   * Cache analytics data
   */
  async cacheAnalytics(type, data) {
    try {
      const cacheKey = `analytics:${type}`;
      const cacheData = {
        data,
        timestamp: Date.now(),
        type
      };
      
      await cache.set(cacheKey, cacheData, this.defaultTTL.analytics);
      logger.debug(`Cached analytics: ${type}`);
      return true;
    } catch (error) {
      logger.error('Error caching analytics:', error);
      return false;
    }
  }

  /**
   * Get cached analytics data
   */
  async getCachedAnalytics(type) {
    try {
      const cacheKey = `analytics:${type}`;
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        logger.debug(`Cache hit for analytics: ${type}`);
        return cached.data;
      }
      
      logger.debug(`Cache miss for analytics: ${type}`);
      return null;
    } catch (error) {
      logger.error('Error getting cached analytics:', error);
      return null;
    }
  }

  /**
   * Generate optimized cache key for search parameters
   */
  generateSearchCacheKey(params) {
    const keyParts = [
      'search',
      params.originCity || 'any',
      params.destinationCity || 'any',
      params.departureDate || 'any',
      params.minSeats || 'any',
      params.maxPrice || 'any',
      params.minPrice || 'any',
      params.sortBy || 'time',
      params.sortOrder || 'asc',
      params.limit || '20'
    ];
    
    // Add geolocation to key if present
    if (params.originCoordinates) {
      keyParts.push(`olat:${params.originCoordinates.lat.toFixed(3)}`);
      keyParts.push(`olng:${params.originCoordinates.lng.toFixed(3)}`);
    }
    
    if (params.destinationCoordinates) {
      keyParts.push(`dlat:${params.destinationCoordinates.lat.toFixed(3)}`);
      keyParts.push(`dlng:${params.destinationCoordinates.lng.toFixed(3)}`);
    }
    
    return keyParts.join(':');
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateCache(pattern) {
    try {
      const keys = await cache.keys(pattern);
      if (keys.length > 0) {
        for (const key of keys) {
          await cache.del(key);
        }
        logger.debug(`Invalidated ${keys.length} cache entries matching: ${pattern}`);
      }
      return keys.length;
    } catch (error) {
      logger.error('Error invalidating cache:', error);
      return 0;
    }
  }

  /**
   * Invalidate search cache when new rides are added
   */
  async invalidateSearchCache() {
    return await this.invalidateCache('search:*');
  }

  /**
   * Invalidate user-specific cache
   */
  async invalidateUserCache(userId) {
    const patterns = [
      `session:${userId}`,
      `user_profile:${userId}`,
      `user_prefs:${userId}`
    ];
    
    let totalInvalidated = 0;
    for (const pattern of patterns) {
      totalInvalidated += await this.invalidateCache(pattern);
    }
    
    return totalInvalidated;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const patterns = [
        'search:*',
        'popular_routes',
        'session:*',
        'user_profile:*',
        'ride:*',
        'analytics:*'
      ];
      
      const stats = {};
      for (const pattern of patterns) {
        const keys = await cache.keys(pattern);
        const type = pattern.replace(':*', '');
        stats[type] = keys.length;
      }
      
      return stats;
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return {};
    }
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUpCache() {
    try {
      logger.info('Starting cache warm-up...');
      
      // This would typically be called during application startup
      // to pre-populate cache with frequently accessed data
      
      // Example: Pre-load popular routes
      // const popularRoutes = await this.loadPopularRoutesFromDB();
      // await this.cachePopularRoutes(popularRoutes);
      
      // Example: Pre-load city data
      // const cities = await this.loadCitiesFromDB();
      // await this.cacheCityData(cities);
      
      logger.info('Cache warm-up completed');
      return true;
    } catch (error) {
      logger.error('Error during cache warm-up:', error);
      return false;
    }
  }
}

module.exports = new CacheService();