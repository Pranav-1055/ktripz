const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const User = require('../models/User');
const { getDatabase } = require('../config/firebase');
const logger = require('../utils/logger');

class BookingService {
  /**
   * Create a new booking request
   */
  static async createBooking(bookingData, userId) {
    try {
      // Validate required fields
      if (!bookingData.rideId || !bookingData.seatsBooked) {
        throw new Error('Ride ID and seats booked are required');
      }

      // Validate seat count
      if (bookingData.seatsBooked < 1 || bookingData.seatsBooked > 8) {
        throw new Error('Invalid number of seats (must be between 1 and 8)');
      }

      // Get ride details to validate
      const ride = await Ride.findById(bookingData.rideId);
      if (!ride) {
        throw new Error('Ride not found');
      }

      // Check if user is trying to book their own ride
      if (ride.driverId === userId) {
        throw new Error('Cannot book your own ride');
      }

      // Check if user already has a booking for this ride
      const existingBookings = await Booking.findByRideId(bookingData.rideId);
      const userBooking = existingBookings.find(booking =>
        booking.passengerId === userId && booking.isActive()
      );

      if (userBooking) {
        throw new Error('You already have an active booking for this ride');
      }

      // Get user details
      const user = await User.findByUid(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create booking with transaction
      const booking = await Booking.createWithTransaction({
        ...bookingData,
        passengerId: userId
      });

      // Update user stats
      await this.updateUserStats(userId, 'booking_created');

      // Send real-time notification to driver
      await this.sendRealtimeNotification(ride.driverId, {
        type: 'booking_request',
        bookingId: booking.id,
        rideId: booking.rideId,
        passengerName: user.displayName || user.profile.name,
        seatsBooked: booking.seatsBooked,
        timestamp: new Date()
      });

      logger.info(`Booking created: ${booking.id} for ride ${bookingData.rideId}`);
      return booking;
    } catch (error) {
      logger.error('Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Get booking details with related data
   */
  static async getBookingDetails(bookingId, userId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if user has access to this booking
      if (booking.passengerId !== userId && booking.driverId !== userId) {
        throw new Error('Access denied');
      }

      // Get related ride details
      const ride = await Ride.findById(booking.rideId);
      if (!ride) {
        throw new Error('Associated ride not found');
      }

      // Get passenger and driver details
      const [passenger, driver] = await Promise.all([
        User.findByUid(booking.passengerId),
        User.findByUid(booking.driverId)
      ]);

      return {
        booking: booking.getDetails(),
        ride: ride.getSummary(),
        passenger: passenger?.getPublicProfile(),
        driver: driver?.getPublicProfile()
      };
    } catch (error) {
      logger.error('Error getting booking details:', error);
      throw error;
    }
  }

  /**
   * Get user's booking history
   */
  static async getUserBookings(userId, role = 'passenger', filters = {}) {
    try {
      let bookings;

      if (role === 'passenger') {
        bookings = await Booking.findByPassengerId(userId, filters);
      } else if (role === 'driver') {
        bookings = await Booking.findByDriverId(userId, filters);
      } else {
        throw new Error('Invalid role specified');
      }

      // Get related ride details for each booking
      const bookingsWithRides = await Promise.all(
        bookings.map(async (booking) => {
          const ride = await Ride.findById(booking.rideId);
          return {
            booking: booking.getSummary(),
            ride: ride?.getSummary() || null
          };
        })
      );

      return bookingsWithRides;
    } catch (error) {
      logger.error('Error getting user bookings:', error);
      throw error;
    }
  }

  /**
   * Approve booking request (driver action)
   */
  static async approveBooking(bookingId, driverId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if user is the driver
      if (booking.driverId !== driverId) {
        throw new Error('Only the driver can approve this booking');
      }

      // Check if booking can be approved
      if (booking.status !== 'requested') {
        throw new Error('Booking cannot be approved in current status');
      }

      // Update booking status
      await booking.updateStatus('confirmed');

      // Update user stats
      await this.updateUserStats(booking.passengerId, 'booking_confirmed');
      await this.updateUserStats(driverId, 'booking_approved');

      // Send real-time notification to passenger
      const passenger = await User.findByUid(booking.passengerId);
      await this.sendRealtimeNotification(booking.passengerId, {
        type: 'booking_confirmed',
        bookingId: booking.id,
        rideId: booking.rideId,
        driverName: (await User.findByUid(driverId))?.displayName,
        timestamp: new Date()
      });

      logger.info(`Booking approved: ${bookingId} by driver ${driverId}`);
      return booking;
    } catch (error) {
      logger.error('Error approving booking:', error);
      throw error;
    }
  }

  /**
   * Reject booking request (driver action)
   */
  static async rejectBooking(bookingId, driverId, reason = null) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if user is the driver
      if (booking.driverId !== driverId) {
        throw new Error('Only the driver can reject this booking');
      }

      // Check if booking can be rejected
      if (booking.status !== 'requested') {
        throw new Error('Booking cannot be rejected in current status');
      }

      // Update booking status
      await booking.updateStatus('cancelled_by_driver', reason);

      // Update user stats
      await this.updateUserStats(booking.passengerId, 'booking_rejected');
      await this.updateUserStats(driverId, 'booking_rejected_by_driver');

      // Send real-time notification to passenger
      await this.sendRealtimeNotification(booking.passengerId, {
        type: 'booking_rejected',
        bookingId: booking.id,
        rideId: booking.rideId,
        reason: reason,
        timestamp: new Date()
      });

      logger.info(`Booking rejected: ${bookingId} by driver ${driverId}`);
      return booking;
    } catch (error) {
      logger.error('Error rejecting booking:', error);
      throw error;
    }
  }

