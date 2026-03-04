const Message = require('../models/Message');
const Booking = require('../models/Booking');
const User = require('../models/User');
const logger = require('../utils/logger');

class MessagingService {
  /**
   * Enable communication features after booking confirmation
   */
  static async enableBookingCommunication(booking) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      // Create communication settings for confirmed booking
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      const communicationSettings = {
        bookingId: booking.id,
        conversationId,
        participants: [booking.passengerId, booking.driverId],
        status: 'active',
        features: {
          messaging: true,
          locationSharing: true,
          emergencyContact: true,
          callsEnabled: true,
          photoSharing: true,
          contactInfoShared: true
        },
        enabledAt: new Date().toISOString(),
        bookingStatus: booking.status
      };

      // Store communication settings
      const commRef = realtimeDb.ref(`bookingCommunication/${booking.id}`);
      await commRef.set(communicationSettings);

      logger.info(`Booking communication enabled for booking: ${booking.id}`);
      return communicationSettings;
    } catch (error) {
      logger.error('Error enabling booking communication:', error);
      throw error;
    }
  }

  /**
   * Set up trip-specific communication channel
   */
  static async setupTripCommunicationChannel(booking) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      // Create trip-specific communication settings
      const tripCommunicationData = {
        bookingId: booking.id,
        rideId: booking.rideId,
        conversationId,
        participants: [booking.passengerId, booking.driverId],
        features: {
          messaging: true,
          locationSharing: true,
          emergencyContact: true,
          callsEnabled: true,
          photoSharing: true
        },
        tripPhase: 'pre_trip', // pre_trip, in_progress, completed
        emergencyContactsEnabled: true,
        setupAt: new Date().toISOString()
      };

      // Store trip communication settings in Firebase
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const tripCommRef = realtimeDb.ref(`tripCommunication/${booking.id}`);
      await tripCommRef.set(tripCommunicationData);

      logger.info(`Trip communication channel setup for booking: ${booking.id}`);
      return tripCommunicationData;
    } catch (error) {
      logger.error('Error setting up trip communication channel:', error);
      throw error;
    }
  }

  /**
   * Share driver contact information with passenger after booking confirmation
   */
  static async shareDriverContactInfo(booking) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      // Get driver information
      const User = require('../models/User');
      const driver = await User.findById(booking.driverId);
      
      if (!driver) {
        throw new Error('Driver not found');
      }

      // Create contact info sharing message
      const contactMessage = await Message.create({
        conversationId,
        fromUserId: booking.driverId,
        toUserId: booking.passengerId,
        content: `📞 Contact Information Shared\n\nYou can now contact me for trip coordination:\n📱 Phone: ${driver.profile?.phone || 'Not provided'}\n\nI'll send you pickup details closer to the departure time. Looking forward to the trip!`,
        type: 'text',
        isTemplate: true,
        templateType: 'contact_info_shared',
        metadata: {
          driverPhone: driver.profile?.phone,
          bookingId: booking.id,
          sharedAt: new Date().toISOString()
        }
      });

      logger.info(`Driver contact info shared for booking: ${booking.id}`);
      return contactMessage;
    } catch (error) {
      logger.error('Error sharing driver contact info:', error);
      throw error;
    }
  }

  /**
   * Update trip communication phase
   */
  static async updateTripCommunicationPhase(bookingId, phase) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const tripCommRef = realtimeDb.ref(`tripCommunication/${bookingId}`);
      
      await tripCommRef.update({
        tripPhase: phase,
        phaseUpdatedAt: new Date().toISOString()
      });

      logger.info(`Trip communication phase updated to ${phase} for booking: ${bookingId}`);
      return true;
    } catch (error) {
      logger.error('Error updating trip communication phase:', error);
      throw error;
    }
  }

  /**
   * Enable emergency contact integration for active trip
   */
  static async enableEmergencyContactIntegration(booking) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      // Get emergency contacts for both passenger and driver
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      const [passengerContacts, driverContacts] = await Promise.all([
        realtimeDb.ref(`users/${booking.passengerId}/emergencyContacts`).once('value'),
        realtimeDb.ref(`users/${booking.driverId}/emergencyContacts`).once('value')
      ]);

      const emergencyData = {
        bookingId: booking.id,
        conversationId,
        passengerEmergencyContacts: passengerContacts.val() || [],
        driverEmergencyContacts: driverContacts.val() || [],
        emergencyProtocolEnabled: true,
        enabledAt: new Date().toISOString()
      };

      // Store emergency contact integration data
      const emergencyRef = realtimeDb.ref(`emergencyIntegration/${booking.id}`);
      await emergencyRef.set(emergencyData);

      logger.info(`Emergency contact integration enabled for booking: ${booking.id}`);
      return emergencyData;
    } catch (error) {
      logger.error('Error enabling emergency contact integration:', error);
      throw error;
    }
  }

  /**
   * Send emergency alert to emergency contacts
   */
  static async sendEmergencyAlert(booking, alertType, alertData = {}) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      // Get emergency integration data
      const emergencyRef = realtimeDb.ref(`emergencyIntegration/${booking.id}`);
      const emergencySnapshot = await emergencyRef.once('value');
      const emergencyData = emergencySnapshot.val();
      
      if (!emergencyData || !emergencyData.emergencyProtocolEnabled) {
        throw new Error('Emergency protocol not enabled for this booking');
      }

      // Determine which emergency contacts to alert
      let contactsToAlert = [];
      if (alertData.alertPassengerContacts) {
        contactsToAlert = contactsToAlert.concat(emergencyData.passengerEmergencyContacts || []);
      }
      if (alertData.alertDriverContacts) {
        contactsToAlert = contactsToAlert.concat(emergencyData.driverEmergencyContacts || []);
      }

      // Create emergency alert messages
      const alertMessages = {
        trip_emergency: `🚨 TRIP EMERGENCY ALERT\n\nThere has been an emergency during a trip. Trip ID: ${booking.id}\nTime: ${new Date().toLocaleString()}\n\nPlease contact the traveler immediately.`,
        breakdown: `🚗 VEHICLE BREAKDOWN ALERT\n\nVehicle breakdown reported during trip ${booking.id}\nTime: ${new Date().toLocaleString()}\n\nTraveler may need assistance.`,
        accident: `🚨 ACCIDENT ALERT\n\nAccident reported during trip ${booking.id}\nTime: ${new Date().toLocaleString()}\n\nEmergency services may be needed.`,
        location_emergency: `📍 LOCATION EMERGENCY\n\nLocation-based emergency during trip ${booking.id}\nTime: ${new Date().toLocaleString()}\n\nImmediate assistance may be required.`
      };

      const alertMessage = alertMessages[alertType] || alertMessages.trip_emergency;

      // In a real implementation, this would send SMS/calls to emergency contacts
      // For now, we'll log the alerts and store them
      const alertRecord = {
        bookingId: booking.id,
        alertType,
        alertMessage,
        contactsAlerted: contactsToAlert.length,
        alertData,
        sentAt: new Date().toISOString()
      };

      // Store alert record
      const alertRef = realtimeDb.ref(`emergencyAlerts/${booking.id}`).push();
      await alertRef.set(alertRecord);

      // Log each contact that would be alerted
      contactsToAlert.forEach(contact => {
        logger.info(`Emergency alert would be sent to: ${contact.name} (${contact.phone}) - ${alertMessage}`);
      });

      logger.info(`Emergency alert sent for booking: ${booking.id}, type: ${alertType}`);
      return alertRecord;
    } catch (error) {
      logger.error('Error sending emergency alert:', error);
      throw error;
    }
  }

  /**
   * Get trip communication status
   */
  static async getTripCommunicationStatus(bookingId) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      const [tripCommSnapshot, emergencySnapshot] = await Promise.all([
        realtimeDb.ref(`tripCommunication/${bookingId}`).once('value'),
        realtimeDb.ref(`emergencyIntegration/${bookingId}`).once('value')
      ]);

      return {
        tripCommunication: tripCommSnapshot.val(),
        emergencyIntegration: emergencySnapshot.val(),
        isActive: !!tripCommSnapshot.val()
      };
    } catch (error) {
      logger.error('Error getting trip communication status:', error);
      return {
        tripCommunication: null,
        emergencyIntegration: null,
        isActive: false
      };
    }
  }

  /**
   * Send custom emergency message
   */
  static async sendCustomEmergencyMessage(conversationId, fromUserId, toUserId, customMessage) {
    try {
      const message = await Message.create({
        conversationId,
        fromUserId,
        toUserId,
        content: `🚨 EMERGENCY: ${customMessage}`,
        type: 'text',
        metadata: {
          isEmergency: true,
          emergencyType: 'custom',
          priority: 'high'
        }
      });

      logger.info(`Custom emergency message sent: ${conversationId}`);
      return message;
    } catch (error) {
      logger.error('Error sending custom emergency message:', error);
      throw error;
    }
  }

  /**
   * Send custom message
   */
  static async sendCustomMessage(conversationId, fromUserId, toUserId, messageContent) {
    try {
      const message = await Message.create({
        conversationId,
        fromUserId,
        toUserId,
        content: messageContent,
        type: 'text'
      });

      logger.info(`Custom message sent: ${conversationId}`);
      return message;
    } catch (error) {
      logger.error('Error sending custom message:', error);
      throw error;
    }
  }

  /**
   * Send location message
   */
  static async sendLocationMessage(conversationId, fromUserId, toUserId, locationData) {
    try {
      const { latitude, longitude, address, message } = locationData;
      
      const content = message 
        ? `📍 ${message} - Location: ${address || `${latitude}, ${longitude}`}`
        : `📍 Current location: ${address || `${latitude}, ${longitude}`}`;

      const locationMessage = await Message.create({
        conversationId,
        fromUserId,
        toUserId,
        content,
        type: 'location',
        metadata: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address: address || null,
          timestamp: new Date().toISOString()
        }
      });

      logger.info(`Location message sent: ${conversationId}`);
      return locationMessage;
    } catch (error) {
      logger.error('Error sending location message:', error);
      throw error;
    }
  }

  /**
   * Send location update during trip
   */
  static async sendLocationUpdate(conversationId, fromUserId, toUserId, location) {
    try {
      const message = await Message.create({
        conversationId,
        fromUserId,
        toUserId,
        content: `📍 Location update: ${location.address || 'Current position'}`,
        type: 'location',
        metadata: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address || null,
          isUpdate: true,
          timestamp: new Date().toISOString()
        }
      });

      logger.info(`Location update sent: ${conversationId}`);
      return message;
    } catch (error) {
      logger.error('Error sending location update:', error);
      throw error;
    }
  }

  /**
   * Get conversation statistics for a specific conversation
   */
  static async getConversationStats(conversationId) {
    try {
      return await Message.getConversationStats(conversationId);
    } catch (error) {
      logger.error('Error getting conversation stats:', error);
      return {
        conversationId,
        totalMessages: 0,
        unreadMessages: 0,
        lastMessage: null,
        participants: [],
        lastActivity: null
      };
    }
  }

  /**
   * Initialize communication preferences for user
   */
  static async initializeCommunicationPreferences(userId, preferences = {}) {
    try {
      const defaultPreferences = {
        allowCalls: true,
        allowMessages: true,
        allowLocationSharing: true,
        allowEmergencyContact: true,
        autoResponseEnabled: false,
        autoResponseMessage: "I'll get back to you soon!",
        quietHours: {
          enabled: false,
          start: '22:00',
          end: '07:00'
        },
        ...preferences
      };

      // Save to Firebase Realtime Database
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const preferencesRef = realtimeDb.ref(`users/${userId}/communicationPreferences`);
      await preferencesRef.set(defaultPreferences);

      logger.info(`Communication preferences initialized for user: ${userId}`, defaultPreferences);
      return defaultPreferences;
    } catch (error) {
      logger.error('Error initializing communication preferences:', error);
      throw error;
    }
  }

  /**
   * Update communication preferences
   */
  static async updateCommunicationPreferences(userId, preferences) {
    try {
      // Get current preferences
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const preferencesRef = realtimeDb.ref(`users/${userId}/communicationPreferences`);
      
      const snapshot = await preferencesRef.once('value');
      const currentPreferences = snapshot.val() || {};

      // Merge with updates
      const updatedPreferences = {
        ...currentPreferences,
        ...preferences,
        updatedAt: new Date().toISOString()
      };

      // Save to Firebase
      await preferencesRef.set(updatedPreferences);

      logger.info(`Communication preferences updated for user: ${userId}`, preferences);
      return updatedPreferences;
    } catch (error) {
      logger.error('Error updating communication preferences:', error);
      throw error;
    }
  }

  /**
   * Get communication preferences for user
   */
  static async getCommunicationPreferences(userId) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const preferencesRef = realtimeDb.ref(`users/${userId}/communicationPreferences`);
      
      const snapshot = await preferencesRef.once('value');
      let preferences = snapshot.val();

      // If no preferences exist, initialize with defaults
      if (!preferences) {
        preferences = await this.initializeCommunicationPreferences(userId);
      }

      return preferences;
    } catch (error) {
      logger.error('Error getting communication preferences:', error);
      throw error;
    }
  }

  /**
   * Check if communication is allowed between users
   */
  static async isCommunicationAllowed(fromUserId, toUserId, communicationType = 'message') {
    try {
      // Get recipient's communication preferences
      const toUserPreferences = await this.getCommunicationPreferences(toUserId);
      
      // Check if the specific communication type is allowed
      switch (communicationType) {
        case 'call':
          if (!toUserPreferences.allowCalls) {
            return false;
          }
          break;
        case 'message':
          if (!toUserPreferences.allowMessages) {
            return false;
          }
          break;
        case 'location':
          if (!toUserPreferences.allowLocationSharing) {
            return false;
          }
          break;
        case 'emergency':
          if (!toUserPreferences.allowEmergencyContact) {
            return false;
          }
          break;
      }

      // Check quiet hours for non-emergency communications
      if (communicationType !== 'emergency' && toUserPreferences.quietHours?.enabled) {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
        const { start, end } = toUserPreferences.quietHours;
        
        // Handle quiet hours that span midnight
        let isQuietTime;
        if (start > end) {
          // Quiet hours span midnight (e.g., 22:00 to 07:00)
          isQuietTime = currentTime >= start || currentTime <= end;
        } else {
          // Quiet hours within same day (e.g., 13:00 to 14:00)
          isQuietTime = currentTime >= start && currentTime <= end;
        }
        
        if (isQuietTime) {
          return false;
        }
      }

      // Check if users have an active booking together
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      // Look for active bookings between these users
      const bookingsRef = realtimeDb.ref('bookings');
      const passengerBookingsQuery = bookingsRef.orderByChild('passengerId').equalTo(fromUserId);
      const driverBookingsQuery = bookingsRef.orderByChild('driverId').equalTo(fromUserId);
      
      const [passengerSnapshot, driverSnapshot] = await Promise.all([
        passengerBookingsQuery.once('value'),
        driverBookingsQuery.once('value')
      ]);
      
      let hasActiveBooking = false;
      
      // Check passenger bookings
      if (passengerSnapshot.exists()) {
        const bookings = passengerSnapshot.val();
        hasActiveBooking = Object.values(bookings).some(booking => 
          booking.driverId === toUserId && 
          ['requested', 'confirmed', 'in_progress'].includes(booking.status)
        );
      }
      
      // Check driver bookings if not found as passenger
      if (!hasActiveBooking && driverSnapshot.exists()) {
        const bookings = driverSnapshot.val();
        hasActiveBooking = Object.values(bookings).some(booking => 
          booking.passengerId === toUserId && 
          ['requested', 'confirmed', 'in_progress'].includes(booking.status)
        );
      }
      
      return hasActiveBooking;
    } catch (error) {
      logger.error('Error checking communication permissions:', error);
      return false;
    }
  }

  /**
   * Send automated pickup coordination message
   */
  static async sendPickupCoordinationMessage(booking, coordinationData = {}) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      const message = await Message.createTemplate(
        'pickup_coordination',
        conversationId,
        booking.driverId,
        booking.passengerId,
        {
          pickupTime: coordinationData.pickupTime || 'the scheduled time',
          pickupLocation: coordinationData.pickupLocation || 'the pickup point',
          driverLocation: coordinationData.driverLocation || 'nearby',
          estimatedArrival: coordinationData.estimatedArrival || '5 minutes'
        }
      );

      logger.info(`Pickup coordination message sent for booking: ${booking.id}`);
      return message;
    } catch (error) {
      logger.error('Error sending pickup coordination message:', error);
      throw error;
    }
  }
  static async initializeBookingConversation(booking) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      // Send initial welcome message from driver to passenger
      const welcomeMessage = await Message.createTemplate(
        'booking_confirmed',
        conversationId,
        booking.driverId,
        booking.passengerId,
        {
          bookingId: booking.id,
          rideId: booking.rideId
        }
      );

      logger.info(`Booking conversation initialized: ${conversationId}`);
      return welcomeMessage;
    } catch (error) {
      logger.error('Error initializing booking conversation:', error);
      throw error;
    }
  }

  /**
   * Send pickup reminder message
   */
  static async sendPickupReminder(booking, timeUntilPickup = '30 minutes') {
    try {
      const conversationId = `booking_${booking.id}`;
      
      const reminderMessage = await Message.createTemplate(
        'pickup_reminder',
        conversationId,
        booking.driverId,
        booking.passengerId,
        {
          timeUntilPickup,
          pickupLocation: booking.pickupPoint?.name || 'the pickup point',
          pickupTime: booking.pickupPoint?.time || 'the scheduled time'
        }
      );

      logger.info(`Pickup reminder sent for booking: ${booking.id}`);
      return reminderMessage;
    } catch (error) {
      logger.error('Error sending pickup reminder:', error);
      throw error;
    }
  }

  /**
   * Send arrival notification
   */
  static async sendArrivalNotification(booking, vehicleDetails = {}) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      const arrivalMessage = await Message.createTemplate(
        'arrival_notification',
        conversationId,
        booking.driverId,
        booking.passengerId,
        {
          vehicleColor: vehicleDetails.color || 'car',
          vehicleMake: vehicleDetails.make || '',
          vehicleModel: vehicleDetails.model || '',
          licensePlate: vehicleDetails.licensePlate || 'license plate'
        }
      );

      logger.info(`Arrival notification sent for booking: ${booking.id}`);
      return arrivalMessage;
    } catch (error) {
      logger.error('Error sending arrival notification:', error);
      throw error;
    }
  }

  /**
   * Send trip started notification
   */
  static async sendTripStartedNotification(booking, estimatedArrival = null) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      const tripStartedMessage = await Message.createTemplate(
        'trip_started',
        conversationId,
        booking.driverId,
        booking.passengerId,
        {
          estimatedArrival: estimatedArrival || 'as scheduled'
        }
      );

      logger.info(`Trip started notification sent for booking: ${booking.id}`);
      return tripStartedMessage;
    } catch (error) {
      logger.error('Error sending trip started notification:', error);
      throw error;
    }
  }

  /**
   * Send trip completed notification
   */
  static async sendTripCompletedNotification(booking) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      const tripCompletedMessage = await Message.createTemplate(
        'trip_completed',
        conversationId,
        booking.driverId,
        booking.passengerId,
        {
          bookingId: booking.id
        }
      );

      logger.info(`Trip completed notification sent for booking: ${booking.id}`);
      return tripCompletedMessage;
    } catch (error) {
      logger.error('Error sending trip completed notification:', error);
      throw error;
    }
  }

  /**
   * Send payment reminder
   */
  static async sendPaymentReminder(booking) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      const paymentReminderMessage = await Message.createTemplate(
        'payment_reminder',
        conversationId,
        booking.driverId,
        booking.passengerId,
        {
          amount: booking.pricing?.finalAmount || 0,
          bookingId: booking.id
        }
      );

      logger.info(`Payment reminder sent for booking: ${booking.id}`);
      return paymentReminderMessage;
    } catch (error) {
      logger.error('Error sending payment reminder:', error);
      throw error;
    }
  }

  /**
   * Send cancellation notice
   */
  static async sendCancellationNotice(booking, cancelledByUserId, reason = 'unforeseen circumstances') {
    try {
      const conversationId = `booking_${booking.id}`;
      
      // Determine sender and recipient
      const fromUserId = cancelledByUserId;
      const toUserId = cancelledByUserId === booking.driverId ? booking.passengerId : booking.driverId;
      
      const cancellationMessage = await Message.createTemplate(
        'cancellation_notice',
        conversationId,
        fromUserId,
        toUserId,
        {
          reason,
          bookingId: booking.id,
          cancelledBy: cancelledByUserId === booking.driverId ? 'driver' : 'passenger'
        }
      );

      logger.info(`Cancellation notice sent for booking: ${booking.id}`);
      return cancellationMessage;
    } catch (error) {
      logger.error('Error sending cancellation notice:', error);
      throw error;
    }
  }

  /**
   * Get conversation ID for a booking
   */
  static getBookingConversationId(bookingId) {
    return `booking_${bookingId}`;
  }

  /**
   * Check if user can access conversation
   */
  static async canUserAccessConversation(userId, conversationId) {
    try {
      if (conversationId.startsWith('booking_')) {
        const bookingId = conversationId.replace('booking_', '');
        const booking = await Booking.findById(bookingId);
        
        if (!booking) {
          return false;
        }
        
        return booking.passengerId === userId || booking.driverId === userId;
      }
      
      // For other conversation types, implement additional logic here
      return false;
    } catch (error) {
      logger.error('Error checking conversation access:', error);
      return false;
    }
  }

  /**
   * Get unread message count for user
   */
  static async getUnreadMessageCount(userId) {
    try {
      const conversations = await Message.getUserConversations(userId);
      
      let totalUnreadCount = 0;
      conversations.forEach(conv => {
        totalUnreadCount += conv.metadata.unreadCount || 0;
      });

      return totalUnreadCount;
    } catch (error) {
      logger.error('Error getting unread message count:', error);
      return 0;
    }
  }

  /**
   * Mark all messages in conversation as read
   */
  static async markConversationAsRead(conversationId, userId) {
    try {
      const messages = await Message.getConversationMessages(conversationId);
      
      const unreadMessages = messages.filter(msg => 
        msg.toUserId === userId && !msg.isRead
      );

      await Promise.all(
        unreadMessages.map(msg => msg.markAsRead())
      );

      logger.info(`Marked ${unreadMessages.length} messages as read in conversation: ${conversationId}`);
      return unreadMessages.length;
    } catch (error) {
      logger.error('Error marking conversation as read:', error);
      throw error;
    }
  }

  /**
   * Get conversation participants
   */
  static async getConversationParticipants(conversationId) {
    try {
      if (conversationId.startsWith('booking_')) {
        const bookingId = conversationId.replace('booking_', '');
        const booking = await Booking.findById(bookingId);
        
        if (!booking) {
          return [];
        }

        const [passenger, driver] = await Promise.all([
          User.findById(booking.passengerId),
          User.findById(booking.driverId)
        ]);

        return [
          {
            id: passenger?.id,
            name: passenger?.profile?.name || 'Unknown Passenger',
            avatar: passenger?.profile?.avatar || null,
            role: 'passenger'
          },
          {
            id: driver?.id,
            name: driver?.profile?.name || 'Unknown Driver',
            avatar: driver?.profile?.avatar || null,
            role: 'driver'
          }
        ].filter(p => p.id);
      }
      
      return [];
    } catch (error) {
      logger.error('Error getting conversation participants:', error);
      return [];
    }
  }

  /**
   * Handle booking lifecycle events and send appropriate messages
   */
  static async handleBookingLifecycleEvent(booking, event, eventData = {}) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      switch (event) {
        case 'booking_confirmed':
          // Send confirmation message and enable communication features
          await this.enableBookingCommunication(booking);
          await this.initializeBookingConversation(booking);
          break;
          
        case 'trip_starting_soon':
          await this.sendPickupReminder(booking, eventData.timeUntilPickup);
          break;
          
        case 'driver_arrived':
          await this.sendArrivalNotification(booking, eventData.vehicleDetails);
          break;
          
        case 'trip_started':
          await this.updateTripCommunicationPhase(booking.id, 'in_progress');
          await this.sendTripStartedNotification(booking, eventData.estimatedArrival);
          break;
          
        case 'trip_completed':
          await this.updateTripCommunicationPhase(booking.id, 'completed');
          await this.sendTripCompletedNotification(booking);
          break;
          
        case 'booking_cancelled':
          await this.sendCancellationNotice(booking, eventData.cancelledBy, eventData.reason);
          break;
          
        case 'payment_pending':
          await this.sendPaymentReminder(booking);
          break;
          
        default:
          logger.warn(`Unknown booking lifecycle event: ${event}`);
      }
      
      logger.info(`Booking lifecycle event handled: ${event} for booking: ${booking.id}`);
    } catch (error) {
      logger.error(`Error handling booking lifecycle event ${event}:`, error);
      throw error;
    }
  }

  /**
   * Get emergency contacts for user
   */
  static async getEmergencyContacts(userId) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      
      const snapshot = await contactsRef.once('value');
      const contacts = snapshot.val() || [];
      
      return Array.isArray(contacts) ? contacts : Object.values(contacts);
    } catch (error) {
      logger.error('Error getting emergency contacts:', error);
      return [];
    }
  }

  /**
   * Add emergency contact for user
   */
  static async addEmergencyContact(userId, contactData) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      
      // Get current contacts
      const snapshot = await contactsRef.once('value');
      const currentContacts = snapshot.val() || [];
      
      // Create new contact with ID
      const newContact = {
        id: Date.now().toString(),
        name: contactData.name,
        phone: contactData.phone,
        relationship: contactData.relationship,
        isPrimary: contactData.isPrimary || false,
        createdAt: new Date().toISOString()
      };
      
      // If this is set as primary, remove primary flag from others
      if (newContact.isPrimary) {
        currentContacts.forEach(contact => {
          contact.isPrimary = false;
        });
      }
      
      // Add new contact
      currentContacts.push(newContact);
      
      // Save updated contacts
      await contactsRef.set(currentContacts);
      
      logger.info(`Emergency contact added for user: ${userId}`);
      return newContact;
    } catch (error) {
      logger.error('Error adding emergency contact:', error);
      throw error;
    }
  }

  /**
   * Update emergency contact
   */
  static async updateEmergencyContact(userId, contactId, updates) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      
      // Get current contacts
      const snapshot = await contactsRef.once('value');
      const currentContacts = snapshot.val() || [];
      
      // Find and update contact
      const contactIndex = currentContacts.findIndex(contact => contact.id === contactId);
      if (contactIndex === -1) {
        throw new Error('Emergency contact not found');
      }
      
      // If setting as primary, remove primary flag from others
      if (updates.isPrimary) {
        currentContacts.forEach((contact, index) => {
          if (index !== contactIndex) {
            contact.isPrimary = false;
          }
        });
      }
      
      // Update contact
      currentContacts[contactIndex] = {
        ...currentContacts[contactIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      // Save updated contacts
      await contactsRef.set(currentContacts);
      
      logger.info(`Emergency contact updated for user: ${userId}, contact: ${contactId}`);
      return currentContacts[contactIndex];
    } catch (error) {
      logger.error('Error updating emergency contact:', error);
      throw error;
    }
  }

  /**
   * Remove emergency contact
   */
  static async removeEmergencyContact(userId, contactId) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      
      // Get current contacts
      const snapshot = await contactsRef.once('value');
      const currentContacts = snapshot.val() || [];
      
      // Filter out the contact to remove
      const updatedContacts = currentContacts.filter(contact => contact.id !== contactId);
      
      // Save updated contacts
      await contactsRef.set(updatedContacts);
      
      logger.info(`Emergency contact removed for user: ${userId}, contact: ${contactId}`);
      return true;
    } catch (error) {
      logger.error('Error removing emergency contact:', error);
      throw error;
    }
  }

  /**
   * Get messaging statistics for user
   */
  static async getMessagingStats(userId, dateRange = 30) {
    try {
      const { getFirestore } = require('../config/firebase');
      const db = getFirestore();
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      
      // Get messages sent by user
      const sentQuery = db.collection('messages')
        .where('fromUserId', '==', userId)
        .where('createdAt', '>=', startDate);
      
      // Get messages received by user
      const receivedQuery = db.collection('messages')
        .where('toUserId', '==', userId)
        .where('createdAt', '>=', startDate);
      
      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        sentQuery.get(),
        receivedQuery.get()
      ]);
      
      const stats = {
        messagesSent: sentSnapshot.size,
        messagesReceived: receivedSnapshot.size,
        totalMessages: sentSnapshot.size + receivedSnapshot.size,
        averageResponseTime: 0, // Could be calculated from message timestamps
        activeConversations: 0 // Could be calculated from unique conversation IDs
      };
      
      return stats;
    } catch (error) {
      logger.error('Error getting messaging stats:', error);
      return {
        messagesSent: 0,
        messagesReceived: 0,
        totalMessages: 0,
        averageResponseTime: 0,
        activeConversations: 0
      };
    }
  }

  /**
   * Get booking communication status
   */
  static async getBookingCommunicationStatus(bookingId) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      const [bookingCommSnapshot, tripCommSnapshot] = await Promise.all([
        realtimeDb.ref(`bookingCommunication/${bookingId}`).once('value'),
        realtimeDb.ref(`tripCommunication/${bookingId}`).once('value')
      ]);

      return {
        bookingCommunication: bookingCommSnapshot.val(),
        tripCommunication: tripCommSnapshot.val(),
        isEnabled: !!bookingCommSnapshot.val()
      };
    } catch (error) {
      logger.error('Error getting booking communication status:', error);
      return {
        bookingCommunication: null,
        tripCommunication: null,
        isEnabled: false
      };
    }
  }

  /**
   * Send emergency contact message
   */
  static async sendEmergencyMessage(booking, fromUserId, emergencyType = 'general') {
    try {
      const conversationId = `booking_${booking.id}`;
      const toUserId = fromUserId === booking.driverId ? booking.passengerId : booking.driverId;
      
      const emergencyMessages = {
        general: 'This is an emergency message. Please respond as soon as possible.',
        breakdown: 'Vehicle breakdown - I need assistance. Please contact me immediately.',
        accident: 'EMERGENCY: Accident occurred. Please call emergency services and contact me.',
        location: 'EMERGENCY: I need help with my location. Please assist.',
        late: 'I am running significantly late due to an emergency. Please contact me.'
      };

      const emergencyMessage = emergencyMessages[emergencyType] || emergencyMessages.general;

      const message = await Message.create({
        conversationId,
        fromUserId,
        toUserId,
        content: emergencyMessages[emergencyType] || emergencyMessages.general,
        type: 'text',
        metadata: {
          isEmergency: true,
          emergencyType
        }
      });

      logger.info(`Emergency message sent for booking: ${booking.id}, type: ${emergencyType}`);
      return message;
    } catch (error) {
      logger.error('Error sending emergency message:', error);
      throw error;
    }
  }

  /**
   * Archive old conversations
   */
  static async archiveOldConversations(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // This would typically be implemented with a database query
      // For now, we'll log the action
      logger.info(`Archiving conversations older than ${daysOld} days (before ${cutoffDate.toISOString()})`);
      
      // Implementation would go here to find and archive old conversations
      return true;
    } catch (error) {
      logger.error('Error archiving old conversations:', error);
      throw error;
    }
  }

  /**
   * Get emergency contacts for user
   */
  static async getEmergencyContacts(userId) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      
      const snapshot = await contactsRef.once('value');
      return snapshot.val() || [];
    } catch (error) {
      logger.error('Error getting emergency contacts:', error);
      return [];
    }
  }

  /**
   * Add emergency contact for user
   */
  static async addEmergencyContact(userId, contactData) {
    try {
      const { name, phone, relationship, isPrimary = false } = contactData;
      
      // Get current contacts
      const currentContacts = await this.getEmergencyContacts(userId);
      
      // If this is set as primary, remove primary flag from others
      if (isPrimary) {
        currentContacts.forEach(contact => {
          contact.isPrimary = false;
        });
      }
      
      // Add new contact
      const newContact = {
        id: Date.now().toString(),
        name,
        phone,
        relationship,
        isPrimary,
        createdAt: new Date().toISOString()
      };
      
      currentContacts.push(newContact);
      
      // Save to Firebase
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      await contactsRef.set(currentContacts);
      
      logger.info(`Emergency contact added for user: ${userId}`, newContact);
      return newContact;
    } catch (error) {
      logger.error('Error adding emergency contact:', error);
      throw error;
    }
  }

  /**
   * Remove emergency contact for user
   */
  static async removeEmergencyContact(userId, contactId) {
    try {
      const currentContacts = await this.getEmergencyContacts(userId);
      const updatedContacts = currentContacts.filter(contact => contact.id !== contactId);
      
      // Save to Firebase
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      await contactsRef.set(updatedContacts);
      
      logger.info(`Emergency contact removed for user: ${userId}, contactId: ${contactId}`);
      return true;
    } catch (error) {
      logger.error('Error removing emergency contact:', error);
      throw error;
    }
  }

  /**
   * Update emergency contact for user
   */
  static async updateEmergencyContact(userId, contactId, updates) {
    try {
      const currentContacts = await this.getEmergencyContacts(userId);
      const contactIndex = currentContacts.findIndex(contact => contact.id === contactId);
      
      if (contactIndex === -1) {
        throw new Error('Emergency contact not found');
      }
      
      // If setting as primary, remove primary flag from others
      if (updates.isPrimary) {
        currentContacts.forEach(contact => {
          contact.isPrimary = false;
        });
      }
      
      // Update the contact
      currentContacts[contactIndex] = {
        ...currentContacts[contactIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      // Save to Firebase
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      const contactsRef = realtimeDb.ref(`users/${userId}/emergencyContacts`);
      await contactsRef.set(currentContacts);
      
      logger.info(`Emergency contact updated for user: ${userId}, contactId: ${contactId}`);
      return currentContacts[contactIndex];
    } catch (error) {
      logger.error('Error updating emergency contact:', error);
      throw error;
    }
  }

  /**
   * Disable communication for cancelled or completed bookings
   */
  static async disableBookingCommunication(bookingId, reason = 'booking_ended') {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      // Update communication settings
      const commRef = realtimeDb.ref(`bookingCommunication/${bookingId}`);
      await commRef.update({
        status: 'disabled',
        disabledAt: new Date().toISOString(),
        disabledReason: reason
      });
      
      // Update trip communication if exists
      const tripCommRef = realtimeDb.ref(`tripCommunication/${bookingId}`);
      const tripCommSnapshot = await tripCommRef.once('value');
      if (tripCommSnapshot.exists()) {
        await tripCommRef.update({
          tripPhase: 'completed',
          disabledAt: new Date().toISOString()
        });
      }
      
      logger.info(`Booking communication disabled for booking: ${bookingId}, reason: ${reason}`);
      return true;
    } catch (error) {
      logger.error('Error disabling booking communication:', error);
      throw error;
    }
  }

  /**
   * Get booking communication status
   */
  static async getBookingCommunicationStatus(bookingId) {
    try {
      const { getDatabase } = require('../config/firebase');
      const realtimeDb = getDatabase();
      
      const [commSnapshot, tripCommSnapshot, emergencySnapshot] = await Promise.all([
        realtimeDb.ref(`bookingCommunication/${bookingId}`).once('value'),
        realtimeDb.ref(`tripCommunication/${bookingId}`).once('value'),
        realtimeDb.ref(`emergencyIntegration/${bookingId}`).once('value')
      ]);
      
      return {
        bookingCommunication: commSnapshot.val(),
        tripCommunication: tripCommSnapshot.val(),
        emergencyIntegration: emergencySnapshot.val(),
        isActive: commSnapshot.exists() && commSnapshot.val()?.status === 'active'
      };
    } catch (error) {
      logger.error('Error getting booking communication status:', error);
      return {
        bookingCommunication: null,
        tripCommunication: null,
        emergencyIntegration: null,
        isActive: false
      };
    }
  }

  /**
   * Send booking status change notification
   */
  static async sendBookingStatusChangeNotification(booking, newStatus, oldStatus) {
    try {
      const conversationId = `booking_${booking.id}`;
      let templateType = null;
      let templateData = {};
      
      // Determine appropriate template based on status change
      if (oldStatus === 'requested' && newStatus === 'confirmed') {
        templateType = 'booking_confirmed';
      } else if (newStatus === 'completed') {
        templateType = 'trip_completed';
      } else if (newStatus.includes('cancelled')) {
        templateType = 'cancellation_notice';
        templateData.reason = booking.cancellationReason || 'No reason provided';
      }
      
      if (templateType) {
        const message = await Message.createTemplate(
          templateType,
          conversationId,
          booking.driverId,
          booking.passengerId,
          templateData
        );
        
        logger.info(`Booking status change notification sent: ${booking.id}, ${oldStatus} -> ${newStatus}`);
        return message;
      }
      
      return null;
    } catch (error) {
      logger.error('Error sending booking status change notification:', error);
      throw error;
    }
  }

  /**
   * Handle booking lifecycle communication events
   */
  static async handleBookingLifecycleEvent(booking, event, eventData = {}) {
    try {
      const conversationId = `booking_${booking.id}`;
      
      switch (event) {
        case 'booking_confirmed':
          // Enable full communication features
          await this.enableBookingCommunication(booking);
          await this.setupTripCommunicationChannel(booking);
          await this.shareDriverContactInfo(booking);
          await this.enableEmergencyContactIntegration(booking);
          break;
          
        case 'trip_starting_soon':
          // Send pickup reminder
          await this.sendPickupReminder(booking, eventData.timeUntilPickup);
          break;
          
        case 'driver_arrived':
          // Send arrival notification
          await this.sendArrivalNotification(booking, eventData.vehicleDetails);
          break;
          
        case 'trip_started':
          // Update communication phase and send notification
          await this.updateTripCommunicationPhase(booking.id, 'in_progress');
          await this.sendTripStartedNotification(booking, eventData.estimatedArrival);
          break;
          
        case 'trip_completed':
          // Update communication phase and send completion notification
          await this.updateTripCommunicationPhase(booking.id, 'completed');
          await this.sendTripCompletedNotification(booking);
          // Keep communication active for post-trip coordination
          break;
          
        case 'booking_cancelled':
          // Send cancellation notice and disable communication
          await this.sendCancellationNotice(booking, eventData.cancelledBy, eventData.reason);
          await this.disableBookingCommunication(booking.id, 'booking_cancelled');
          break;
          
        case 'payment_pending':
          // Send payment reminder
          await this.sendPaymentReminder(booking);
          break;
          
        default:
          logger.warn(`Unknown booking lifecycle event: ${event}`);
      }
      
      logger.info(`Booking lifecycle event handled: ${event} for booking: ${booking.id}`);
      return true;
    } catch (error) {
      logger.error(`Error handling booking lifecycle event: ${event}`, error);
      throw error;
    }
  }

  /**
   * Get communication statistics for analytics
   */
  static async getMessagingStats(userId, dateRange = 30) {
    try {
      const conversations = await Message.getUserConversations(userId);
      
      let totalConversations = conversations.length;
      let activeConversations = 0;
      let totalMessages = 0;
      let unreadMessages = 0;

      for (const conv of conversations) {
        const stats = await Message.getConversationStats(conv.conversationId);
        totalMessages += stats.totalMessages;
        unreadMessages += stats.unreadMessages;
        
        // Consider conversation active if it has activity in the last 7 days
        const lastActivity = new Date(conv.metadata.lastActivity || 0);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        if (lastActivity > sevenDaysAgo) {
          activeConversations++;
        }
      }

      return {
        totalConversations,
        activeConversations,
        totalMessages,
        unreadMessages,
        averageMessagesPerConversation: totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0
      };
    } catch (error) {
      logger.error('Error getting messaging stats:', error);
      return {
        totalConversations: 0,
        activeConversations: 0,
        totalMessages: 0,
        unreadMessages: 0,
        averageMessagesPerConversation: 0
      };
    }
  }
}

module.exports = MessagingService;