const { getFirestore, getDatabase } = require('../config/firebase');
const logger = require('../utils/logger');

class Booking {
  constructor(data) {
    this.id = data.id;
    this.rideId = data.rideId;
    this.passengerId = data.passengerId;
    this.driverId = data.driverId;
    this.seatsBooked = data.seatsBooked || 1;
    this.pickupPoint = data.pickupPoint || {};
    this.dropoffPoint = data.dropoffPoint || {};
    this.pricing = data.pricing || {};
    this.payment = data.payment || {};
    this.communication = data.communication || {};
    this.status = data.status || 'requested';
    this.requestedAt = data.requestedAt || new Date();
    this.confirmedAt = data.confirmedAt || null;
    this.completedAt = data.completedAt || null;
    this.cancelledAt = data.cancelledAt || null;
    this.cancellationReason = data.cancellationReason || null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create or update booking in Firestore
   */
  async save() {
    try {
      const db = getFirestore();
      let bookingRef;
      
      if (this.id) {
        bookingRef = db.collection('bookings').doc(this.id);
      } else {
        bookingRef = db.collection('bookings').doc();
        this.id = bookingRef.id;
      }
      
      const bookingData = {
        id: this.id,
        rideId: this.rideId,
        passengerId: this.passengerId,
        driverId: this.driverId,
        seatsBooked: this.seatsBooked,
        pickupPoint: this.pickupPoint,
        dropoffPoint: this.dropoffPoint,
        pricing: this.pricing,
        payment: this.payment,
        communication: this.communication,
        status: this.status,
        requestedAt: this.requestedAt,
        confirmedAt: this.confirmedAt,
        completedAt: this.completedAt,
        cancelledAt: this.cancelledAt,
        cancellationReason: this.cancellationReason,
        updatedAt: new Date(),
      };

      // Only set createdAt if it's a new booking
      const existingBooking = await bookingRef.get();
      if (!existingBooking.exists) {
        bookingData.createdAt = this.createdAt;
      }

      await bookingRef.set(bookingData, { merge: true });
      logger.info(`Booking saved: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Error saving booking:', error);
      throw error;
    }
  }

  /**
   * Create booking with Firebase transaction to ensure seat availability
   */
  static async createWithTransaction(bookingData) {
    const db = getFirestore();
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        // Get the ride document
        const rideRef = db.collection('rides').doc(bookingData.rideId);
        const rideDoc = await transaction.get(rideRef);
        
        if (!rideDoc.exists) {
          throw new Error('Ride not found');
        }
        
        const rideData = rideDoc.data();
        
        // Check if ride is bookable
        if (rideData.status !== 'published') {
          throw new Error('Ride is not available for booking');
        }
        
        // Check seat availability
        if (rideData.availableSeats < bookingData.seatsBooked) {
          throw new Error('Not enough available seats');
        }
        
        // Check if departure time is in the future
        const departureDateTime = new Date(`${rideData.departureDate} ${rideData.departureTime}`);
        if (departureDateTime <= new Date()) {
          throw new Error('Cannot book rides that have already departed');
        }
        
        // Create booking document
        const bookingRef = db.collection('bookings').doc();
        const booking = new Booking({
          ...bookingData,
          id: bookingRef.id,
          driverId: rideData.driverId,
          status: rideData.bookingPolicy?.instantBooking ? 'confirmed' : 'requested'
        });
        
        // Calculate pricing
        booking.pricing = {
          pricePerSeat: rideData.pricePerSeat,
          totalAmount: rideData.pricePerSeat * bookingData.seatsBooked,
          serviceFee: Math.round(rideData.pricePerSeat * bookingData.seatsBooked * 0.05), // 5% service fee
          finalAmount: Math.round(rideData.pricePerSeat * bookingData.seatsBooked * 1.05)
        };
        
        // Set pickup and dropoff points if not provided
        if (!booking.pickupPoint.name) {
          booking.pickupPoint = {
            name: rideData.origin.address,
            address: rideData.origin.address,
            coordinates: rideData.origin.coordinates,
            time: rideData.departureTime
          };
        }
        
        if (!booking.dropoffPoint.name) {
          booking.dropoffPoint = {
            name: rideData.destination.address,
            address: rideData.destination.address,
            coordinates: rideData.destination.coordinates,
            time: rideData.arrivalTime
          };
        }
        
        // Update booking timestamps
        if (booking.status === 'confirmed') {
          booking.confirmedAt = new Date();
        }
        
        // Save booking
        transaction.set(bookingRef, booking.toJSON());
        
        // Update ride's passenger list and available seats
        const updatedPassengers = { ...rideData.passengers };
        updatedPassengers[bookingData.passengerId] = {
          seatsBooked: bookingData.seatsBooked,
          status: booking.status,
          bookingTime: booking.requestedAt,
          pickupPoint: booking.pickupPoint.name,
          dropoffPoint: booking.dropoffPoint.name
        };
        
        const updatedAvailableSeats = booking.status === 'confirmed' 
          ? rideData.availableSeats - bookingData.seatsBooked
          : rideData.availableSeats;
        
        transaction.update(rideRef, {
          passengers: updatedPassengers,
          availableSeats: updatedAvailableSeats,
          updatedAt: new Date()
        });
        
        return booking;
      });
      
      logger.info(`Booking created with transaction: ${result.id}`);
      return result;
    } catch (error) {
      logger.error('Error creating booking with transaction:', error);
      throw error;
    }
  }

  /**
   * Get booking by ID from Firestore
   */
  static async findById(bookingId) {
    try {
      const db = getFirestore();
      const bookingDoc = await db.collection('bookings').doc(bookingId).get();
      
      if (!bookingDoc.exists) {
        return null;
      }

      return new Booking(bookingDoc.data());
    } catch (error) {
      logger.error('Error finding booking by ID:', error);
      throw error;
    }
  }

  /**
   * Get bookings by passenger ID
   */
  static async findByPassengerId(passengerId, filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('bookings').where('passengerId', '==', passengerId);

      // Filter by status if provided
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      // Order by requested date (most recent first)
      query = query.orderBy('requestedAt', 'desc');

      // Limit results
      const limit = parseInt(filters.limit) || 20;
      query = query.limit(limit);

      const querySnapshot = await query.get();
      const bookings = [];

      querySnapshot.forEach(doc => {
        bookings.push(new Booking(doc.data()));
      });

      return bookings;
    } catch (error) {
      logger.error('Error finding bookings by passenger ID:', error);
      throw error;
    }
  }

  /**
   * Get bookings by driver ID
   */
  static async findByDriverId(driverId, filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('bookings').where('driverId', '==', driverId);

      // Filter by status if provided
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      // Order by requested date (most recent first)
      query = query.orderBy('requestedAt', 'desc');

      // Limit results
      const limit = parseInt(filters.limit) || 20;
      query = query.limit(limit);

      const querySnapshot = await query.get();
      const bookings = [];

      querySnapshot.forEach(doc => {
        bookings.push(new Booking(doc.data()));
      });

      return bookings;
    } catch (error) {
      logger.error('Error finding bookings by driver ID:', error);
      throw error;
    }
  }

  /**
   * Get bookings by ride ID
   */
  static async findByRideId(rideId, filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('bookings').where('rideId', '==', rideId);

      // Filter by status if provided
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      // Order by requested date
      query = query.orderBy('requestedAt', 'asc');

      const querySnapshot = await query.get();
      const bookings = [];

      querySnapshot.forEach(doc => {
        bookings.push(new Booking(doc.data()));
      });

      return bookings;
    } catch (error) {
      logger.error('Error finding bookings by ride ID:', error);
      throw error;
    }
  }

  /**
   * Update booking status with Firebase transaction
   */
  async updateStatus(newStatus, reason = null) {
    const db = getFirestore();
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        // Get current booking
        const bookingRef = db.collection('bookings').doc(this.id);
        const bookingDoc = await transaction.get(bookingRef);
        
        if (!bookingDoc.exists) {
          throw new Error('Booking not found');
        }
        
        const currentBooking = bookingDoc.data();
        const oldStatus = currentBooking.status;
        
        // Validate status transition
        const validTransitions = {
          'requested': ['confirmed', 'cancelled_by_driver', 'cancelled_by_passenger'],
          'confirmed': ['completed', 'cancelled_by_driver', 'cancelled_by_passenger'],
          'completed': [], // No transitions from completed
          'cancelled_by_driver': [], // No transitions from cancelled
          'cancelled_by_passenger': [] // No transitions from cancelled
        };
        
        if (!validTransitions[oldStatus]?.includes(newStatus)) {
          throw new Error(`Invalid status transition from ${oldStatus} to ${newStatus}`);
        }
        
        // Get the ride document to update seat availability
        const rideRef = db.collection('rides').doc(currentBooking.rideId);
        const rideDoc = await transaction.get(rideRef);
        
        if (!rideDoc.exists) {
          throw new Error('Associated ride not found');
        }
        
        const rideData = rideDoc.data();
        
        // Calculate seat availability changes
        let seatChange = 0;
        if (oldStatus === 'requested' && newStatus === 'confirmed') {
          seatChange = -currentBooking.seatsBooked; // Reserve seats
        } else if (oldStatus === 'confirmed' && newStatus.includes('cancelled')) {
          seatChange = currentBooking.seatsBooked; // Release seats
        }
        
        // Update booking
        const updatedBooking = {
          ...currentBooking,
          status: newStatus,
          updatedAt: new Date()
        };
        
        // Set appropriate timestamp
        if (newStatus === 'confirmed') {
          updatedBooking.confirmedAt = new Date();
        } else if (newStatus === 'completed') {
          updatedBooking.completedAt = new Date();
        } else if (newStatus.includes('cancelled')) {
          updatedBooking.cancelledAt = new Date();
          updatedBooking.cancellationReason = reason;
        }
        
        transaction.update(bookingRef, updatedBooking);
        
        // Update ride's passenger list and available seats
        const updatedPassengers = { ...rideData.passengers };
        if (updatedPassengers[currentBooking.passengerId]) {
          if (newStatus.includes('cancelled')) {
            delete updatedPassengers[currentBooking.passengerId];
          } else {
            updatedPassengers[currentBooking.passengerId].status = newStatus;
          }
        }
        
        const newAvailableSeats = Math.max(0, Math.min(
          rideData.totalSeats,
          rideData.availableSeats + seatChange
        ));
        
        transaction.update(rideRef, {
          passengers: updatedPassengers,
          availableSeats: newAvailableSeats,
          updatedAt: new Date()
        });
        
        // Update this instance
        Object.assign(this, updatedBooking);
        
        return this;
      });
      
      logger.info(`Booking status updated: ${this.id} from ${result.status} to ${newStatus}`);
      return result;
    } catch (error) {
      logger.error('Error updating booking status:', error);
      throw error;
    }
  }

  /**
   * Add message to booking communication
   */
  async addMessage(fromUserId, toUserId, message, type = 'text') {
    try {
      if (!this.communication.messages) {
        this.communication.messages = [];
      }
      
      const newMessage = {
        from: fromUserId,
        to: toUserId,
        message: message,
        timestamp: new Date(),
        type: type
      };
      
      this.communication.messages.push(newMessage);
      this.updatedAt = new Date();
      
      await this.save();
      
      // Also update in Realtime Database for real-time messaging
      const realtimeDb = getDatabase();
      const messageRef = realtimeDb.ref(`bookingMessages/${this.id}`).push();
      await messageRef.set(newMessage);
      
      logger.info(`Message added to booking: ${this.id}`);
      return newMessage;
    } catch (error) {
      logger.error('Error adding message to booking:', error);
      throw error;
    }
  }

  /**
   * Update payment information
   */
  async updatePayment(paymentData) {
    try {
      this.payment = { ...this.payment, ...paymentData };
      this.updatedAt = new Date();
      
      // If payment is completed, update status if still requested
      if (paymentData.status === 'completed' && this.status === 'requested') {
        await this.updateStatus('confirmed');
      }
      
      await this.save();
      logger.info(`Payment updated for booking: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Error updating booking payment:', error);
      throw error;
    }
  }

  /**
   * Check if booking can be cancelled
   */
  canBeCancelled() {
    const cancellableStatuses = ['requested', 'confirmed'];
    return cancellableStatuses.includes(this.status);
  }

  /**
   * Check if booking is active (not cancelled or completed)
   */
  isActive() {
    const activeStatuses = ['requested', 'confirmed'];
    return activeStatuses.includes(this.status);
  }

  /**
   * Get booking summary for listings
   */
  getSummary() {
    return {
      id: this.id,
      rideId: this.rideId,
      seatsBooked: this.seatsBooked,
      pickupPoint: this.pickupPoint,
      dropoffPoint: this.dropoffPoint,
      pricing: this.pricing,
      status: this.status,
      requestedAt: this.requestedAt,
      confirmedAt: this.confirmedAt,
      completedAt: this.completedAt,
      cancelledAt: this.cancelledAt
    };
  }

  /**
   * Get detailed booking information
   */
  getDetails() {
    return {
      ...this.getSummary(),
      passengerId: this.passengerId,
      driverId: this.driverId,
      payment: this.payment,
      communication: {
        ...this.communication,
        messages: this.communication.messages?.slice(-10) || [] // Last 10 messages
      },
      cancellationReason: this.cancellationReason,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      rideId: this.rideId,
      passengerId: this.passengerId,
      driverId: this.driverId,
      seatsBooked: this.seatsBooked,
      pickupPoint: this.pickupPoint,
      dropoffPoint: this.dropoffPoint,
      pricing: this.pricing,
      payment: this.payment,
      communication: this.communication,
      status: this.status,
      requestedAt: this.requestedAt,
      confirmedAt: this.confirmedAt,
      completedAt: this.completedAt,
      cancelledAt: this.cancelledAt,
      cancellationReason: this.cancellationReason,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Booking;