  /**
   * Cancel booking (passenger action)
   */
  static async cancelBooking(bookingId, passengerId, reason = null) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if user is the passenger
      if (booking.passengerId !== passengerId) {
        throw new Error('Only the passenger can cancel this booking');
      }

      // Check if booking can be cancelled
      if (!booking.canBeCancelled()) {
        throw new Error('Booking cannot be cancelled in current status');
      }

      // Check cancellation policy (if ride is within 2 hours, may have penalties)
      const ride = await Ride.findById(booking.rideId);
      if (ride) {
        const departureTime = new Date(`${ride.departureDate} ${ride.departureTime}`);
        const hoursUntilDeparture = (departureTime - new Date()) / (1000 * 60 * 60);

        if (hoursUntilDeparture < 2) {
          logger.warn(`Late cancellation for booking ${bookingId}: ${hoursUntilDeparture} hours until departure`);
          // Could implement penalty logic here
        }
      }

      // Update booking status
      await booking.updateStatus('cancelled_by_passenger', reason);

      // Update user stats
      await this.updateUserStats(passengerId, 'booking_cancelled');
      await this.updateUserStats(booking.driverId, 'booking_cancelled_by_passenger');

      // Send real-time notification to driver
      await this.sendRealtimeNotification(booking.driverId, {
        type: 'booking_cancelled',
        bookingId: booking.id,
        rideId: booking.rideId,
        reason: reason,
        timestamp: new Date()
      });

