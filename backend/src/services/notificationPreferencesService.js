const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class NotificationPreferencesService {
  constructor() {
    // Don't initialize Firestore here - it will be initialized by the server
    this.db = null;
    this.collection = 'notification_preferences';
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
   * Get user notification preferences
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User notification preferences
   */
  async getUserPreferences(userId) {
    try {
      const doc = await this.getDB().collection(this.collection).doc(userId).get();
      
      if (!doc.exists) {
        // Return default preferences if none exist
        return this.getDefaultPreferences();
      }

      const preferences = doc.data();
      
      // Merge with defaults to ensure all fields are present
      return {
        ...this.getDefaultPreferences(),
        ...preferences,
        updatedAt: preferences.updatedAt?.toDate() || new Date(),
      };
    } catch (error) {
      logger.error(`Failed to get notification preferences for user ${userId}:`, error);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Update user notification preferences
   * @param {string} userId - User ID
   * @param {Object} preferences - Notification preferences
   * @returns {Promise<Object>} Updated preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const updatedPreferences = {
        ...preferences,
        updatedAt: new Date(),
      };

      await this.getDB().collection(this.collection).doc(userId).set(updatedPreferences, { merge: true });

      logger.info(`Notification preferences updated for user ${userId}`);
      return updatedPreferences;
    } catch (error) {
      logger.error(`Failed to update notification preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get default notification preferences
   * @returns {Object} Default preferences
   */
  getDefaultPreferences() {
    return {
      // Channel preferences
      realtime: true,    // Always enabled for real-time updates
      email: true,       // Email notifications
      sms: false,        // SMS notifications (opt-in)
      push: true,        // Push notifications

      // Notification type preferences
      bookingRequests: {
        realtime: true,
        email: true,
        sms: false,
        push: true,
      },
      bookingConfirmations: {
        realtime: true,
        email: true,
        sms: true,
        push: true,
      },
      bookingCancellations: {
        realtime: true,
        email: true,
        sms: true,
        push: true,
      },
      rideReminders: {
        realtime: true,
        email: false,
        sms: true,
        push: true,
      },
      rideUpdates: {
        realtime: true,
        email: false,
        sms: false,
        push: true,
      },
      tripTracking: {
        realtime: true,
        email: false,
        sms: false,
        push: true,
      },
      messages: {
        realtime: true,
        email: false,
        sms: false,
        push: true,
      },
      paymentUpdates: {
        realtime: true,
        email: true,
        sms: false,
        push: true,
      },
      promotions: {
        realtime: false,
        email: true,
        sms: false,
        push: false,
      },

      // Timing preferences
      reminderTiming: {
        beforeRide: [60, 15], // Minutes before ride to send reminders
        afterBooking: 5,      // Minutes after booking to send confirmation
      },

      // Quiet hours (24-hour format)
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
      },

      // Frequency limits
      frequencyLimits: {
        maxSMSPerDay: 5,
        maxEmailsPerDay: 10,
        maxPushPerHour: 20,
      },

      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Check if user should receive notification based on preferences
   * @param {string} userId - User ID
   * @param {string} notificationType - Type of notification
   * @param {string} channel - Notification channel (email, sms, push, realtime)
   * @returns {Promise<boolean>} Whether to send notification
   */
  async shouldSendNotification(userId, notificationType, channel) {
    try {
      const preferences = await this.getUserPreferences(userId);

      // Check if channel is globally enabled
      if (!preferences[channel]) {
        return false;
      }

      // Check if notification type is enabled for this channel
      if (preferences[notificationType] && preferences[notificationType][channel] !== undefined) {
        return preferences[notificationType][channel];
      }

      // Default to channel preference if specific type preference not found
      return preferences[channel];
    } catch (error) {
      logger.error(`Failed to check notification preference for user ${userId}:`, error);
      // Default to allowing notification on error
      return true;
    }
  }

  /**
   * Check if current time is within quiet hours
   * @param {Object} quietHours - Quiet hours configuration
   * @returns {boolean} Whether it's currently quiet hours
   */
  isQuietHours(quietHours) {
    if (!quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: quietHours.timezone || 'UTC' 
    }).substring(0, 5);

    const start = quietHours.start;
    const end = quietHours.end;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }

    // Handle same-day quiet hours (e.g., 12:00 to 14:00)
    return currentTime >= start && currentTime <= end;
  }

  /**
   * Get filtered notification preferences for sending
   * @param {string} userId - User ID
   * @param {string} notificationType - Type of notification
   * @returns {Promise<Object>} Filtered preferences for channels
   */
  async getNotificationChannels(userId, notificationType) {
    try {
      const preferences = await this.getUserPreferences(userId);
      const channels = {};

      // Check each channel
      for (const channel of ['realtime', 'email', 'sms', 'push']) {
        channels[channel] = await this.shouldSendNotification(userId, notificationType, channel);
      }

      // Apply quiet hours for non-urgent channels
      if (this.isQuietHours(preferences.quietHours)) {
        // During quiet hours, only allow realtime and urgent push notifications
        channels.email = false;
        channels.sms = false;
        
        // Only allow push for urgent notification types
        const urgentTypes = ['bookingConfirmations', 'bookingCancellations', 'rideReminders'];
        if (!urgentTypes.includes(notificationType)) {
          channels.push = false;
        }
      }

      return channels;
    } catch (error) {
      logger.error(`Failed to get notification channels for user ${userId}:`, error);
      // Return safe defaults
      return {
        realtime: true,
        email: false,
        sms: false,
        push: false,
      };
    }
  }

  /**
   * Update FCM token for user
   * @param {string} userId - User ID
   * @param {string} fcmToken - FCM token
   * @returns {Promise<void>}
   */
  async updateFCMToken(userId, fcmToken) {
    try {
      await this.getDB().collection('user_tokens').doc(userId).set({
        fcmToken,
        updatedAt: new Date(),
      }, { merge: true });

      logger.info(`FCM token updated for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to update FCM token for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user FCM token
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} FCM token
   */
  async getFCMToken(userId) {
    try {
      const doc = await this.getDB().collection('user_tokens').doc(userId).get();
      
      if (!doc.exists) {
        return null;
      }

      return doc.data().fcmToken || null;
    } catch (error) {
      logger.error(`Failed to get FCM token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Validate notification preferences
   * @param {Object} preferences - Preferences to validate
   * @returns {Object} Validation result
   */
  validatePreferences(preferences) {
    const errors = [];
    const validChannels = ['realtime', 'email', 'sms', 'push'];
    const validNotificationTypes = [
      'bookingRequests', 'bookingConfirmations', 'bookingCancellations',
      'rideReminders', 'rideUpdates', 'tripTracking', 'messages',
      'paymentUpdates', 'promotions'
    ];

    // Validate channel preferences
    for (const channel of validChannels) {
      if (preferences[channel] !== undefined && typeof preferences[channel] !== 'boolean') {
        errors.push(`${channel} must be a boolean`);
      }
    }

    // Validate notification type preferences
    for (const type of validNotificationTypes) {
      if (preferences[type]) {
        for (const channel of validChannels) {
          if (preferences[type][channel] !== undefined && typeof preferences[type][channel] !== 'boolean') {
            errors.push(`${type}.${channel} must be a boolean`);
          }
        }
      }
    }

    // Validate quiet hours
    if (preferences.quietHours) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (preferences.quietHours.start && !timeRegex.test(preferences.quietHours.start)) {
        errors.push('quietHours.start must be in HH:MM format');
      }
      if (preferences.quietHours.end && !timeRegex.test(preferences.quietHours.end)) {
        errors.push('quietHours.end must be in HH:MM format');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new NotificationPreferencesService();
