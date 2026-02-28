const {
  getSocketInstance,
  emitRideUpdate,
  emitBookingStatusChange,
  emitTripTracking,
  emitUserNotification,
  emitMessage,
} = require('../config/socket');
const logger = require('../utils/logger');

class RealtimeService {
  /**
   * Notify about ride availability changes
   * @param {string} rideId - Ride ID
   * @param {Object} changes - Changes made to the ride
   */
  static async notifyRideUpdate(rideId, changes) {
    try {
      const updateData = {
        type: 'availability_change',
        changes,
      };

      // Emit to all users watching this ride
      emitRideUpdate(rideId, updateData);

      logger.info(`Real-time ride update sent for ride ${rideId}:`, changes);
    } catch (error) {
      logger.error('Failed to send ride update:', error);
    }
  }

  /**
   * Notify about seat availability changes
   * @param {string} rideId - Ride ID
   * @param {number} availableSeats - New available seats count
   * @param {number} totalSeats - Total seats
   */
  static async notifySeatAvailability(rideId, availableSeats, totalSeats) {
    try {
      const updateData = {
        type: 'seat_availability',
        availableSeats,
        totalSeats,
        isFullyBooked: availableSeats === 0,
      };

      emitRideUpdate(rideId, updateData);

      logger.info(`Seat availability update sent for ride ${rideId}: ${availableSeats}/${totalSeats}`);
    } catch (error) {
      logger.error('Failed to send seat availability update:', error);
    }
  }

  /**
   * Notify about booking status changes
   * @param {string} bookingId - Booking ID
   * @param {string} passengerId - Passenger user ID
   * @param {string} driverId - Driver user ID
   * @param {string} newStatus - New booking status
   * @param {Object} additionalData - Additional data
   */
  static async notifyBookingStatusChange(bookingId, passengerId, driverId, newStatus, additionalData = {}) {
    try {
      const statusData = {
        status: newStatus,
        ...additionalData,
      };

      // Notify passenger
      emitBookingStatusChange(bookingId, passengerId, {
        ...statusData,
        userType: 'passenger',
      });

      // Notify driver
      emitBookingStatusChange(bookingId, driverId, {
        ...statusData,
        userType: 'driver',
      });

      logger.info(`Booking status change notification sent for booking ${bookingId}: ${newStatus}`);
    } catch (error) {
      logger.error('Failed to send booking status change notification:', error);
    }
  }

  /**
   * Notify about new booking requests
   * @param {string} rideId - Ride ID
   * @param {string} driverId - Driver user ID
   * @param {Object} bookingData - Booking request data
   */
  static async notifyNewBookingRequest(rideId, driverId, bookingData) {
    try {
      const notification = {
        type: 'booking_request',
        title: 'New Booking Request',
        message: `You have a new booking request for your ride`,
        data: {
          rideId,
          bookingId: bookingData.id,
          passengerName: bookingData.passengerName,
          seatsRequested: bookingData.seatsBooked,
          pickupPoint: bookingData.pickupPoint,
        },
        priority: 'high',
      };

      emitUserNotification(driverId, notification);

      logger.info(`New booking request notification sent to driver ${driverId}`);
    } catch (error) {
      logger.error('Failed to send new booking request notification:', error);
    }
  }

  /**
   * Notify about booking confirmation
   * @param {string} bookingId - Booking ID
   * @param {string} passengerId - Passenger user ID
   * @param {Object} rideData - Ride data
   */
  static async notifyBookingConfirmed(bookingId, passengerId, rideData) {
    try {
      const notification = {
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        message: `Your booking has been confirmed`,
        data: {
          bookingId,
          rideId: rideData.id,
          driverName: rideData.driverName,
          departureTime: rideData.departureTime,
          pickupPoint: rideData.pickupPoint,
        },
        priority: 'high',
      };

      emitUserNotification(passengerId, notification);

      logger.info(`Booking confirmation notification sent to passenger ${passengerId}`);
    } catch (error) {
      logger.error('Failed to send booking confirmation notification:', error);
    }
  }

  /**
   * Notify about trip status updates
   * @param {string} rideId - Ride ID
   * @param {string} status - Trip status (started, in_progress, completed)
   * @param {Object} trackingData - Tracking data
   */
  static async notifyTripStatus(rideId, status, trackingData = {}) {
    try {
      const tripData = {
        status,
        ...trackingData,
      };

      emitTripTracking(rideId, tripData);

      logger.info(`Trip status update sent for ride ${rideId}: ${status}`);
    } catch (error) {
      logger.error('Failed to send trip status update:', error);
    }
  }

