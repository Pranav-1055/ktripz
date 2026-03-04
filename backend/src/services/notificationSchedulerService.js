const cron = require('node-cron');
const NotificationService = require('./notificationService');
const NotificationPreferencesService = require('./notificationPreferencesService');
const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class NotificationSchedulerService {
  constructor() {
    // Don't initialize Firestore here - it will be initialized by the server
    this.db = null;
    this.scheduledJobs = new Map();
    this.isInitialized = false;
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
   * Initialize the notification scheduler
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    // Schedule ride reminders check every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      this.checkRideReminders();
    });

    // Schedule daily cleanup at midnight
    cron.schedule('0 0 * * *', () => {
      this.cleanupExpiredNotifications();
    });

    // Schedule booking timeout check every 10 minutes
    cron.schedule('*/10 * * * *', () => {
      this.checkBookingTimeouts();
    });

    this.isInitialized = true;
    logger.info('Notification scheduler initialized');
  }

  /**
   * Check for upcoming rides that need reminders
   */
  async checkRideReminders() {
    try {
      const now = new Date();
      const reminderWindow = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Next 2 hours

      // Query rides that are departing soon and haven't had reminders sent
      const ridesQuery = await this.getDB().collection('rides')
        .where('departureTime', '>', now)
        .where('departureTime', '<=', reminderWindow)
        .where('status', '==', 'active')
        .get();

      for (const rideDoc of ridesQuery.docs) {
        const ride = { id: rideDoc.id, ...rideDoc.data() };
        await this.processRideReminders(ride);
      }

      logger.info(`Processed ride reminders for ${ridesQuery.docs.length} rides`);
    } catch (error) {
      logger.error('Failed to check ride reminders:', error);
    }
  }

  /**
   * Process reminders for a specific ride
   * @param {Object} ride - Ride data
   */
  async processRideReminders(ride) {
    try {
      const now = new Date();
      const departureTime = ride.departureTime.toDate();
      const minutesUntilDeparture = Math.floor((departureTime - now) / (1000 * 60));

      // Get all bookings for this ride
      const bookingsQuery = await this.getDB().collection('bookings')
        .where('rideId', '==', ride.id)
        .where('status', '==', 'confirmed')
        .get();

      const participants = [];
      
      // Add driver
      const driverDoc = await this.getDB().collection('users').doc(ride.driverId).get();
      if (driverDoc.exists) {
        participants.push({
          id: ride.driverId,
          ...driverDoc.data(),
          role: 'driver',
        });
      }

      // Add passengers
      for (const bookingDoc of bookingsQuery.docs) {
        const booking = bookingDoc.data();
        const passengerDoc = await this.getDB().collection('users').doc(booking.passengerId).get();
        if (passengerDoc.exists) {
          participants.push({
            id: booking.passengerId,
            ...passengerDoc.data(),
            role: 'passenger',
          });
        }
      }

      // Check if reminders should be sent based on timing preferences
      const reminderTimes = [60, 15]; // Default reminder times in minutes
      
      for (const reminderTime of reminderTimes) {
        if (Math.abs(minutesUntilDeparture - reminderTime) <= 2) { // 2-minute tolerance
          // Check if reminder was already sent
          const reminderKey = `${ride.id}_${reminderTime}`;
          const reminderDoc = await this.getDB().collection('sent_reminders').doc(reminderKey).get();
          
          if (!reminderDoc.exists) {
            // Send reminders to all participants
            await NotificationService.sendRideReminderNotifications(ride, participants, reminderTime);
            
            // Mark reminder as sent
            await this.getDB().collection('sent_reminders').doc(reminderKey).set({
              rideId: ride.id,
              reminderTime,
              sentAt: new Date(),
              participantCount: participants.length,
            });

            logger.info(`Sent ${reminderTime}-minute reminders for ride ${ride.id} to ${participants.length} participants`);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to process reminders for ride ${ride.id}:`, error);
    }
  }

  /**
   * Check for booking timeouts
   */
  async checkBookingTimeouts() {
    try {
      const now = new Date();
      const timeoutWindow = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago

      // Query pending bookings that have timed out
      const bookingsQuery = await this.getDB().collection('bookings')
        .where('status', '==', 'pending')
        .where('createdAt', '<=', timeoutWindow)
        .get();

      for (const bookingDoc of bookingsQuery.docs) {
        const booking = { id: bookingDoc.id, ...bookingDoc.data() };
        await this.processBookingTimeout(booking);
      }

      logger.info(`Processed ${bookingsQuery.docs.length} booking timeouts`);
    } catch (error) {
      logger.error('Failed to check booking timeouts:', error);
    }
  }

  /**
   * Process a booking timeout
   * @param {Object} booking - Booking data
   */
  async processBookingTimeout(booking) {
    try {
      // Update booking status to expired
      await this.getDB().collection('bookings').doc(booking.id).update({
        status: 'expired',
        expiredAt: new Date(),
      });

      // Get passenger and driver data
      const [passengerDoc, rideDoc] = await Promise.all([
        this.getDB().collection('users').doc(booking.passengerId).get(),
        this.getDB().collection('rides').doc(booking.rideId).get(),
      ]);

      if (passengerDoc.exists && rideDoc.exists) {
        const passenger = passengerDoc.data();
        const ride = rideDoc.data();

        // Notify passenger about timeout
        const passengerNotification = {
          type: 'booking_expired',
          title: 'Booking Request Expired',
          message: `Your booking request for the ride from ${ride.origin} to ${ride.destination} has expired due to no response from the driver.`,
          data: {
            bookingId: booking.id,
            rideId: booking.rideId,
          },
          priority: 'medium',
        };

        const passengerPreferences = await NotificationPreferencesService.getNotificationChannels(
          booking.passengerId,
          'bookingCancellations'
        );

        await NotificationService.sendComprehensiveNotification(
          booking.passengerId,
          passengerNotification,
          passengerPreferences,
          {
            email: passenger.email,
            phoneNumber: passenger.phoneNumber,
            fcmToken: await NotificationPreferencesService.getFCMToken(booking.passengerId),
          }
        );

        logger.info(`Booking timeout notification sent for booking ${booking.id}`);
      }
    } catch (error) {
      logger.error(`Failed to process booking timeout for booking ${booking.id}:`, error);
    }
  }

  /**
   * Schedule a custom notification
   * @param {string} userId - User ID
   * @param {Object} notification - Notification data
   * @param {Date} scheduledTime - When to send the notification
   * @param {string} jobId - Unique job identifier
   */
  async scheduleNotification(userId, notification, scheduledTime, jobId) {
    try {
      const now = new Date();
      
      if (scheduledTime <= now) {
        // Send immediately if scheduled time is in the past
        const preferences = await NotificationPreferencesService.getNotificationChannels(
          userId,
          notification.type
        );

        const userDoc = await this.getDB().collection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        await NotificationService.sendComprehensiveNotification(
          userId,
          notification,
          preferences,
          {
            email: userData.email,
            phoneNumber: userData.phoneNumber,
            fcmToken: await NotificationPreferencesService.getFCMToken(userId),
          }
        );

        logger.info(`Immediate notification sent to user ${userId}`);
        return;
      }

      // Calculate delay in milliseconds
      const delay = scheduledTime.getTime() - now.getTime();

      // Schedule the notification
      const timeoutId = setTimeout(async () => {
        try {
          const preferences = await NotificationPreferencesService.getNotificationChannels(
            userId,
            notification.type
          );

          const userDoc = await this.getDB().collection('users').doc(userId).get();
          const userData = userDoc.exists ? userDoc.data() : {};

          await NotificationService.sendComprehensiveNotification(
            userId,
            notification,
            preferences,
            {
              email: userData.email,
              phoneNumber: userData.phoneNumber,
              fcmToken: await NotificationPreferencesService.getFCMToken(userId),
            }
          );

          // Remove from scheduled jobs
          this.scheduledJobs.delete(jobId);

          logger.info(`Scheduled notification sent to user ${userId} (job: ${jobId})`);
        } catch (error) {
          logger.error(`Failed to send scheduled notification (job: ${jobId}):`, error);
        }
      }, delay);

      // Store the job for potential cancellation
      this.scheduledJobs.set(jobId, {
        timeoutId,
        userId,
        notification,
        scheduledTime,
      });

      logger.info(`Notification scheduled for user ${userId} at ${scheduledTime.toISOString()} (job: ${jobId})`);
    } catch (error) {
      logger.error(`Failed to schedule notification (job: ${jobId}):`, error);
    }
  }

  /**
   * Cancel a scheduled notification
   * @param {string} jobId - Job identifier
   */
  cancelScheduledNotification(jobId) {
    const job = this.scheduledJobs.get(jobId);
    if (job) {
      clearTimeout(job.timeoutId);
      this.scheduledJobs.delete(jobId);
      logger.info(`Cancelled scheduled notification job: ${jobId}`);
      return true;
    }
    return false;
  }

  /**
   * Clean up expired notification records
   */
  async cleanupExpiredNotifications() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep records for 30 days

      // Clean up sent reminders
      const remindersQuery = await this.getDB().collection('sent_reminders')
        .where('sentAt', '<=', cutoffDate)
        .get();

      const batch = this.getDB().batch();
      remindersQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`Cleaned up ${remindersQuery.docs.length} expired reminder records`);
    } catch (error) {
      logger.error('Failed to cleanup expired notifications:', error);
    }
  }

  /**
   * Get scheduled jobs status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      scheduledJobs: this.scheduledJobs.size,
      jobs: Array.from(this.scheduledJobs.entries()).map(([jobId, job]) => ({
        jobId,
        userId: job.userId,
        scheduledTime: job.scheduledTime,
        notificationType: job.notification.type,
      })),
    };
  }
}

// Export singleton instance
module.exports = new NotificationSchedulerService();
