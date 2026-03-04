const { getFirestore } = require('../config/firebase');
const cacheService = require('./cacheService');
const logger = require('../utils/logger');

/**
 * Firebase optimization service for better mobile performance
 * Implements query optimization, batching, and intelligent caching
 */
class FirebaseOptimizationService {
  constructor() {
    // Don't initialize Firestore here - it will be initialized by the server
    this.db = null;
    this.batchSize = 500; // Firestore batch limit
    this.queryCache = new Map(); // In-memory query cache for frequently used queries
  }

  /**
   * Get Firestore instance (lazy initialization)
   */
  getDB() {
    if (!this.db) {
      this.db = getFirestore();
    }
    return this.db;
  }

  /**
   * Optimized ride search with compound queries and caching
   */
  async optimizedRideSearch(filters = {}) {
    try {
      // Generate optimized query key
      const queryKey = this.generateQueryKey(filters);
      
      // Check in-memory cache first (fastest)
      if (this.queryCache.has(queryKey)) {
        const cached = this.queryCache.get(queryKey);
        if (Date.now() - cached.timestamp < 60000) { // 1 minute in-memory cache
          logger.debug('Returning in-memory cached query result');
          return cached.data;
        }
        this.queryCache.delete(queryKey);
      }

      // Check Redis cache
      const cachedResult = await cacheService.getCachedSearchResults(filters);
      if (cachedResult) {
        // Store in in-memory cache for faster subsequent access
        this.queryCache.set(queryKey, {
          data: cachedResult,
          timestamp: Date.now()
        });
        return cachedResult;
      }

      // Build optimized Firestore query
      let query = this.getDB().collection('rides');
      
      // Apply filters in order of selectivity (most selective first)
      query = this.applyOptimizedFilters(query, filters);
      
      // Execute query with pagination for better performance
      const snapshot = await query.limit(filters.limit || 50).get();
      
      const rides = [];
      snapshot.forEach(doc => {
        rides.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Cache the results
      const results = {
        rides,
        total: rides.length,
        timestamp: new Date().toISOString()
      };

      await cacheService.cacheSearchResults(filters, results);
      
      // Store in in-memory cache
      this.queryCache.set(queryKey, {
        data: results,
        timestamp: Date.now()
      });

      return results;
    } catch (error) {
      logger.error('Error in optimized ride search:', error);
      throw error;
    }
  }

  /**
   * Apply filters in optimal order for Firestore performance
   */
  applyOptimizedFilters(query, filters) {
    // Apply equality filters first (most selective)
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }

    if (filters.departureDate) {
      query = query.where('departureDate', '==', filters.departureDate);
    }

    if (filters.originCity) {
      query = query.where('origin.city', '==', filters.originCity);
    }

    if (filters.destinationCity) {
      query = query.where('destination.city', '==', filters.destinationCity);
    }

    // Apply range filters (less selective)
    if (filters.minSeats) {
      query = query.where('availableSeats', '>=', parseInt(filters.minSeats));
    }

    if (filters.maxPrice) {
      query = query.where('pricePerSeat', '<=', parseFloat(filters.maxPrice));
    }

    // Apply ordering (should be on the same field as range filter if possible)
    const orderBy = filters.sortBy || 'departureDate';
    const orderDirection = filters.sortOrder === 'desc' ? 'desc' : 'asc';
    query = query.orderBy(orderBy, orderDirection);

    return query;
  }

  /**
   * Batch operations for better performance
   */
  async batchWrite(operations) {
    try {
      const batches = [];
      let currentBatch = this.getDB().batch();
      let operationCount = 0;

      for (const operation of operations) {
        if (operationCount >= this.batchSize) {
          batches.push(currentBatch);
          currentBatch = this.getDB().batch();
          operationCount = 0;
        }

        const { type, ref, data } = operation;
        switch (type) {
          case 'set':
            currentBatch.set(ref, data);
            break;
          case 'update':
            currentBatch.update(ref, data);
            break;
          case 'delete':
            currentBatch.delete(ref);
            break;
        }
        operationCount++;
      }

      if (operationCount > 0) {
        batches.push(currentBatch);
      }

      // Execute all batches
      const results = await Promise.all(batches.map(batch => batch.commit()));
      
      logger.info(`Executed ${batches.length} batches with ${operations.length} operations`);
      return results;
    } catch (error) {
      logger.error('Error in batch write:', error);
      throw error;
    }
  }

  /**
   * Optimized user data retrieval with caching
   */
  async getOptimizedUserData(userId) {
    try {
      // Check cache first
      const cached = await cacheService.getCachedUserProfile(userId);
      if (cached) {
        return cached;
      }

      // Fetch from Firestore
      const userDoc = await this.getDB().collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = {
        id: userDoc.id,
        ...userDoc.data()
      };

      // Cache the result
      await cacheService.cacheUserProfile(userId, userData);

      return userData;
    } catch (error) {
      logger.error('Error getting optimized user data:', error);
      throw error;
    }
  }

  /**
   * Optimized ride details with related data
   */
  async getOptimizedRideDetails(rideId) {
    try {
      // Check cache first
      const cached = await cacheService.getCachedRideDetails(rideId);
      if (cached) {
        return cached;
      }

      // Fetch ride and related data in parallel
      const [rideDoc, bookingsSnapshot] = await Promise.all([
        this.getDB().collection('rides').doc(rideId).get(),
        this.getDB().collection('bookings').where('rideId', '==', rideId).get()
      ]);

      if (!rideDoc.exists) {
        throw new Error('Ride not found');
      }

      const rideData = {
        id: rideDoc.id,
        ...rideDoc.data()
      };

      // Add booking information
      const bookings = [];
      bookingsSnapshot.forEach(doc => {
        bookings.push({
          id: doc.id,
          ...doc.data()
        });
      });

      const enrichedRideData = {
        ...rideData,
        bookings,
        bookedSeats: bookings.reduce((sum, booking) => sum + (booking.seatsBooked || 0), 0)
      };

      // Cache the result
      await cacheService.cacheRideDetails(rideId, enrichedRideData);

      return enrichedRideData;
    } catch (error) {
      logger.error('Error getting optimized ride details:', error);
      throw error;
    }
  }

  /**
   * Preload frequently accessed data
   */
  async preloadFrequentData() {
    try {
      logger.info('Starting preload of frequent data...');

      // Preload popular routes
      const popularRoutesQuery = this.getDB().collection('rides')
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(100);

      const snapshot = await popularRoutesQuery.get();
      const rides = [];
      snapshot.forEach(doc => {
        rides.push({ id: doc.id, ...doc.data() });
      });

      // Calculate and cache popular routes
      const routeCounts = {};
      rides.forEach(ride => {
        const routeKey = `${ride.origin?.city}-${ride.destination?.city}`;
        if (routeKey !== 'undefined-undefined') {
          routeCounts[routeKey] = (routeCounts[routeKey] || 0) + 1;
        }
      });

      const popularRoutes = Object.entries(routeCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20)
        .map(([route, count]) => {
          const [origin, destination] = route.split('-');
          return { origin, destination, count };
        });

      await cacheService.cachePopularRoutes(popularRoutes);

      // Preload city data
      const cities = new Set();
      rides.forEach(ride => {
        if (ride.origin?.city) cities.add(ride.origin.city);
        if (ride.destination?.city) cities.add(ride.destination.city);
      });

      const cityData = Array.from(cities).map(city => ({
        name: city,
        rideCount: rides.filter(r => 
          r.origin?.city === city || r.destination?.city === city
        ).length
      }));

      await cacheService.cacheCityData(cityData);

      logger.info(`Preloaded ${popularRoutes.length} popular routes and ${cityData.length} cities`);
      return true;
    } catch (error) {
      logger.error('Error preloading frequent data:', error);
      return false;
    }
  }

  /**
   * Generate optimized query key for caching
   */
  generateQueryKey(filters) {
    const keyParts = [
      'firebase_query',
      filters.originCity || 'any',
      filters.destinationCity || 'any',
      filters.departureDate || 'any',
      filters.status || 'any',
      filters.minSeats || 'any',
      filters.maxPrice || 'any',
      filters.sortBy || 'date',
      filters.limit || '50'
    ];
    
    return keyParts.join(':');
  }

  /**
   * Clean up in-memory cache periodically
   */
  cleanupInMemoryCache() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.queryCache.delete(key);
      }
    }

    logger.debug(`Cleaned up in-memory cache, ${this.queryCache.size} entries remaining`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      inMemoryCacheSize: this.queryCache.size,
      inMemoryCacheKeys: Array.from(this.queryCache.keys())
    };
  }

  /**
   * Invalidate all caches when data changes
   */
  async invalidateAllCaches() {
    try {
      // Clear in-memory cache
      this.queryCache.clear();
      
      // Invalidate Redis search cache
      await cacheService.invalidateSearchCache();
      
      logger.info('All caches invalidated');
      return true;
    } catch (error) {
      logger.error('Error invalidating caches:', error);
      return false;
    }
  }
}

module.exports = new FirebaseOptimizationService();