  /**
   * Notify about driver location updates
   * @param {string} rideId - Ride ID
   * @param {Object} location - Driver location
   * @param {string} driverId - Driver user ID
   */
  static async notifyDriverLocation(rideId, location, driverId) {
    try {
      const locationData = {
        type: 'driver_location',
        driverId,
        location,
        estimatedArrival: location.estimatedArrival,
      };

      emitTripTracking(rideId, locationData);

      logger.info(`Driver location update sent for ride ${rideId}`);
    } catch (error) {
      logger.error('Failed to send driver location update:', error);
    }
  }

  /**
   * Send message between booking participants
   * @param {string} bookingId - Booking ID
   * @param {string} senderId - Sender user ID
   * @param {string} receiverId - Receiver user ID
   * @param {Object} messageData - Message data
   */
  static async sendMessage(bookingId, senderId, receiverId, messageData) {
    try {
      const message = {
        senderId,
        receiverId,
        ...messageData,
      };

      emitMessage(bookingId, message);

      logger.info(`Message sent in booking ${bookingId} from ${senderId} to ${receiverId}`);
    } catch (error) {
      logger.error('Failed to send message:', error);
    }
  }

  /**
   * Notify about ride cancellation
   * @param {string} rideId - Ride ID
   * @param {Array} passengerIds - Array of passenger user IDs
   * @param {string} reason - Cancellation reason
   */
  static async notifyRideCancellation(rideId, passengerIds, reason) {
    try {
      const notification = {
        type: 'ride_cancelled',
        title: 'Ride Cancelled',
        message: `Your booked ride has been cancelled`,
        data: {
          rideId,
          reason,
          refundInfo: 'Refund will be processed within 3-5 business days',
        },
        priority: 'high',
      };

      // Notify all affected passengers
      for (const passengerId of passengerIds) {
        emitUserNotification(passengerId, notification);
      }

      logger.info(`Ride cancellation notifications sent for ride ${rideId} to ${passengerIds.length} passengers`);
    } catch (error) {
      logger.error('Failed to send ride cancellation notifications:', error);
    }
  }

  /**
   * Notify about ride delays
   * @param {string} rideId - Ride ID
   * @param {Array} passengerIds - Array of passenger user IDs
   * @param {number} delayMinutes - Delay in minutes
   * @param {string} reason - Delay reason
   */
  static async notifyRideDelay(rideId, passengerIds, delayMinutes, reason) {
    try {
      const notification = {
        type: 'ride_delayed',
        title: 'Ride Delayed',
        message: `Your ride is delayed by ${delayMinutes} minutes`,
        data: {
          rideId,
          delayMinutes,
          reason,
        },
        priority: 'medium',
      };

      // Notify all affected passengers
      for (const passengerId of passengerIds) {
        emitUserNotification(passengerId, notification);
      }

      // Update ride tracking
      emitTripTracking(rideId, {
        type: 'delay',
        delayMinutes,
        reason,
      });

      logger.info(`Ride delay notifications sent for ride ${rideId}: ${delayMinutes} minutes`);
    } catch (error) {
      logger.error('Failed to send ride delay notifications:', error);
    }
  }

  /**
   * Notify about upcoming ride reminders
   * @param {string} rideId - Ride ID
   * @param {Array} userIds - Array of user IDs (passengers and driver)
   * @param {number} minutesUntilDeparture - Minutes until departure
   */
  static async notifyRideReminder(rideId, userIds, minutesUntilDeparture) {
    try {
      const notification = {
        type: 'ride_reminder',
        title: 'Ride Reminder',
        message: `Your ride departs in ${minutesUntilDeparture} minutes`,
        data: {
          rideId,
          minutesUntilDeparture,
        },
        priority: 'medium',
      };

      // Notify all participants
      for (const userId of userIds) {
        emitUserNotification(userId, notification);
      }

      logger.info(`Ride reminder notifications sent for ride ${rideId} to ${userIds.length} users`);
    } catch (error) {
      logger.error('Failed to send ride reminder notifications:', error);
    }
  }

  /**
   * Get real-time statistics
   * @returns {Object} Real-time statistics
   */
  static async getRealtimeStats() {
    try {
      const io = getSocketInstance();
      const connectedUsers = io.engine.clientsCount;
      
      // Get room statistics
      const rooms = await io.fetchSockets();
      const rideRooms = rooms.filter(socket => 
        Array.from(socket.rooms).some(room => room.startsWith('ride_'))
      ).length;
      
      const bookingRooms = rooms.filter(socket => 
        Array.from(socket.rooms).some(room => room.startsWith('booking_'))
      ).length;

      return {
        connectedUsers,
        activeRideRooms: rideRooms,
        activeBookingRooms: bookingRooms,
        totalRooms: io.sockets.adapter.rooms.size,
      };
    } catch (error) {
      logger.error('Failed to get realtime stats:', error);
      return {
        connectedUsers: 0,
        activeRideRooms: 0,
        activeBookingRooms: 0,
        totalRooms: 0,
      };
    }
  }
}

module.exports = RealtimeService;