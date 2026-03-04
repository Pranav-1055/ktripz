const Vehicle = require('../models/Vehicle');
const vehicleService = require('./vehicleService');
const { getDatabase } = require('../config/firebase');
const logger = require('../utils/logger');

class RideService {
  constructor() {
    // Don't initialize Firebase here - it will be initialized by the server
    this.db = null;
  }

  normalizeCoordinates(coords) {
    if (!coords) return null;
    // Array format: [lng, lat]
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    // Object format: { lat, lng } or { latitude, longitude }
    if (typeof coords === 'object') {
      const lat = Number(coords.lat ?? coords.latitude);
      const lng = Number(coords.lng ?? coords.lon ?? coords.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    return null;
  }

  normalizeLocation(location, fallbackName = '') {
    if (!location || typeof location !== 'object') {
      return { city: fallbackName || '', coordinates: null };
    }
    const city = location.city || location.name || fallbackName || '';
    const coordinates = this.normalizeCoordinates(location.coordinates || location);
    return { city, coordinates };
  }

  getRideDepartureDateTime(ride) {
    if (!ride) return null;
    const datePart = ride.departureDate;
    const timePart = ride.departureTime;
    if (!datePart || !timePart) return null;
    const departure = new Date(`${datePart}T${timePart}`);
    if (Number.isNaN(departure.getTime())) return null;
    return departure;
  }

  isRideVisibleForPassenger(ride) {
    if (!ride) return false;
    if ((ride.status || '').toLowerCase() !== 'published') return false;
    const availableSeats = Number(ride.availableSeats ?? 0);
    if (!Number.isFinite(availableSeats) || availableSeats <= 0) return false;
    const departure = this.getRideDepartureDateTime(ride);
    if (!departure) return false;
    return departure > new Date();
  }

  /**
   * Get database instance (lazy initialization)
   */
  getDB() {
    if (!this.db) {
      this.db = getDatabase();
    }
    return this.db;
  }

  /**
   * Create a new ride with vehicle integration
   */
  async createRide(driverId, rideData) {
    try {
      const { vehicleId, ...otherRideData } = rideData;

      // Validate and get vehicle data
      const vehicle = await this.validateVehicleForRide(vehicleId, driverId);

      const origin = this.normalizeLocation(rideData.origin, rideData.origin?.city);
      const destination = this.normalizeLocation(rideData.destination, rideData.destination?.city);

      // Create enhanced ride data with vehicle information
      const enhancedRideData = {
        ...otherRideData,
        driverId,
        origin,
        destination,
        vehicle: {
          id: vehicle.id,
          make: vehicle.details.make,
          model: vehicle.details.model,
          year: vehicle.details.year,
          color: vehicle.details.color,
          licensePlate: vehicle.details.licensePlate,
          seats: vehicle.details.seats,
          fuelType: vehicle.details.fuelType,
          transmission: vehicle.details.transmission,
          amenities: vehicle.amenities || [],
          verified: vehicle.isFullyVerified,
          verificationLevel: vehicle.verification.verificationLevel || 'basic',
          type: this.getVehicleCategory(vehicle.details)
        },
        totalSeats: Math.min(rideData.totalSeats || vehicle.details.seats, vehicle.details.seats),
        availableSeats: Math.min(rideData.totalSeats || vehicle.details.seats, vehicle.details.seats),
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save ride to Firebase
      const newRideRef = this.getDB().ref('rides').push();
      await newRideRef.set(enhancedRideData);

      // Also save to Firestore for advanced search
      try {
        const { getFirestore } = require('../config/firebase');
        const db = getFirestore();
        await db.collection('rides').doc(newRideRef.key).set({
          id: newRideRef.key,
          ...enhancedRideData,
          publishedAt: new Date().toISOString()
        }, { merge: true });
      } catch (fsError) {
        logger.error('Failed to save ride to Firestore:', fsError);
      }

      // Update vehicle usage statistics
      await this.updateVehicleUsage(vehicle.id, 'ride_created');

      return {
        id: newRideRef.key,
        ...enhancedRideData
      };
    } catch (error) {
      logger.error('Error creating ride:', error);
      throw error;
    }
  }

  /**
   * Validate vehicle can be used for rides
   */
  async validateVehicleForRide(vehicleId, driverId) {
    try {
      const vehicle = await vehicleService.getVehicleById(vehicleId, driverId);

      if (!vehicle) {
        throw new Error('Vehicle not found or does not belong to you');
      }

      // Relaxed check for startup phase: Only check if vehicle is active
      if (vehicle.status !== 'active') {
        throw new Error(`Vehicle cannot be used for rides: Status is ${vehicle.status}`);
      }

      /* Strict verification disabled for now
      if (!vehicle.canBeUsedForRides()) {
        const reasons = [];

        if (vehicle.status !== 'active') {
          reasons.push(`Vehicle status is ${vehicle.status}`);
        }

        if (vehicle.verification.status !== 'verified') {
          reasons.push(`Vehicle verification status is ${vehicle.verification.status}`);
        }

        if (!vehicle.isFullyVerified) {
          reasons.push('Vehicle documents are not fully verified');
        }

        throw new Error(`Vehicle cannot be used for rides: ${reasons.join(', ')}`);
      }
      */

      return vehicle;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get rides with enhanced vehicle information and advanced filtering
   */
  async searchRides(filters = {}) {
    try {
      const {
        origin,
        destination,
        date,
        passengers = 1,
        vehicleType,
        amenities,
        fuelType,
        transmission,
        minRating,
        maxPrice,
        sortBy = 'departureTime',
        sortOrder = 'asc',
        limit = 20,
        offset = 0
      } = filters;

      // Get all published rides
      const ridesRef = this.getDB().ref('rides');
      let query = ridesRef;
      if (ridesRef && typeof ridesRef.orderByChild === 'function') {
        query = ridesRef.orderByChild('status').equalTo('published');
      }

      const snapshot = await query.once('value');
      let rides = [];
      let totalCount = 0;

      const snapshotHasData = typeof snapshot.exists === 'function' ? snapshot.exists() : !!snapshot.val?.();
      if (snapshotHasData) {
        const ridesData = snapshot.val();
        rides = Object.entries(ridesData).map(([id, data]) => ({
          id,
          ...data
        }));

        totalCount = rides.length;

        // Passenger-facing visibility rules: hide full and expired rides.
        rides = rides.filter((ride) => this.isRideVisibleForPassenger(ride));

        // Apply basic filters
        if (origin) {
          rides = rides.filter(ride =>
            ride.origin?.city?.toLowerCase().includes(origin.toLowerCase()) ||
            ride.origin?.address?.toLowerCase().includes(origin.toLowerCase())
          );
        }

        if (destination) {
          rides = rides.filter(ride =>
            ride.destination?.city?.toLowerCase().includes(destination.toLowerCase()) ||
            ride.destination?.address?.toLowerCase().includes(destination.toLowerCase())
          );
        }

        if (date) {
          rides = rides.filter(ride => ride.departureDate === date);
        }

        if (passengers) {
          rides = rides.filter(ride => ride.availableSeats >= parseInt(passengers));
        }

        if (maxPrice) {
          rides = rides.filter(ride => ride.pricePerSeat <= parseFloat(maxPrice));
        }

        // Apply vehicle-based filters
        if (vehicleType) {
          rides = rides.filter(ride => {
            if (!ride.vehicle) return false;
            const vehicleName = `${ride.vehicle.make || ''} ${ride.vehicle.model || ''}`.toLowerCase();
            const vehicleCategory = this.getVehicleCategory(ride.vehicle);
            return vehicleName.includes(vehicleType.toLowerCase()) ||
              vehicleCategory.toLowerCase().includes(vehicleType.toLowerCase());
          });
        }

        if (amenities && amenities.length > 0) {
          const amenitiesArray = Array.isArray(amenities) ? amenities : amenities.split(',');
          rides = rides.filter(ride => {
            const rideAmenities = ride.vehicle?.amenities || [];
            return amenitiesArray.every(amenity =>
              rideAmenities.includes(amenity.trim())
            );
          });
        }

        if (fuelType) {
          rides = rides.filter(ride =>
            ride.vehicle?.fuelType?.toLowerCase() === fuelType.toLowerCase()
          );
        }

        if (transmission) {
          rides = rides.filter(ride =>
            ride.vehicle?.transmission?.toLowerCase() === transmission.toLowerCase()
          );
        }

        // Enhance with driver information and apply driver filters
        for (let ride of rides) {
          try {
            const driverRef = this.getDB().ref(`users/${ride.driverId}`);
            const driverSnapshot = await driverRef.once('value');
            if (driverSnapshot.exists()) {
              const driverData = driverSnapshot.val();
              ride.driver = {
                name: driverData.fullName || driverData.name || 'Driver',
                rating: driverData.rating || 4.5,
                reviewCount: driverData.reviewCount || 0,
                memberSince: driverData.createdAt,
                verified: driverData.emailVerified || false,
                avatar: driverData.photoURL,
                verificationLevel: this.getDriverVerificationLevel(driverData)
              };
            }
          } catch (error) {
            logger.error(`Error fetching driver data for ride ${ride.id}:`, error);
            // Set default driver info if fetch fails
            ride.driver = {
              name: 'Driver',
              rating: 4.5,
              reviewCount: 0,
              verified: false,
              verificationLevel: 'basic'
            };
          }
        }

        // Apply driver-based filters
        if (minRating) {
          rides = rides.filter(ride =>
            (ride.driver?.rating || 0) >= parseFloat(minRating)
          );
        }

        // Enhanced sorting
        rides.sort((a, b) => {
          let comparison = 0;

          switch (sortBy) {
            case 'price':
              comparison = a.pricePerSeat - b.pricePerSeat;
              break;
            case 'rating':
              comparison = (b.driver?.rating || 0) - (a.driver?.rating || 0);
              break;
            case 'departureTime':
            default:
              const dateA = new Date(`${a.departureDate}T${a.departureTime}`);
              const dateB = new Date(`${b.departureDate}T${b.departureTime}`);
              comparison = dateA - dateB;
              break;
          }

          return sortOrder === 'desc' ? -comparison : comparison;
        });

        // Apply pagination
        const paginatedRides = rides.slice(offset, offset + limit);

        // Enhance vehicle information with additional details
        for (let ride of paginatedRides) {
          if (ride.vehicle?.id) {
            try {
              const vehicle = await Vehicle.findById(ride.vehicle.id);
              if (vehicle) {
                ride.vehicle = {
                  ...ride.vehicle,
                  photos: vehicle.photos?.filter(photo => photo.verified).slice(0, 3) || [],
                  specifications: vehicle.specifications || {},
                  rules: vehicle.specifications?.rules || [],
                  maxBaggage: vehicle.specifications?.maxBaggage || 2,
                  verificationLevel: vehicle.verification?.verificationLevel || 'basic',
                  totalRides: vehicle.usage?.totalRides || 0,
                  averageRating: vehicle.usage?.averageRating || 0
                };
              }
            } catch (error) {
              logger.error('Error fetching additional vehicle data:', error);
            }
          }
        }

        rides = paginatedRides;
      }

      return {
        rides,
        total: totalCount,
        filteredTotal: rides.length,
        limit,
        offset,
        filters: {
          origin,
          destination,
          date,
          passengers,
          vehicleType,
          amenities,
          fuelType,
          transmission,
          minRating,
          maxPrice,
          sortBy,
          sortOrder
        },
        vehicleStats: this.getVehicleFilterStats(rides)
      };
    } catch (error) {
      logger.error('Error searching rides:', error);
      throw error;
    }
  }

  /**
   * Get vehicle category for filtering
   */
  getVehicleCategory(vehicle) {
    if (!vehicle) return 'unknown';

    const seats = vehicle.seats || 0;
    const make = (vehicle.make || '').toLowerCase();

    // Categorize by seats and make
    if (seats <= 2) {
      return 'bike';
    } else if (seats === 3 && (make.includes('bajaj') || make.includes('auto') || make.includes('rickshaw'))) {
      return 'auto';
    } else if ((seats >= 6 && seats <= 10) && (make.includes('magic') || model.includes('magic'))) {
      return 'magic';
    } else if (seats <= 4) {
      if (make.includes('maruti') || make.includes('hyundai') || make.includes('tata')) {
        return 'hatchback';
      }
      return 'sedan';
    } else if (seats <= 7) {
      return 'suv';
    } else {
      return 'van';
    }
  }

  /**
   * Get driver verification level
   */
  getDriverVerificationLevel(driverData) {
    if (!driverData) return 'basic';

    let level = 'basic';

    if (driverData.emailVerified && driverData.phoneVerified) {
      level = 'verified';
    }

    if (driverData.reviewCount >= 10 && driverData.rating >= 4.5) {
      level = 'experienced';
    }

    return level;
  }

  /**
   * Get vehicle filter statistics for search results
   */
  getVehicleFilterStats(rides) {
    const stats = {
      fuelTypes: {},
      transmissions: {},
      amenities: {},
      priceRange: { min: Infinity, max: 0 },
      seatRange: { min: Infinity, max: 0 }
    };

    rides.forEach(ride => {
      const vehicle = ride.vehicle;
      if (!vehicle) return;

      // Fuel types
      if (vehicle.fuelType) {
        stats.fuelTypes[vehicle.fuelType] = (stats.fuelTypes[vehicle.fuelType] || 0) + 1;
      }

      // Transmissions
      if (vehicle.transmission) {
        stats.transmissions[vehicle.transmission] = (stats.transmissions[vehicle.transmission] || 0) + 1;
      }

      // Amenities
      if (vehicle.amenities) {
        vehicle.amenities.forEach(amenity => {
          stats.amenities[amenity] = (stats.amenities[amenity] || 0) + 1;
        });
      }

      // Price range
      if (ride.pricePerSeat) {
        stats.priceRange.min = Math.min(stats.priceRange.min, ride.pricePerSeat);
        stats.priceRange.max = Math.max(stats.priceRange.max, ride.pricePerSeat);
      }

      // Seat range
      if (vehicle.seats) {
        stats.seatRange.min = Math.min(stats.seatRange.min, vehicle.seats);
        stats.seatRange.max = Math.max(stats.seatRange.max, vehicle.seats);
      }
    });

    // Handle edge cases
    if (stats.priceRange.min === Infinity) {
      stats.priceRange = { min: 0, max: 0 };
    }
    if (stats.seatRange.min === Infinity) {
      stats.seatRange = { min: 0, max: 0 };
    }

    return stats;
  }

  /**
   * Get ride details with vehicle information
   */
  async getRideById(rideId) {
    try {
      const rideRef = this.getDB().ref(`rides/${rideId}`);
      const snapshot = await rideRef.once('value');

      if (!snapshot.exists()) {
        throw new Error('Ride not found');
      }

      const rideData = snapshot.val();
      const ride = { id: rideId, ...rideData };

      // Enhance with driver information
      try {
        const driverRef = this.getDB().ref(`users/${ride.driverId}`);
        const driverSnapshot = await driverRef.once('value');
        if (driverSnapshot.exists()) {
          const driverData = driverSnapshot.val();
          ride.driver = {
            name: driverData.fullName,
            rating: driverData.rating || 4.5,
            reviewCount: driverData.reviewCount || 0,
            memberSince: driverData.createdAt,
            verified: driverData.emailVerified || false,
            avatar: driverData.photoURL
          };
        }
      } catch (error) {
        logger.error('Error fetching driver data:', error);
      }

      // Get additional vehicle details if needed
      if (ride.vehicle && ride.vehicle.id) {
        try {
          const vehicle = await Vehicle.findById(ride.vehicle.id);
          if (vehicle) {
            ride.vehicle.photos = vehicle.photos || [];
            ride.vehicle.specifications = vehicle.specifications || {};
            ride.vehicle.rules = vehicle.specifications.rules || [];
            ride.vehicle.maxBaggage = vehicle.specifications.maxBaggage || 2;
          }
        } catch (error) {
          logger.error('Error fetching additional vehicle data:', error);
        }
      }

      return ride;
    } catch (error) {
      logger.error('Error getting ride by ID:', error);
      throw error;
    }
  }

  /**
   * Update ride with vehicle validation
   */
  async updateRide(rideId, driverId, updateData) {
    try {
      // Check if ride exists and belongs to user
      const rideRef = this.getDB().ref(`rides/${rideId}`);
      const snapshot = await rideRef.once('value');

      if (!snapshot.exists()) {
        throw new Error('Ride not found');
      }

      const rideData = snapshot.val();
      if (rideData.driverId !== driverId) {
        throw new Error('You can only update your own rides');
      }

      // If vehicle is being changed, validate new vehicle
      if (updateData.vehicleId && updateData.vehicleId !== rideData.vehicle.id) {
        const vehicle = await this.validateVehicleForRide(updateData.vehicleId, driverId);

        updateData.vehicle = {
          id: vehicle.id,
          make: vehicle.details.make,
          model: vehicle.details.model,
          year: vehicle.details.year,
          color: vehicle.details.color,
          licensePlate: vehicle.details.licensePlate,
          seats: vehicle.details.seats,
          fuelType: vehicle.details.fuelType,
          transmission: vehicle.details.transmission,
          amenities: vehicle.amenities || [],
          verified: vehicle.isFullyVerified,
          verificationLevel: vehicle.verification.verificationLevel || 'basic'
        };

        // Update total seats if vehicle changed
        if (updateData.totalSeats > vehicle.details.seats) {
          updateData.totalSeats = vehicle.details.seats;
        }
      }

      // Prepare update data
      const finalUpdateData = {
        ...updateData,
        updatedAt: new Date().toISOString()
      };

      // If totalSeats is being updated, adjust availableSeats
      if (updateData.totalSeats) {
        const bookedSeats = rideData.totalSeats - rideData.availableSeats;
        finalUpdateData.availableSeats = Math.max(0, updateData.totalSeats - bookedSeats);
      }

      // Remove vehicleId from update data as we've processed it
      delete finalUpdateData.vehicleId;

      // Update ride
      await rideRef.update(finalUpdateData);

      // Fetch updated ride
      const updatedSnapshot = await rideRef.once('value');
      return { id: rideId, ...updatedSnapshot.val() };
    } catch (error) {
      logger.error('Error updating ride:', error);
      throw error;
    }
  }

  /**
   * Get provider's rides with vehicle information
   */
  async getProviderRides(driverId, filters = {}) {
    try {
      const { status, limit = 20, offset = 0 } = filters;

      // Get user's rides
      const ridesRef = this.getDB().ref('rides');
      const query = ridesRef.orderByChild('driverId').equalTo(driverId);

      const snapshot = await query.once('value');
      let rides = [];

      if (snapshot.exists()) {
        const ridesData = snapshot.val();
        rides = Object.entries(ridesData).map(([id, data]) => ({
          id,
          ...data
        }));

        // Filter by status if provided
        if (status) {
          rides = rides.filter(ride => ride.status === status);
        }

        // Sort by creation date (newest first)
        rides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Apply pagination
        rides = rides.slice(offset, offset + limit);

        // Enhance with vehicle utilization data
        for (let ride of rides) {
          if (ride.vehicle && ride.vehicle.id) {
            try {
              const vehicle = await Vehicle.findById(ride.vehicle.id);
              if (vehicle) {
                ride.vehicle.totalRides = vehicle.usage.totalRides || 0;
                ride.vehicle.averageRating = vehicle.usage.averageRating || 0;
                ride.vehicle.lastUsed = vehicle.usage.lastUsed;
              }
            } catch (error) {
              logger.error('Error fetching vehicle usage data:', error);
            }
          }
        }
      }

      return {
        rides,
        total: rides.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error fetching provider rides:', error);
      throw error;
    }
  }

  /**
   * Update vehicle usage statistics
   */
  async updateVehicleUsage(vehicleId, action, additionalData = {}) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) return;

      switch (action) {
        case 'ride_created':
          // No immediate update needed
          break;

        case 'ride_completed':
          vehicle.usage.totalRides = (vehicle.usage.totalRides || 0) + 1;
          vehicle.usage.lastUsed = new Date();
          if (additionalData.distance) {
            vehicle.usage.totalDistance = (vehicle.usage.totalDistance || 0) + additionalData.distance;
          }
          break;

        case 'rating_updated':
          if (additionalData.rating) {
            const currentRating = vehicle.usage.averageRating || 0;
            const currentCount = vehicle.usage.totalRides || 0;
            const newRating = ((currentRating * currentCount) + additionalData.rating) / (currentCount + 1);
            vehicle.usage.averageRating = Math.round(newRating * 10) / 10;
          }
          break;
      }

      await vehicle.save();
    } catch (error) {
      logger.error('Error updating vehicle usage:', error);
    }
  }

  /**
   * Get available filter options for search
   */
  async getAvailableFilters() {
    try {
      const vehicles = await Vehicle.find({
        'verification.status': 'verified',
        'status': 'active'
      });

      const filters = {
        fuelTypes: [...new Set(vehicles.map(v => v.details.fuelType).filter(Boolean))],
        transmissions: [...new Set(vehicles.map(v => v.details.transmission).filter(Boolean))],
        amenities: [...new Set(vehicles.flatMap(v => v.amenities || []))],
        vehicleMakes: [...new Set(vehicles.map(v => v.details.make).filter(Boolean))],
        vehicleCategories: ['hatchback', 'sedan', 'suv', 'van'],
        priceRanges: [
          { label: 'Under ₹200', min: 0, max: 200 },
          { label: '₹200 - ₹500', min: 200, max: 500 },
          { label: '₹500 - ₹1000', min: 500, max: 1000 },
          { label: 'Above ₹1000', min: 1000, max: null }
        ]
      };

      return filters;
    } catch (error) {
      logger.error('Error getting available filters:', error);
      throw error;
    }
  }

  /**
   * Get popular routes based on ride frequency
   */
  async getPopularRoutes() {
    try {
      const ridesRef = this.getDB().ref('rides');
      const snapshot = await ridesRef.once('value');

      const routeCount = {};

      if (snapshot.exists()) {
        const ridesData = snapshot.val();
        Object.values(ridesData).forEach(ride => {
          if (ride.status === 'published' || ride.status === 'completed') {
            const routeKey = `${ride.origin?.city}-${ride.destination?.city}`;
            routeCount[routeKey] = (routeCount[routeKey] || 0) + 1;
          }
        });
      }

      // Sort by frequency and return top 10
      const popularRoutes = Object.entries(routeCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([route, count]) => {
          const [origin, destination] = route.split('-');
          return { origin, destination, rideCount: count };
        });

      return popularRoutes;
    } catch (error) {
      logger.error('Error getting popular routes:', error);
      throw error;
    }
  }

  /**
   * Get vehicle statistics for search results
   */
  async getVehicleStatsForSearch(filters) {
    try {
      const searchResult = await this.searchRides({ ...filters, limit: 1000 });
      return searchResult.vehicleStats;
    } catch (error) {
      logger.error('Error getting vehicle stats for search:', error);
      throw error;
    }
  }

  /**
   * Get vehicle utilization report for provider
   */
  async getVehicleUtilizationReport(driverId) {
    try {
      const vehicles = await vehicleService.getVehiclesByOwner(driverId);
      const utilizationReport = [];

      for (const vehicle of vehicles) {
        // Get rides for this vehicle
        const ridesRef = this.getDB().ref('rides');
        const ridesQuery = ridesRef.orderByChild('driverId').equalTo(driverId);
        const ridesSnapshot = await ridesQuery.once('value');

        let vehicleRides = [];
        if (ridesSnapshot.exists()) {
          const ridesData = ridesSnapshot.val();
          vehicleRides = Object.entries(ridesData)
            .map(([id, data]) => ({ id, ...data }))
            .filter(ride => ride.vehicle && ride.vehicle.id === vehicle.id);
        }

        const totalRides = vehicleRides.length;
        const completedRides = vehicleRides.filter(ride => ride.status === 'completed').length;
        const cancelledRides = vehicleRides.filter(ride => ride.status === 'cancelled').length;
        const totalEarnings = vehicleRides
          .filter(ride => ride.status === 'completed')
          .reduce((sum, ride) => {
            const bookedSeats = ride.totalSeats - ride.availableSeats;
            return sum + (ride.pricePerSeat * bookedSeats);
          }, 0);

        // Calculate utilization metrics
        const utilizationRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 0;
        const averageEarningsPerRide = completedRides > 0 ? Math.round(totalEarnings / completedRides) : 0;

        // Get recent activity
        const recentRides = vehicleRides
          .filter(ride => {
            const rideDate = new Date(ride.departureDate);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return rideDate >= thirtyDaysAgo;
          }).length;

        utilizationReport.push({
          vehicle: {
            id: vehicle.id,
            make: vehicle.details.make,
            model: vehicle.details.model,
            licensePlate: vehicle.details.licensePlate,
            year: vehicle.details.year,
            color: vehicle.details.color,
            seats: vehicle.details.seats,
            fuelType: vehicle.details.fuelType,
            transmission: vehicle.details.transmission,
            verificationStatus: vehicle.verification.status,
            photos: vehicle.photos?.filter(photo => photo.verified).slice(0, 1) || []
          },
          stats: {
            totalRides,
            completedRides,
            cancelledRides,
            utilizationRate,
            totalEarnings,
            averageEarningsPerRide,
            lastUsed: vehicle.usage?.lastUsed,
            averageRating: vehicle.usage?.averageRating || 0,
            recentActivity: recentRides,
            status: vehicle.status
          },
          recommendations: this.getVehicleRecommendations(vehicle, {
            totalRides,
            completedRides,
            utilizationRate,
            recentActivity: recentRides
          })
        });
      }

      return utilizationReport.sort((a, b) => b.stats.totalRides - a.stats.totalRides);
    } catch (error) {
      logger.error('Error generating vehicle utilization report:', error);
      throw error;
    }
  }

  /**
   * Get recommendations for vehicle optimization
   */
  getVehicleRecommendations(vehicle, stats) {
    const recommendations = [];

    if (stats.utilizationRate < 50) {
      recommendations.push({
        type: 'low_utilization',
        message: 'Consider offering more competitive pricing or popular routes',
        priority: 'medium'
      });
    }

    if (stats.recentActivity === 0) {
      recommendations.push({
        type: 'inactive',
        message: 'Vehicle has been inactive for 30+ days. Consider promoting it',
        priority: 'high'
      });
    }

    if (vehicle.verification.status !== 'verified') {
      recommendations.push({
        type: 'verification',
        message: 'Complete vehicle verification to increase bookings',
        priority: 'high'
      });
    }

    if (!vehicle.photos || vehicle.photos.length === 0) {
      recommendations.push({
        type: 'photos',
        message: 'Add vehicle photos to attract more passengers',
        priority: 'medium'
      });
    }

    if (vehicle.amenities.length < 3) {
      recommendations.push({
        type: 'amenities',
        message: 'Add more amenities to make your vehicle more attractive',
        priority: 'low'
      });
    }

    return recommendations;
  }

  /**
  * Get available vehicles for ride creation
  */
  async getAvailableVehiclesForRide(driverId) {
    try {
      logger.info(`Fetching available vehicles for driver: ${driverId}`);
      if (!driverId) {
        logger.warn('getAvailableVehiclesForRide called with null/undefined driverId');
        return [];
      }

      let vehicles = [];
      try {
        // Relaxed fetch: Get all active vehicles regardless of verification status
        vehicles = await vehicleService.getVehiclesByOwner(driverId, {
          active: true
        });
      } catch (svcError) {
        logger.error(`Error in vehicleService.getVehiclesByOwner for ${driverId}:`, svcError);
        // Return empty array instead of crashing if service fails
        return [];
      }

      if (!Array.isArray(vehicles)) {
        logger.warn(`Expected array of vehicles but got ${typeof vehicles}:`, vehicles);
        return [];
      }

      logger.info(`Found ${vehicles.length} vehicles for driver ${driverId}`);

      const availableVehicles = vehicles
        .filter(vehicle => {
          try {
            if (!vehicle) return false;
            // Relaxed check: Allow ANY active vehicle for now
            return vehicle.status === 'active';
          } catch (err) {
            logger.error(`Error checking vehicle ${vehicle?._id}:`, err);
            return false;
          }
        })
        .map(vehicle => {
          try {
            return {
              id: vehicle.id,
              make: vehicle.details?.make || 'Unknown',
              model: vehicle.details?.model || 'Unknown',
              year: vehicle.details?.year,
              color: vehicle.details?.color,
              licensePlate: vehicle.details?.licensePlate || 'Unknown',
              seats: vehicle.details?.seats || 1,
              fuelType: vehicle.details?.fuelType,
              transmission: vehicle.details?.transmission,
              amenities: Array.isArray(vehicle.amenities) ? vehicle.amenities : [],
              photos: Array.isArray(vehicle.photos)
                ? vehicle.photos.filter(p => p && p.verified).slice(0, 3)
                : [],
              verificationLevel: vehicle.verification?.verificationLevel || 'basic'
            };
          } catch (mapErr) {
            logger.error(`Error mapping vehicle ${vehicle?._id}:`, mapErr);
            return null;
          }
        })
        .filter(v => v !== null); // Remove any failed mappings

      return availableVehicles;
    } catch (error) {
      logger.error('Error getting available vehicles:', error);
      // Don't throw, just return empty to avoid UI crash
      return [];
    }
  }

  /**
   * Create a ride from predefined route
   */
  async createRideFromRoute(driverId, rideData) {
    try {
      const {
        source,
        destination,
        intermediateStops,
        rideDate,
        rideTime,
        availableSeats,
        pricePerSeat,
        vehicle,
        routeId
      } = rideData;

      // Validate predefined route if provided (legacy/create-from-map fallback may omit routeId)
      const { getFirestore } = require('../config/firebase');
      const db = getFirestore();
      let routeData_db = null;

      if (routeId) {
        const routeDoc = await db.collection('routes').doc(routeId).get();
        if (!routeDoc.exists) {
          throw new Error('Predefined route not found');
        }

        routeData_db = routeDoc.data();
        if (!routeData_db.active) {
          throw new Error('Predefined route is not active');
        }
      }

      // Validate vehicle exists and belongs to driver
      const vehicleData = await this.validateVehicleForRide(vehicle.id, driverId);

      // Check vehicle capacity
      if (availableSeats > vehicleData.details.seats) {
        throw new Error(`Vehicle capacity exceeded. Maximum seats: ${vehicleData.details.seats}`);
      }

      // Create ride data structure
      const origin = this.normalizeLocation(
        { ...source, city: source?.city || source?.name },
        source?.name
      );
      const normalizedDestination = this.normalizeLocation(
        { ...destination, city: destination?.city || destination?.name },
        destination?.name
      );

      const destinationForRide = { ...normalizedDestination, name: destination?.name };

      const enhancedRideData = {
        driverId,
        source: {
          name: source.name,
          city: origin.city,
          coordinates: origin.coordinates
        },
        origin: { ...origin, name: source?.name },
        destination: destinationForRide,
        intermediateStops: intermediateStops || [],
        departureDate: rideDate,
        departureTime: rideTime,
        totalSeats: availableSeats,
        availableSeats: availableSeats,
        pricePerSeat: parseFloat(pricePerSeat),
        vehicle: {
          id: vehicleData.id,
          make: vehicleData.details.make,
          model: vehicleData.details.model,
          year: vehicleData.details.year,
          color: vehicleData.details.color,
          licensePlate: vehicleData.details.licensePlate,
          seats: vehicleData.details.seats,
          fuelType: vehicleData.details.fuelType,
          transmission: vehicleData.details.transmission,
          amenities: vehicleData.amenities || [],
          verified: vehicleData.isFullyVerified,
          verificationLevel: vehicleData.verification.verificationLevel || 'basic',
          type: this.getVehicleCategory(vehicleData.details)
        },
        routeInfo: {
          routeId: routeId || null,
          createdFromPredefinedRoute: !!routeId,
          originalRoute: {
            source: routeData_db?.source || null,
            destination: routeData_db?.destination || null,
            stops: routeData_db?.stops || []
          }
        },
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preferences: {
          smoking: false,
          pets: false,
          instantBooking: true
        }
      };

      // Save ride to Firebase Realtime Database
      const newRideRef = this.getDB().ref('rides').push();
      await newRideRef.set(enhancedRideData);

      // Also save to Firestore for advanced search
      try {
        const { getFirestore } = require('../config/firebase');
        const db = getFirestore();
        await db.collection('rides').doc(newRideRef.key).set({
          id: newRideRef.key,
          ...enhancedRideData,
          publishedAt: new Date().toISOString()
        }, { merge: true });
      } catch (fsError) {
        logger.error('Failed to save ride to Firestore:', fsError);
      }

      // Update vehicle usage statistics
      await this.updateVehicleUsage(vehicleData.id, 'ride_created');

      logger.info(`Ride created from predefined route: ${newRideRef.key} by driver ${driverId}`);

      return {
        id: newRideRef.key,
        ...enhancedRideData
      };
    } catch (error) {
      logger.error('Error creating ride from route:', error);
      throw error;
    }
  }
}

module.exports = new RideService();