      logger.info(`Booking cancelled: ${bookingId} by passenger ${passengerId}`);
      return booking;
    } catch (error) {
      logger.error('Error cancelling booking:', error);
      throw error;
    }
  }

  /**
   * Complete booking (driver action when trip is finished)
   */
  static async completeBooking(bookingId, driverId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if user is the driver
      if (booking.driverId !== driverId) {
        throw new Error('Only the driver can complete this booking');
      }

      // Check if booking can be completed
      if (booking.status !== 'confirmed') {
        throw new Error('Booking cannot be completed in current status');
      }

      // Update booking status
      await booking.updateStatus('completed');

      // Update user stats
      await this.updateUserStats(booking.passengerId, 'trip_completed');
      await this.updateUserStats(driverId, 'trip_completed_as_driver');

      // Send real-time notification to passenger
      await this.sendRealtimeNotification(booking.passengerId, {
        type: 'trip_completed',
        bookingId: booking.id,
        rideId: booking.rideId,
        timestamp: new Date()
      });

      logger.info(`Booking completed: ${bookingId} by driver ${driverId}`);
      return booking;
    } catch (error) {
      logger.error('Error completing booking:', error);
      throw error;
    }
  }

  /**
   * Add message to booking communication
   */
  static async addBookingMessage(bookingId, fromUserId, message, type = 'text') {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if user has access to this booking
      if (booking.passengerId !== fromUserId && booking.driverId !== fromUserId) {
        throw new Error('Access denied');
      }

      // Determine recipient
      const toUserId = booking.passengerId === fromUserId ? booking.driverId : booking.passengerId;

      // Add message
      const newMessage = await booking.addMessage(fromUserId, toUserId, message, type);

      // Send real-time notification
      await this.sendRealtimeNotification(toUserId, {
        type: 'new_message',
        bookingId: booking.id,
        fromUserId: fromUserId,
        message: message,
        timestamp: new Date()
      });

      logger.info(`Message added to booking: ${bookingId}`);
      return newMessage;
    } catch (error) {
      logger.error('Error adding booking message:', error);
      throw error;
    }
  }

  /**
   * Get booking messages
   */
  static async getBookingMessages(bookingId, userId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if user has access to this booking
      if (booking.passengerId !== userId && booking.driverId !== userId) {
        throw new Error('Access denied');
      }

      return booking.communication.messages || [];
    } catch (error) {
      logger.error('Error getting booking messages:', error);
      throw error;
    }
  }

  /**
   * Update user statistics
   */
  static async updateUserStats(userId, action) {
    try {
      const user = await User.findByUid(userId);
      if (!user) {
        return;
      }

      const stats = { ...user.stats };

      switch (action) {
        case 'booking_created':
          stats.totalRidesAsPassenger = (stats.totalRidesAsPassenger || 0) + 1;
          break;
        case 'booking_confirmed':
          // No additional stats update needed
          break;
        case 'booking_approved':
          // No additional stats update needed
          break;
        case 'booking_cancelled':
        case 'booking_rejected':
          // Could implement completion rate calculation here
          break;
        case 'trip_completed':
          // Trip completion is already counted in booking_created
          break;
        case 'trip_completed_as_driver':
          stats.totalRidesAsDriver = (stats.totalRidesAsDriver || 0) + 1;
          break;
      }

      stats.lastActiveAt = new Date();
      await user.updateProfile({ stats });
    } catch (error) {
      logger.error('Error updating user stats:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Send real-time notification via Firebase Realtime Database
   */
  static async sendRealtimeNotification(userId, notification) {
    try {
      const realtimeDb = getDatabase();
      const notificationRef = realtimeDb.ref(`notifications/${userId}`).push();
      await notificationRef.set({
        ...notification,
        id: notificationRef.key,
        read: false,
        createdAt: new Date().toISOString()
      });

      logger.info(`Real-time notification sent to user: ${userId}`);
    } catch (error) {
      logger.error('Error sending real-time notification:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get booking statistics for a user
   */
  static async getBookingStats(userId, role = 'passenger') {
    try {
      let bookings;

      if (role === 'passenger') {
        bookings = await Booking.findByPassengerId(userId);
      } else if (role === 'driver') {
        bookings = await Booking.findByDriverId(userId);
      } else {
        throw new Error('Invalid role specified');
      }

      const stats = {
        total: bookings.length,
        requested: bookings.filter(b => b.status === 'requested').length,
        confirmed: bookings.filter(b => b.status === 'confirmed').length,
        completed: bookings.filter(b => b.status === 'completed').length,
        cancelled: bookings.filter(b => b.status.includes('cancelled')).length,
        totalEarnings: 0,
        totalSpent: 0
      };

      // Calculate financial stats
      bookings.forEach(booking => {
        if (booking.status === 'completed' && booking.pricing.finalAmount) {
          if (role === 'driver') {
            stats.totalEarnings += booking.pricing.totalAmount; // Driver gets base amount
          } else {
            stats.totalSpent += booking.pricing.finalAmount; // Passenger pays final amount
          }
        }
      });

      return stats;
    } catch (error) {
      logger.error('Error getting booking stats:', error);
      throw error;
    }
  }
}

module.exports = BookingService;