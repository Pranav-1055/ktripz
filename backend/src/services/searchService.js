const Ride = require('../models/Ride');
const { getRedisClient } = require('../config/redis');
const cacheService = require('./cacheService');
const mapsService = require('../utils/maps');
const logger = require('../utils/logger');

class SearchService {
  constructor() {
    this.redis = null;
    this.initRedis();
  }

  async initRedis() {
    try {
      this.redis = await getRedisClient();
    } catch (error) {
      logger.warn('Redis not available for search caching:', error.message);
    }
  }

  /**
   * Search rides with advanced filtering and geolocation
   */
  async searchRides(filters = {}) {
    try {
      const enforceBookableOnly = filters.includeUnavailable !== true;

      // Try to get cached results first using enhanced cache service
      const cachedResults = await cacheService.getCachedSearchResults(filters);
      if (cachedResults) {
        logger.info('Returning cached search results from enhanced cache');
        if (!enforceBookableOnly || !Array.isArray(cachedResults.rides)) {
          return cachedResults;
        }
        const visibleRides = cachedResults.rides.filter((ride) => this.isRideVisibleForPassenger(ride));
        return {
          ...cachedResults,
          rides: visibleRides,
          total: visibleRides.length
        };
      }

      // Perform database search
      let rides = await Ride.search(filters);

      // Apply geolocation-based filtering if coordinates provided
      if (filters.originCoordinates || filters.destinationCoordinates) {
        rides = this.filterByGeolocation(rides, filters);
      }

      // Apply additional filters that can't be done in Firestore
      rides = this.applyClientSideFilters(rides, filters);

      // Apply route optimization if requested
      if (filters.optimizeRoute && filters.originCoordinates && filters.destinationCoordinates) {
        rides = await this.optimizeRoutes(rides, filters.originCoordinates, filters.destinationCoordinates);
      }

      // Apply flexible date/time search if requested
      if (filters.flexibleDates || filters.flexibleTimes) {
        rides = await this.applyFlexibleSearch(rides, filters);
      }

      // Sort results
      rides = this.sortRides(rides, filters.sortBy, filters.sortOrder);

      // Limit results
      if (filters.limit) {
        rides = rides.slice(0, parseInt(filters.limit));
      }

      const results = {
        rides: rides.map(ride => ride.getSummary()),
        total: rides.length,
        filters: filters,
        timestamp: new Date().toISOString(),
        alternativeRoutes: filters.includeAlternatives ? await this.getAlternativeRoutes(filters) : null
      };

      // Cache results using enhanced cache service
      await cacheService.cacheSearchResults(filters, results);

      return results;
    } catch (error) {
      logger.error('Error in search service:', error);
      throw error;
    }
  }

  /**
   * Filter rides by geolocation proximity
   */
  filterByGeolocation(rides, filters) {
    const maxDistance = filters.maxDistance || 10; // km

    return rides.filter(ride => {
      let matchesOrigin = true;
      let matchesDestination = true;

      // Check origin proximity
      if (filters.originCoordinates) {
        const originDistance = this.calculateDistance(
          filters.originCoordinates.lat,
          filters.originCoordinates.lng,
          ride.origin.coordinates.lat,
          ride.origin.coordinates.lng
        );
        matchesOrigin = originDistance <= maxDistance;
      }

      // Check destination proximity
      if (filters.destinationCoordinates) {
        const destDistance = this.calculateDistance(
          filters.destinationCoordinates.lat,
          filters.destinationCoordinates.lng,
          ride.destination.coordinates.lat,
          ride.destination.coordinates.lng
        );
        matchesDestination = destDistance <= maxDistance;
      }

      return matchesOrigin && matchesDestination;
    });
  }

