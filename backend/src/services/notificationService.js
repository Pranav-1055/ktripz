const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const RealtimeService = require('./realtimeService');

class NotificationService {
  constructor() {
    this.twilioClient = null;
    this.sendGridInitialized = false;
    this.fcmInitialized = false;

    this.initializeServices();
  }

  initializeServices() {
    // Initialize Twilio
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        // Check if we're in development mode with mock credentials
        if (process.env.NODE_ENV === 'development' &&
          process.env.TWILIO_ACCOUNT_SID.startsWith('ACmock')) {
          logger.info('Using mock Twilio service for development');
          this.twilioClient = {
            messages: {
              create: async (options) => {
                logger.info('Mock SMS sent:', options);
                return { sid: 'mock-message-sid', status: 'sent' };
              }
            }
          };
        } else {
          this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          logger.info('Twilio SMS service initialized');
        }
      } catch (error) {
        logger.warn('Failed to initialize Twilio:', error.message);
        this.twilioClient = null;
      }
    } else {
      logger.warn('Twilio credentials not found. SMS notifications will be disabled.');
    }

    // Initialize SendGrid
    if (process.env.SENDGRID_API_KEY) {
      try {
        if (process.env.NODE_ENV === 'development' &&
          process.env.SENDGRID_API_KEY.startsWith('mock-')) {
          logger.info('Using mock SendGrid service for development');
          this.sendGridInitialized = true;
        } else {
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          this.sendGridInitialized = true;
          logger.info('SendGrid email service initialized');
        }
      } catch (error) {
        logger.warn('Failed to initialize SendGrid:', error.message);
        this.sendGridInitialized = false;
      }
    } else {
      logger.warn('SendGrid API key not found. Email notifications will be disabled.');
    }

    // FCM is initialized through Firebase Admin SDK
    this.fcmInitialized = true;
    logger.info('Firebase Cloud Messaging service initialized');
  }

  /**
   * Send SMS notification
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - SMS message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} SMS result
   */
  async sendSMS(phoneNumber, message, options = {}) {
    try {
      if (!this.twilioClient) {
        throw new Error('Twilio SMS service not initialized');
      }

      // Ensure phone number is in international format
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      const smsOptions = {
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone,
        ...options,
      };

      const result = await this.twilioClient.messages.create(smsOptions);

      logger.info(`SMS sent successfully to ${formattedPhone}. SID: ${result.sid}`);

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        to: formattedPhone,
      };
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      return {
        success: false,
        error: error.message,
        to: phoneNumber,
      };
    }
  }

  /**
   * Send email notification
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} htmlContent - HTML content
   * @param {string} textContent - Text content (optional)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Email result
   */
  async sendEmail(to, subject, htmlContent, textContent = null, options = {}) {
    try {
      if (!this.sendGridInitialized) {
        logger.warn('SendGrid email service not initialized. Logging email to console instead.');
        logger.info(`[MOCK EMAIL] To: ${to}`);
        logger.info(`[MOCK EMAIL] Subject: ${subject}`);
        logger.info(`[MOCK EMAIL] Content: ${textContent || this.stripHtml(htmlContent)}`);

        return {
          success: true,
          messageId: `mock-${Date.now()}`,
          to,
        };
      }

      const emailOptions = {
        to,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || 'noreply@tripo.com',
          name: process.env.SENDGRID_FROM_NAME || 'TripO',
        },
        subject,
        html: htmlContent,
        text: textContent || this.stripHtml(htmlContent),
        ...options,
      };

      logger.info(`Attempting to send email via SendGrid to ${to}...`);
      const result = await sgMail.send(emailOptions);
      logger.info(`SendGrid response received for ${to}`);

      logger.info(`Email sent successfully to ${to}`);

      return {
        success: true,
        messageId: result[0].headers['x-message-id'],
        to,
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error.message,
        to,
      };
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging
   * @param {string|Array} tokens - FCM token(s)
   * @param {Object} notification - Notification payload
   * @param {Object} data - Data payload
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Push notification result
   */
  async sendPushNotification(tokens, notification, data = {}, options = {}) {
    try {
      if (!this.fcmInitialized) {
        throw new Error('Firebase Cloud Messaging not initialized');
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#007bff',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        ...options,
      };

      let result;
      if (Array.isArray(tokens)) {
        // Send to multiple tokens
        message.tokens = tokens;
        result = await admin.messaging().sendMulticast(message);

        logger.info(`Push notification sent to ${tokens.length} devices. Success: ${result.successCount}, Failed: ${result.failureCount}`);

        return {
          success: result.successCount > 0,
          successCount: result.successCount,
          failureCount: result.failureCount,
          responses: result.responses,
        };
      } else {
        // Send to single token
        message.token = tokens;
        const messageId = await admin.messaging().send(message);

        logger.info(`Push notification sent successfully. Message ID: ${messageId}`);

        return {
          success: true,
          messageId,
          token: tokens,
        };
      }
    } catch (error) {
      logger.error('Failed to send push notification:', error);
      return {
        success: false,
        error: error.message,
        tokens,
      };
    }
  }

  /**
   * Send comprehensive notification (real-time + SMS + email + push)
   * @param {string} userId - User ID
   * @param {Object} notificationData - Notification data
   * @param {Object} userPreferences - User notification preferences
   * @param {Object} userContact - User contact information
   * @returns {Promise<Object>} Comprehensive notification result
   */
  async sendComprehensiveNotification(userId, notificationData, userPreferences = {}, userContact = {}) {
    const results = {
      realtime: false,
      sms: false,
      email: false,
      push: false,
      errors: [],
    };

    try {
      // Always send real-time notification
      await RealtimeService.emitUserNotification(userId, notificationData);
      results.realtime = true;
      logger.info(`Real-time notification sent to user ${userId}`);

      // Send SMS if enabled and phone number available
      if (userPreferences.sms && userContact.phoneNumber) {
        const smsResult = await this.sendSMS(
          userContact.phoneNumber,
          this.formatSMSMessage(notificationData),
          { userId }
        );
        results.sms = smsResult.success;
        if (!smsResult.success) {
          results.errors.push(`SMS: ${smsResult.error}`);
        }
      }

      // Send email if enabled and email available
      if (userPreferences.email && userContact.email) {
        const emailResult = await this.sendEmail(
          userContact.email,
          notificationData.title,
          this.formatEmailHTML(notificationData),
          this.formatEmailText(notificationData),
          { userId }
        );
        results.email = emailResult.success;
        if (!emailResult.success) {
          results.errors.push(`Email: ${emailResult.error}`);
        }
      }

      // Send push notification if enabled and FCM token available
      if (userPreferences.push && userContact.fcmToken) {
        const pushResult = await this.sendPushNotification(
          userContact.fcmToken,
          {
            title: notificationData.title,
            body: notificationData.message,
            imageUrl: notificationData.imageUrl,
          },
          {
            type: notificationData.type,
            userId,
            ...notificationData.data,
          }
        );
        results.push = pushResult.success;
        if (!pushResult.success) {
          results.errors.push(`Push: ${pushResult.error}`);
        }
      }

      logger.info(`Comprehensive notification sent to user ${userId}:`, results);
      return results;
    } catch (error) {
      logger.error('Failed to send comprehensive notification:', error);
      results.errors.push(`General: ${error.message}`);
      return results;
    }
  }

  /**
   * Send booking confirmation notifications
   * @param {Object} bookingData - Booking data
   * @param {Object} passengerData - Passenger data
   * @param {Object} driverData - Driver data
   */
  async sendBookingConfirmationNotifications(bookingData, passengerData, driverData) {
    try {
      // Notify passenger
      const passengerNotification = {
        type: 'booking_confirmed',
        title: 'Booking Confirmed!',
        message: `Your booking for the ride from ${bookingData.origin} to ${bookingData.destination} has been confirmed.`,
        data: {
          bookingId: bookingData.id,
          rideId: bookingData.rideId,
          driverName: driverData.name,
          departureTime: bookingData.departureTime,
        },
        priority: 'high',
      };

      await this.sendComprehensiveNotification(
        passengerData.id,
        passengerNotification,
        passengerData.preferences?.notifications || {},
        {
          email: passengerData.email,
          phoneNumber: passengerData.phoneNumber,
          fcmToken: passengerData.fcmToken,
        }
      );

      // Notify driver
      const driverNotification = {
        type: 'new_passenger',
        title: 'New Passenger Booked!',
        message: `${passengerData.name} has booked a seat on your ride.`,
        data: {
          bookingId: bookingData.id,
          rideId: bookingData.rideId,
          passengerName: passengerData.name,
          seats: bookingData.seats,
        },
        priority: 'high',
      };

      await this.sendComprehensiveNotification(
        driverData.id,
        driverNotification,
        driverData.preferences?.notifications || {},
        {
          email: driverData.email,
          phoneNumber: driverData.phoneNumber,
          fcmToken: driverData.fcmToken,
        }
      );

      return true;
    } catch (error) {
      logger.error('Failed to send booking confirmation notifications:', error);
      return false;
    }
  }

  /**
   * Helper to strip HTML tags for text content
   * @param {string} html - HTML content
   * @returns {string} Text content
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>?/gm, '');
  }

  /**
   * Helper to format SMS message
   * @param {Object} data - Notification data
   * @returns {string} Formatted SMS
   */
  formatSMSMessage(data) {
    return `${data.title}: ${data.message} - TripO`;
  }

  /**
   * Helper to format email HTML
   * @param {Object} data - Notification data
   * @returns {string} Formatted HTML
   */
  formatEmailHTML(data) {
    return `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>${data.title}</h2>
        <p>${data.message}</p>
        <p>TripO Team</p>
      </div>
    `;
  }

  /**
   * Helper to format email text
   * @param {Object} data - Notification data
   * @returns {string} Formatted text
   */
  formatEmailText(data) {
    return `${data.title}\n\n${data.message}\n\nTripO Team`;
  }
}

module.exports = new NotificationService();