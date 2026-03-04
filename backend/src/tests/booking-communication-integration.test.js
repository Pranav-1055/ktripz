const request = require('supertest');
const app = require('../server');
const { initializeFirebase } = require('../config/firebase');
const MessagingService = require('../services/messagingService');

describe('Booking Communication Integration', () => {
  let authToken;
  let testBookingId;
  let testUserId = 'test-user-123';
  let testDriverId = 'test-driver-456';

  beforeAll(async () => {
    // Initialize Firebase for testing
    await initializeFirebase();
    
    // Mock authentication token
    authToken = 'mock-auth-token';
  });

  beforeEach(() => {
    // Create a mock booking for testing
    testBookingId = 'test-booking-' + Date.now();
  });

  describe('POST /api/communication/booking/:bookingId/enable', () => {
    it('should enable communication features for confirmed booking', async () => {
      // Mock booking data
      const mockBooking = {
        id: testBookingId,
        passengerId: testUserId,
        driverId: testDriverId,
        status: 'confirmed',
        rideId: 'test-ride-123'
      };

      // Mock MessagingService methods
      jest.spyOn(MessagingService, 'enableBookingCommunication').mockResolvedValue({
        bookingId: testBookingId,
        conversationId: `booking_${testBookingId}`,
        participants: [testUserId, testDriverId],
        status: 'active',
        features: {
          messaging: true,
          locationSharing: true,
          emergencyContact: true,
          callsEnabled: true,
          photoSharing: true,
          contactInfoShared: true
        }
      });

      const response = await request(app)
        .post(`/api/communication/booking/${testBookingId}/enable`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.features.messaging).toBe(true);
      expect(response.body.data.features.emergencyContact).toBe(true);
    });

    it('should return error for non-confirmed booking', async () => {
      const response = await request(app)
        .post(`/api/communication/booking/${testBookingId}/enable`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('confirmed bookings');
    });
  });

  describe('POST /api/communication/booking/:bookingId/setup-trip-channel', () => {
    it('should setup trip-specific communication channel', async () => {
      // Mock MessagingService method
      jest.spyOn(MessagingService, 'setupTripCommunicationChannel').mockResolvedValue({
        bookingId: testBookingId,
        conversationId: `booking_${testBookingId}`,
        participants: [testUserId, testDriverId],
        features: {
          messaging: true,
          locationSharing: true,
          emergencyContact: true,
          callsEnabled: true,
          photoSharing: true
        },
        tripPhase: 'pre_trip',
        emergencyContactsEnabled: true
      });

      const response = await request(app)
        .post(`/api/communication/booking/${testBookingId}/setup-trip-channel`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tripPhase).toBe('pre_trip');
      expect(response.body.data.emergencyContactsEnabled).toBe(true);
    });
  });

  describe('POST /api/messages/booking/:bookingId/lifecycle-message', () => {
    it('should handle booking confirmation lifecycle event', async () => {
      // Mock MessagingService method
      jest.spyOn(MessagingService, 'handleBookingLifecycleEvent').mockResolvedValue(true);

      const response = await request(app)
        .post(`/api/messages/booking/${testBookingId}/lifecycle-message`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event: 'booking_confirmed',
          eventData: {}
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.event).toBe('booking_confirmed');
    });

    it('should handle trip started lifecycle event', async () => {
      jest.spyOn(MessagingService, 'handleBookingLifecycleEvent').mockResolvedValue(true);

      const response = await request(app)
        .post(`/api/messages/booking/${testBookingId}/lifecycle-message`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event: 'trip_started',
          eventData: {
            estimatedArrival: '2 hours'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.event).toBe('trip_started');
    });

    it('should reject invalid lifecycle events', async () => {
      const response = await request(app)
        .post(`/api/messages/booking/${testBookingId}/lifecycle-message`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event: 'invalid_event',
          eventData: {}
        })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_EVENT');
    });
  });

  describe('POST /api/messages/booking/:bookingId/emergency-contact-alert', () => {
    it('should send emergency alert to emergency contacts', async () => {
      // Mock MessagingService methods
      jest.spyOn(MessagingService, 'sendEmergencyAlert').mockResolvedValue({
        bookingId: testBookingId,
        alertType: 'trip_emergency',
        contactsAlerted: 2,
        sentAt: new Date().toISOString()
      });

      jest.spyOn(MessagingService, 'sendEmergencyMessage').mockResolvedValue({
        id: 'msg-123',
        content: '🚨 EMERGENCY: This is an emergency message.',
        type: 'text'
      });

      const response = await request(app)
        .post(`/api/messages/booking/${testBookingId}/emergency-contact-alert`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          alertType: 'trip_emergency',
          alertPassengerContacts: true,
          alertDriverContacts: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.alertType).toBe('trip_emergency');
      expect(response.body.data.contactsAlerted).toBe(2);
    });

    it('should reject invalid alert types', async () => {
      const response = await request(app)
        .post(`/api/messages/booking/${testBookingId}/emergency-contact-alert`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          alertType: 'invalid_alert',
          alertPassengerContacts: true
        })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ALERT_TYPE');
    });
  });

  describe('GET /api/messages/booking/:bookingId/communication-features', () => {
    it('should return available communication features for booking', async () => {
      // Mock MessagingService methods
      jest.spyOn(MessagingService, 'getBookingCommunicationStatus').mockResolvedValue({
        bookingCommunication: {
          status: 'active',
          features: {
            messaging: true,
            locationSharing: true,
            emergencyContact: true
          }
        },
        isEnabled: true
      });

      jest.spyOn(MessagingService, 'getTripCommunicationStatus').mockResolvedValue({
        tripCommunication: {
          tripPhase: 'pre_trip',
          emergencyContactsEnabled: true
        },
        isActive: true
      });

      jest.spyOn(MessagingService, 'getCommunicationPreferences').mockResolvedValue({
        allowCalls: true,
        allowMessages: true,
        allowLocationSharing: true,
        allowEmergencyContact: true
      });

      const response = await request(app)
        .get(`/api/messages/booking/${testBookingId}/communication-features`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.availableFeatures.messaging).toBe(true);
      expect(response.body.data.availableFeatures.emergencyContact).toBe(true);
      expect(response.body.data.tripSpecificChannel).toBe(true);
    });
  });

  describe('Communication Preferences Management', () => {
    describe('GET /api/communication/preferences', () => {
      it('should return user communication preferences', async () => {
        jest.spyOn(MessagingService, 'getCommunicationPreferences').mockResolvedValue({
          allowCalls: true,
          allowMessages: true,
          allowLocationSharing: true,
          allowEmergencyContact: true,
          autoResponseEnabled: false,
          quietHours: {
            enabled: false,
            start: '22:00',
            end: '07:00'
          }
        });

        const response = await request(app)
          .get('/api/communication/preferences')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.allowMessages).toBe(true);
        expect(response.body.data.allowEmergencyContact).toBe(true);
      });
    });

    describe('PUT /api/communication/preferences', () => {
      it('should update user communication preferences', async () => {
        const updatedPreferences = {
          allowCalls: false,
          allowMessages: true,
          allowLocationSharing: true,
          allowEmergencyContact: true,
          autoResponseEnabled: true,
          autoResponseMessage: 'I will respond soon!',
          quietHours: {
            enabled: true,
            start: '23:00',
            end: '06:00'
          }
        };

        jest.spyOn(MessagingService, 'updateCommunicationPreferences').mockResolvedValue(updatedPreferences);

        const response = await request(app)
          .put('/api/communication/preferences')
          .set('Authorization', `Bearer ${authToken}`)
          .send(updatedPreferences)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.allowCalls).toBe(false);
        expect(response.body.data.autoResponseEnabled).toBe(true);
        expect(response.body.data.quietHours.enabled).toBe(true);
      });
    });
  });

  describe('Emergency Contacts Management', () => {
    describe('POST /api/communication/emergency-contacts', () => {
      it('should add emergency contact', async () => {
        const newContact = {
          name: 'John Doe',
          phone: '+1234567890',
          relationship: 'Family',
          isPrimary: true
        };

        jest.spyOn(MessagingService, 'addEmergencyContact').mockResolvedValue({
          id: 'contact-123',
          ...newContact,
          createdAt: new Date().toISOString()
        });

        const response = await request(app)
          .post('/api/communication/emergency-contacts')
          .set('Authorization', `Bearer ${authToken}`)
          .send(newContact)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('John Doe');
        expect(response.body.data.isPrimary).toBe(true);
      });
    });

    describe('GET /api/communication/emergency-contacts', () => {
      it('should return user emergency contacts', async () => {
        const mockContacts = [
          {
            id: 'contact-1',
            name: 'John Doe',
            phone: '+1234567890',
            relationship: 'Family',
            isPrimary: true
          },
          {
            id: 'contact-2',
            name: 'Jane Smith',
            phone: '+0987654321',
            relationship: 'Friend',
            isPrimary: false
          }
        ];

        jest.spyOn(MessagingService, 'getEmergencyContacts').mockResolvedValue(mockContacts);

        const response = await request(app)
          .get('/api/communication/emergency-contacts')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0].isPrimary).toBe(true);
      });
    });
  });

  afterEach(() => {
    // Clean up mocks
    jest.restoreAllMocks();
  });
});