const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class Ride {
  constructor(data) {
    this.id = data.id;
    this.driverId = data.driverId;
    this.origin = data.origin || {};
    this.destination = data.destination || {};
    this.departureDate = data.departureDate;
    this.departureTime = data.departureTime;
    this.arrivalTime = data.arrivalTime;
    this.pricePerSeat = data.pricePerSeat || 0;
    this.totalSeats = data.totalSeats || 1;
    this.availableSeats = data.availableSeats || data.totalSeats || 1;
    this.driver = data.driver || {};
    this.vehicle = data.vehicle || {};
    this.route = data.route || {};
    this.preferences = {
      luggageAllowed: data.preferences?.luggageAllowed || false,
      luggageCapacity: data.preferences?.luggageCapacity || 0,
      description: data.preferences?.description || '',
      ...data.preferences // Spread remaining
    };
    this.bookingPolicy = data.bookingPolicy || {};
    this.passengers = data.passengers || {};
    this.status = data.status || 'published';
    this.publishedAt = data.publishedAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.createdAt = data.createdAt || new Date();
  }

  /**
   * Create or update ride in Firestore
   */
  async save() {
    try {
      const db = getFirestore();
      let rideRef;

      if (this.id) {
        rideRef = db.collection('rides').doc(this.id);
      } else {
        rideRef = db.collection('rides').doc();
        this.id = rideRef.id;
      }

      const rideData = {
        id: this.id,
        driverId: this.driverId,
        origin: this.origin,
        destination: this.destination,
        departureDate: this.departureDate,
        departureTime: this.departureTime,
        arrivalTime: this.arrivalTime,
        pricePerSeat: this.pricePerSeat,
        totalSeats: this.totalSeats,
        availableSeats: this.availableSeats,
        driver: this.driver,
        vehicle: this.vehicle,
        route: this.route,
        preferences: this.preferences,
        bookingPolicy: this.bookingPolicy,
        passengers: this.passengers,
        status: this.status,
        publishedAt: this.publishedAt,
        updatedAt: new Date(),
      };

      // Only set createdAt if it's a new ride
      const existingRide = await rideRef.get();
      if (!existingRide.exists) {
        rideData.createdAt = this.createdAt;
      }

      await rideRef.set(rideData, { merge: true });
      logger.info(`Ride saved: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Error saving ride:', error);
      throw error;
    }
  }

  /**
   * Get ride by ID from Firestore
   */
  static async findById(rideId) {
    try {
      const db = getFirestore();
      const rideDoc = await db.collection('rides').doc(rideId).get();

      if (!rideDoc.exists) {
        return null;
      }

      return new Ride(rideDoc.data());
    } catch (error) {
      logger.error('Error finding ride by ID:', error);
      throw error;
    }
  }

  /**
   * Search rides with filters
   */
  static async search(filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('rides');

      // Filter by status (only published rides by default)
      query = query.where('status', '==', filters.status || 'published');

      // Filter by origin city
      if (filters.originCity) {
        query = query.where('origin.city', '==', filters.originCity);
      }

      // Filter by destination city
      if (filters.destinationCity) {
        query = query.where('destination.city', '==', filters.destinationCity);
      }

      // Filter by departure date
      if (filters.departureDate) {
        query = query.where('departureDate', '==', filters.departureDate);
      }

      // Filter by available seats
      if (filters.minSeats) {
        query = query.where('availableSeats', '>=', parseInt(filters.minSeats));
      }

      // Filter by driver ID
      if (filters.driverId) {
        query = query.where('driverId', '==', filters.driverId);
      }

      // Order by departure time by default
      const orderBy = filters.orderBy || 'departureTime';
      const orderDirection = filters.orderDirection || 'asc';
      query = query.orderBy(orderBy, orderDirection);

      // Limit results
      const limit = parseInt(filters.limit) || 50;
      query = query.limit(limit);

      const querySnapshot = await query.get();
      const rides = [];

      querySnapshot.forEach(doc => {
        rides.push(new Ride(doc.data()));
      });

      return rides;
    } catch (error) {
      logger.error('Error searching rides:', error);
      throw error;
    }
  }

  /**
   * Get rides by driver ID
   */
  static async findByDriverId(driverId, filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('rides').where('driverId', '==', driverId);

      // Filter by status if provided
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      // Order by departure date and time
      query = query.orderBy('departureDate', 'desc').orderBy('departureTime', 'desc');

      // Limit results
      const limit = parseInt(filters.limit) || 20;
      query = query.limit(limit);

      const querySnapshot = await query.get();
      const rides = [];

      querySnapshot.forEach(doc => {
        rides.push(new Ride(doc.data()));
      });

      return rides;
    } catch (error) {
      logger.error('Error finding rides by driver ID:', error);
      throw error;
    }
  }

  /**
   * Update ride availability
   */
  async updateAvailability(seatsChange) {
    try {
      const newAvailableSeats = this.availableSeats + seatsChange;

      if (newAvailableSeats < 0) {
        throw new Error('Not enough available seats');
      }

      if (newAvailableSeats > this.totalSeats) {
        throw new Error('Available seats cannot exceed total seats');
      }

      this.availableSeats = newAvailableSeats;
      this.updatedAt = new Date();

      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating ride availability:', error);
      throw error;
    }
  }

  /**
   * Add passenger to ride
   */
  async addPassenger(passengerId, seatsBooked, pickupPoint = null, dropoffPoint = null) {
    try {
      if (this.availableSeats < seatsBooked) {
        throw new Error('Not enough available seats');
      }

      this.passengers[passengerId] = {
        seatsBooked,
        status: this.bookingPolicy.instantBooking ? 'confirmed' : 'requested',
        bookingTime: new Date(),
        pickupPoint: pickupPoint || this.origin.address,
        dropoffPoint: dropoffPoint || this.destination.address
      };

      // Update available seats if instant booking
      if (this.bookingPolicy.instantBooking) {
        this.availableSeats -= seatsBooked;
      }

      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error adding passenger to ride:', error);
      throw error;
    }
  }

  /**
   * Remove passenger from ride
   */
  async removePassenger(passengerId) {
    try {
      if (!this.passengers[passengerId]) {
        throw new Error('Passenger not found in this ride');
      }

      const passenger = this.passengers[passengerId];

      // Return seats if passenger was confirmed
      if (passenger.status === 'confirmed') {
        this.availableSeats += passenger.seatsBooked;
      }

      delete this.passengers[passengerId];
      this.updatedAt = new Date();

      await this.save();
      return this;
    } catch (error) {
      logger.error('Error removing passenger from ride:', error);
      throw error;
    }
  }

  /**
   * Update passenger status
   */
  async updatePassengerStatus(passengerId, newStatus) {
    try {
      if (!this.passengers[passengerId]) {
        throw new Error('Passenger not found in this ride');
      }

      const passenger = this.passengers[passengerId];
      const oldStatus = passenger.status;

      passenger.status = newStatus;

      // Handle seat availability based on status change
      if (oldStatus === 'requested' && newStatus === 'confirmed') {
        this.availableSeats -= passenger.seatsBooked;
      } else if (oldStatus === 'confirmed' && newStatus === 'cancelled') {
        this.availableSeats += passenger.seatsBooked;
      }

      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating passenger status:', error);
      throw error;
    }
  }

  /**
   * Update ride status
   */
  async updateStatus(newStatus) {
    try {
      const validStatuses = ['published', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(newStatus)) {
        throw new Error('Invalid ride status');
      }

      this.status = newStatus;
      this.updatedAt = new Date();

      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating ride status:', error);
      throw error;
    }
  }

  /**
   * Check if ride is bookable
   */
  isBookable() {
    return this.status === 'published' &&
      this.availableSeats > 0 &&
      new Date(`${this.departureDate} ${this.departureTime}`) > new Date();
  }

  /**
   * Get ride summary for listings
   */
  getSummary() {
    return {
      id: this.id,
      origin: this.origin,
      destination: this.destination,
      departureDate: this.departureDate,
      departureTime: this.departureTime,
      arrivalTime: this.arrivalTime,
      pricePerSeat: this.pricePerSeat,
      availableSeats: this.availableSeats,
      totalSeats: this.totalSeats,
      driver: {
        name: this.driver.name,
        avatar: this.driver.avatar,
        rating: this.driver.rating,
        reviewCount: this.driver.reviewCount,
        verificationLevel: this.driver.verificationLevel
      },
      vehicle: {
        make: this.vehicle.make,
        model: this.vehicle.model,
        color: this.vehicle.color,
        type: this.vehicle.type,
        amenities: this.vehicle.amenities
      },
      route: {
        estimatedDuration: this.route.estimatedDuration,
        distance: this.route.distance
      },
      preferences: this.preferences,
      bookingPolicy: this.bookingPolicy,
      status: this.status
    };
  }

  /**
   * Get detailed ride information
   */
  getDetails() {
    return {
      ...this.getSummary(),
      route: this.route,
      passengers: Object.keys(this.passengers).length,
      publishedAt: this.publishedAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Delete ride from Firestore
   */
  async delete() {
    try {
      if (!this.id) {
        throw new Error('Cannot delete ride without ID');
      }

      const db = getFirestore();
      await db.collection('rides').doc(this.id).delete();
      logger.info(`Ride deleted: ${this.id}`);
      return true;
    } catch (error) {
      logger.error('Error deleting ride:', error);
      throw error;
    }
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      driverId: this.driverId,
      origin: this.origin,
      destination: this.destination,
      departureDate: this.departureDate,
      departureTime: this.departureTime,
      arrivalTime: this.arrivalTime,
      pricePerSeat: this.pricePerSeat,
      totalSeats: this.totalSeats,
      availableSeats: this.availableSeats,
      driver: this.driver,
      vehicle: this.vehicle,
      route: this.route,
      preferences: this.preferences,
      bookingPolicy: this.bookingPolicy,
      passengers: this.passengers,
      status: this.status,
      publishedAt: this.publishedAt,
      updatedAt: this.updatedAt,
      createdAt: this.createdAt
    };
  }
}

module.exports = Ride;