  /**
   * Apply client-side filters that can't be done in Firestore
   */
  applyClientSideFilters(rides, filters) {
    let filteredRides = rides;

    // Default behavior for passenger suggestions:
    // - hide full rides
    // - hide past-departure rides
    if (filters.includeUnavailable !== true) {
      filteredRides = filteredRides.filter((ride) => this.isRideVisibleForPassenger(ride));
    }

    // Filter by maximum price
    if (filters.maxPrice) {
      filteredRides = filteredRides.filter(ride => 
        ride.pricePerSeat <= parseFloat(filters.maxPrice)
      );
    }

    // Filter by minimum price
    if (filters.minPrice) {
      filteredRides = filteredRides.filter(ride => 
        ride.pricePerSeat >= parseFloat(filters.minPrice)
      );
    }

    // Filter by departure time range
    if (filters.departureTimeFrom || filters.departureTimeTo) {
      filteredRides = filteredRides.filter(ride => {
        const rideTime = ride.departureTime;
        let matches = true;

        if (filters.departureTimeFrom) {
          matches = matches && rideTime >= filters.departureTimeFrom;
        }

        if (filters.departureTimeTo) {
          matches = matches && rideTime <= filters.departureTimeTo;
        }

        return matches;
      });
    }

    // Filter by vehicle amenities
    if (filters.amenities && filters.amenities.length > 0) {
      filteredRides = filteredRides.filter(ride => {
        const rideAmenities = ride.vehicle?.amenities || [];
        return filters.amenities.every(amenity => rideAmenities.includes(amenity));
      });
    }

    // Filter by vehicle type (make/model)
    if (filters.vehicleType) {
      filteredRides = filteredRides.filter(ride => {
        if (!ride.vehicle) return false;
        const vehicleName = `${ride.vehicle.make} ${ride.vehicle.model}`.toLowerCase();
        return vehicleName.includes(filters.vehicleType.toLowerCase());
      });
    }

    // Filter by fuel type
    if (filters.fuelType) {
      filteredRides = filteredRides.filter(ride => {
        return ride.vehicle?.fuelType === filters.fuelType;
      });
    }

    // Filter by transmission type
    if (filters.transmission) {
      filteredRides = filteredRides.filter(ride => {
        return ride.vehicle?.transmission === filters.transmission;
      });
    }

    // Filter by minimum vehicle seats
    if (filters.minVehicleSeats) {
      filteredRides = filteredRides.filter(ride => {
        return ride.vehicle?.seats >= parseInt(filters.minVehicleSeats);
      });
    }

    // Filter by verified vehicles only
    if (filters.verifiedVehiclesOnly) {
      filteredRides = filteredRides.filter(ride => {
        return ride.vehicle?.verified === true;
      });
    }

    // Filter by vehicle year range
    if (filters.minVehicleYear || filters.maxVehicleYear) {
      filteredRides = filteredRides.filter(ride => {
        if (!ride.vehicle?.year) return false;
        const year = ride.vehicle.year;
        return (!filters.minVehicleYear || year >= parseInt(filters.minVehicleYear)) &&
               (!filters.maxVehicleYear || year <= parseInt(filters.maxVehicleYear));
      });
    }

    // Filter by driver rating
    if (filters.minRating) {
      filteredRides = filteredRides.filter(ride => 
        ride.driver.rating >= parseFloat(filters.minRating)
      );
    }

    // Filter by preferences
    if (filters.preferences) {
      filteredRides = filteredRides.filter(ride => {
        let matches = true;

        if (filters.preferences.smoking !== undefined) {
          matches = matches && (ride.preferences.smoking === filters.preferences.smoking);
        }

        if (filters.preferences.pets !== undefined) {
          matches = matches && (ride.preferences.pets === filters.preferences.pets);
        }

        if (filters.preferences.music !== undefined) {
          matches = matches && (ride.preferences.music === filters.preferences.music);
        }

        return matches;
      });
    }

    return filteredRides;
  }

  /**
   * Convert ride date/time to a JS Date (supports both model instances and plain summaries)
   */
  getRideDepartureDateTime(ride) {
    if (!ride) return null;
    const datePart = ride.departureDate || ride.date;
    const timePart = ride.departureTime || ride.time;
    if (!datePart || !timePart) return null;
    const departure = new Date(`${datePart}T${timePart}`);
    if (Number.isNaN(departure.getTime())) return null;
    return departure;
  }

  /**
   * Passenger visibility rule:
   * only published rides, with seats available, and not expired by departure datetime.
   */
  isRideVisibleForPassenger(ride) {
    if (!ride) return false;
    const status = (ride.status || '').toLowerCase();
    if (status && status !== 'published') return false;

    const availableSeats = Number(ride.availableSeats ?? ride.seatsAvailable ?? 0);
    if (!Number.isFinite(availableSeats) || availableSeats <= 0) return false;

    const departure = this.getRideDepartureDateTime(ride);
    if (!departure) return false;
    return departure > new Date();
  }

  /**
   * Sort rides based on criteria
   */
  sortRides(rides, sortBy = 'departureTime', sortOrder = 'asc') {
    return rides.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'price':
        case 'pricePerSeat':
          aValue = a.pricePerSeat;
          bValue = b.pricePerSeat;
          break;
        case 'rating':
          aValue = a.driver.rating;
          bValue = b.driver.rating;
          break;
        case 'availableSeats':
          aValue = a.availableSeats;
          bValue = b.availableSeats;
          break;
        case 'duration':
          aValue = a.route.estimatedDuration;
          bValue = b.route.estimatedDuration;
          break;
        case 'departureTime':
        default:
          aValue = `${a.departureDate} ${a.departureTime}`;
          bValue = `${b.departureDate} ${b.departureTime}`;
          break;
      }

      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  /**
   * Convert degrees to radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Generate cache key for search parameters
   */
  generateCacheKey(filters) {
    const keyParts = [
      'search',
      filters.originCity || 'any',
      filters.destinationCity || 'any',
      filters.departureDate || 'any',
      filters.minSeats || 'any',
      filters.maxPrice || 'any',
      filters.sortBy || 'time',
      filters.sortOrder || 'asc'
    ];
    
    return keyParts.join(':');
  }

  /**
   * Get popular routes from cache or calculate
   */
  async getPopularRoutes(limit = 10) {
    try {
      // Try enhanced cache first
      const cachedRoutes = await cacheService.getCachedPopularRoutes();
      if (cachedRoutes) {
        return cachedRoutes.slice(0, limit);
      }

      // Calculate popular routes from recent rides
      const recentRides = await Ride.search({
        status: 'published',
        limit: 1000,
        orderBy: 'publishedAt',
        orderDirection: 'desc'
      });

      const routeCounts = {};
      recentRides.forEach(ride => {
        const routeKey = `${ride.origin.city}-${ride.destination.city}`;
        routeCounts[routeKey] = (routeCounts[routeKey] || 0) + 1;
      });

      const popularRoutes = Object.entries(routeCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, limit)
        .map(([route, count]) => {
          const [origin, destination] = route.split('-');
          return { origin, destination, count };
        });

      // Cache using enhanced cache service
      await cacheService.cachePopularRoutes(popularRoutes);

      return popularRoutes;
    } catch (error) {
      logger.error('Error getting popular routes:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions based on partial input
   */
  async getSearchSuggestions(query, type = 'city') {
    try {
      // This is a basic implementation - in production, you'd use a proper
      // geocoding service or maintain a cities database
      const suggestions = [];
      
      if (type === 'city') {
        // Get unique cities from existing rides
        const rides = await Ride.search({ limit: 1000 });
        const cities = new Set();
        
        rides.forEach(ride => {
          cities.add(ride.origin.city);
          cities.add(ride.destination.city);
        });

        const filteredCities = Array.from(cities)
          .filter(city => city.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 10);

        suggestions.push(...filteredCities.map(city => ({ name: city, type: 'city' })));
      }

      return suggestions;
    } catch (error) {
      logger.error('Error getting search suggestions:', error);
      throw error;
    }
  }

  /**
   * Optimize routes based on efficiency and user preferences
   */
  async optimizeRoutes(rides, originCoords, destCoords) {
    try {
      const optimizedRides = [];

      for (const ride of rides) {
        // Calculate route efficiency score
        const directDistance = this.calculateDistance(
          originCoords.lat, originCoords.lng,
          destCoords.lat, destCoords.lng
        );

        const rideDistance = ride.route?.totalDistance || 
          this.calculateDistance(
            ride.origin.coordinates.lat, ride.origin.coordinates.lng,
            ride.destination.coordinates.lat, ride.destination.coordinates.lng
          );

        // Calculate detour factor (lower is better)
        const detourFactor = rideDistance / directDistance;
        
        // Calculate pickup/dropoff convenience
        const pickupDistance = this.calculateDistance(
          originCoords.lat, originCoords.lng,
          ride.origin.coordinates.lat, ride.origin.coordinates.lng
        );

        const dropoffDistance = this.calculateDistance(
          destCoords.lat, destCoords.lng,
          ride.destination.coordinates.lat, ride.destination.coordinates.lng
        );

        // Calculate optimization score (higher is better)
        const optimizationScore = this.calculateOptimizationScore({
          detourFactor,
          pickupDistance,
          dropoffDistance,
          pricePerKm: ride.pricePerSeat / rideDistance,
          driverRating: ride.driver.rating,
          availableSeats: ride.availableSeats
        });

        optimizedRides.push({
          ...ride,
          optimizationScore,
          routeEfficiency: {
            detourFactor: Math.round(detourFactor * 100) / 100,
            pickupDistance: Math.round(pickupDistance * 100) / 100,
            dropoffDistance: Math.round(dropoffDistance * 100) / 100,
            directDistance: Math.round(directDistance * 100) / 100
          }
        });
      }

      // Sort by optimization score (highest first)
      return optimizedRides.sort((a, b) => b.optimizationScore - a.optimizationScore);
    } catch (error) {
      logger.error('Error optimizing routes:', error);
      return rides;
    }
  }

  /**
   * Calculate optimization score for route efficiency
   */
  calculateOptimizationScore(factors) {
    const {
      detourFactor,
      pickupDistance,
      dropoffDistance,
      pricePerKm,
      driverRating,
      availableSeats
    } = factors;

    // Weights for different factors
    const weights = {
      detour: 0.3,        // Lower detour is better
      pickup: 0.2,        // Closer pickup is better
      dropoff: 0.2,       // Closer dropoff is better
      price: 0.15,        // Lower price per km is better
      rating: 0.1,        // Higher rating is better
      seats: 0.05         // More available seats is better
    };

    // Normalize and calculate weighted score
    const detourScore = Math.max(0, (2 - detourFactor) / 2) * 100; // Invert detour factor
    const pickupScore = Math.max(0, (10 - pickupDistance) / 10) * 100; // Max 10km penalty
    const dropoffScore = Math.max(0, (10 - dropoffDistance) / 10) * 100; // Max 10km penalty
    const priceScore = Math.max(0, (2 - pricePerKm) / 2) * 100; // Assume max 2 per km
    const ratingScore = (driverRating / 5) * 100;
    const seatsScore = Math.min(availableSeats / 4, 1) * 100; // Max 4 seats bonus

    return (
      detourScore * weights.detour +
      pickupScore * weights.pickup +
      dropoffScore * weights.dropoff +
      priceScore * weights.price +
      ratingScore * weights.rating +
      seatsScore * weights.seats
    );
  }

  /**
   * Apply flexible date/time search to expand results
   */
  async applyFlexibleSearch(rides, filters) {
    try {
      if (!filters.departureDate) {
        return rides;
      }

      const baseDate = new Date(filters.departureDate);
      const flexibleRides = [...rides];

      // Add rides from adjacent days if flexible dates enabled
      if (filters.flexibleDates) {
        const daysBefore = filters.flexibleDays?.before || 1;
        const daysAfter = filters.flexibleDays?.after || 1;

        for (let i = 1; i <= daysBefore; i++) {
          const prevDate = new Date(baseDate);
          prevDate.setDate(baseDate.getDate() - i);
          const prevDateRides = await this.getRidesForDate(prevDate, filters);
          flexibleRides.push(...prevDateRides);
        }

        for (let i = 1; i <= daysAfter; i++) {
          const nextDate = new Date(baseDate);
          nextDate.setDate(baseDate.getDate() + i);
          const nextDateRides = await this.getRidesForDate(nextDate, filters);
          flexibleRides.push(...nextDateRides);
        }
      }

      // Add rides with flexible times if enabled
      if (filters.flexibleTimes && filters.departureTimeFrom) {
        const timeBuffer = filters.timeBuffer || 2; // hours
        const baseTime = filters.departureTimeFrom;
        const [hours, minutes] = baseTime.split(':').map(Number);
        
        const earlierTime = new Date();
        earlierTime.setHours(Math.max(0, hours - timeBuffer), minutes);
        
        const laterTime = new Date();
        laterTime.setHours(Math.min(23, hours + timeBuffer), minutes);

        const flexibleTimeFilters = {
          ...filters,
          departureTimeFrom: earlierTime.toTimeString().slice(0, 5),
          departureTimeTo: laterTime.toTimeString().slice(0, 5)
        };

        const timeFlexibleRides = await Ride.search(flexibleTimeFilters);
        flexibleRides.push(...timeFlexibleRides);
      }

      // Remove duplicates and mark flexible results
      const uniqueRides = this.removeDuplicateRides(flexibleRides);
      return uniqueRides.map(ride => ({
        ...ride,
        isFlexibleResult: !this.isExactMatch(ride, filters)
      }));

    } catch (error) {
      logger.error('Error applying flexible search:', error);
      return rides;
    }
  }

  /**
   * Get rides for a specific date
   */
  async getRidesForDate(date, originalFilters) {
    const dateString = date.toISOString().split('T')[0];
    const dateFilters = {
      ...originalFilters,
      departureDate: dateString
    };
    
    try {
      return await Ride.search(dateFilters);
    } catch (error) {
      logger.error(`Error fetching rides for date ${dateString}:`, error);
      return [];
    }
  }

  /**
   * Remove duplicate rides from flexible search results
   */
  removeDuplicateRides(rides) {
    const seen = new Set();
    return rides.filter(ride => {
      const key = `${ride.id || ride._id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if ride matches exact search criteria
   */
  isExactMatch(ride, filters) {
    if (filters.departureDate && ride.departureDate !== filters.departureDate) {
      return false;
    }
    
    if (filters.departureTimeFrom && filters.departureTimeTo) {
      const rideTime = ride.departureTime;
      if (rideTime < filters.departureTimeFrom || rideTime > filters.departureTimeTo) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get alternative routes using different waypoints or paths
   */
  async getAlternativeRoutes(filters) {
    try {
      if (!filters.originCoordinates || !filters.destinationCoordinates) {
        return null;
      }

      const alternatives = [];
      
      // Get route via Google Maps API for comparison
      const directRoute = await mapsService.getRoute(
        filters.originCoordinates,
        filters.destinationCoordinates
      );

      if (directRoute) {
        alternatives.push({
          type: 'direct',
          route: directRoute,
          description: 'Direct route'
        });
      }

      // Find rides that use different intermediate cities
      const intermediateRoutes = await this.findIntermediateRoutes(
        filters.originCoordinates,
        filters.destinationCoordinates
      );

      alternatives.push(...intermediateRoutes);

      return alternatives.slice(0, 3); // Limit to 3 alternatives
    } catch (error) {
      logger.error('Error getting alternative routes:', error);
      return null;
    }
  }

  /**
   * Find routes with intermediate stops that could be alternatives
   */
  async findIntermediateRoutes(originCoords, destCoords) {
    try {
      // Find rides that pass through intermediate cities
      const allRides = await Ride.search({ limit: 500 });
      const intermediateRoutes = [];
      const processedCities = new Set();

      for (const ride of allRides) {
        // Check if this ride could be part of a multi-leg journey
        const originDistance = this.calculateDistance(
          originCoords.lat, originCoords.lng,
          ride.origin.coordinates.lat, ride.origin.coordinates.lng
        );

        const destDistance = this.calculateDistance(
          destCoords.lat, destCoords.lng,
          ride.destination.coordinates.lat, ride.destination.coordinates.lng
        );

        // If ride starts near origin or ends near destination, it could be part of alternative
        if ((originDistance <= 50 || destDistance <= 50) && 
            !processedCities.has(ride.destination.city)) {
          
          processedCities.add(ride.destination.city);
          
          // Look for connecting rides from this intermediate city
          const connectingRides = await this.findConnectingRides(
            ride.destination.coordinates,
            destCoords,
            ride.destination.city
          );

          if (connectingRides.length > 0) {
            intermediateRoutes.push({
              type: 'multi-leg',
              via: ride.destination.city,
              firstLeg: ride,
              connectingRides: connectingRides.slice(0, 2),
              description: `Route via ${ride.destination.city}`
            });
          }
        }
      }

      return intermediateRoutes.slice(0, 2); // Limit intermediate routes
    } catch (error) {
      logger.error('Error finding intermediate routes:', error);
      return [];
    }
  }

  /**
   * Find rides connecting from intermediate city to destination
   */
  async findConnectingRides(intermediateCoords, destCoords, intermediateCity) {
    try {
      const connectingRides = await Ride.search({
        originCity: intermediateCity,
        limit: 10
      });

      return connectingRides.filter(ride => {
        const distance = this.calculateDistance(
          destCoords.lat, destCoords.lng,
          ride.destination.coordinates.lat, ride.destination.coordinates.lng
        );
        return distance <= 20; // Within 20km of final destination
      });
    } catch (error) {
      logger.error('Error finding connecting rides:', error);
      return [];
    }
  }
}


module.exports = new SearchService();
