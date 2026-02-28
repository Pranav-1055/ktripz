const request = require('supertest');
const admin = require('firebase-admin');
const app = require('../server');
const MessagingService = require('../services/messagingService');

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  auth: () => ({
    verifyIdToken: jest.fn()
  }),
  database: () => ({
    ref: jest.fn(() => ({
      once: jest.fn(),
      push: jest.fn(() => ({
        key: 'mock-key',
        set: jest.fn()
      })),
      set: jest.fn(),
      update: jest.fn(),
      child: jest.fn(() => ({
        remove: jest.fn()
      }))
    }))
  })
}));

// Mock MessagingService
jest.mock('../services/messagingService');

describe('Communication Integration with Booking Flow', () => {
  let mockToken;
  let mockUser;
  let mockBooking;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUser = {
      uid: 'test-user-123',
      email: 'test@example.com'
    };

    mockBooking = {
      id: 'booking-123',
      rideId: 'ride-123',
      passengerId: 'passenger-123',
      driverId: 'driver-123',
      status: 'confirmed',
      seatsBooked: 2,
      pricing: {
        finalAmount: 50
      }
    };

    mockToken = 'mock-firebase-token';

    // Mock Firebase auth verification
    admin.auth().verifyIdToken.mockResolvedValue(mockUser);

    // Mock Firebase database operations
    const mockRef = {
      once: jest.fn().mockResolvedValue({
        exists: () => true,
        val: () => mockBooking
      }),
      set: jest.fn().mockResolvedValue(),
      update: jest.fn().mockResolvedValue(),
      push: jest.fn(() => ({
        key: 'mock-key',
        set: jest.fn().mockResolvedValue()
      })),
      child: jest.fn(() => ({
        remove: jest.fn().mockResolvedValue()
      }))
    };

    admin.database().ref.mockReturnValue(mockRef);
  });

  describe('POST /api/bookings/:id/emergency', () => {
    it('should send emergency message successfully', async () => {
      MessagingService.sendEmergencyMessage.mockResolvedValue({
        id: 'message-123',
        content: 'Emergency message',
        type: 'text'
      });

      const response = await request(app)
        .post('/api/bookings/booking-123/emergency')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          emergencyType: 'breakdown'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(MessagingService.sendEmergencyMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'booking-123' }),
        mockUser.uid,
        'breakdown'
      );
    });

    it('should send custom emergency message', async () => {
      MessagingService.sendCustomEmergencyMessage.mockResolvedValue({
        id: 'message-123',
        content: 'Custom emergency message',
        type: 'text'
      });

      const response = await request(app)
        .post('/api/bookings/booking-123/emergency')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          emergencyType: 'general',
          customMessage: 'Car broke down, need help'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(MessagingService.sendCustomEmergencyMessage).toHaveBeenCalled();
    });

    it('should reject emergency message for inactive booking', async () => {
      const inactiveBooking = { ...mockBooking, status: 'completed' };
      admin.database().ref().once.mockResolvedValue({
        exists: () => true,
        val: () => inactiveBooking
      });

      const response = await request(app)
        .post('/api/bookings/booking-123/emergency')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          emergencyType: 'breakdown'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Emergency messages can only be sent for active bookings');
    });
  });

  describe('GET /api/bookings/:id/communication', () => {
    it('should get communication details for booking', async () => {
      const mockUserData = {
        fullName: 'John Doe',
        phone: '+1234567890',
        preferences: {
          allowCalls: true,
          allowMessages: true
        },
        stats: {
          averageResponseTime: '15 minutes'
        }
      };

      // Mock user data fetch
      admin.database().ref().once
        .mockResolvedValueOnce({
          exists: () => true,
          val: () => mockBooking
        })
        .mockResolvedValueOnce({
          exists: () => true,
          val: () => mockUserData
        });

      MessagingService.getMessagingStats.mockResolvedValue({
        totalConversations: 5,
        activeConversations: 2,
        totalMessages: 50,
        unreadMessages: 3
      });

      const response = await request(app)
        .get('/api/bookings/booking-123/communication')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('conversationId', 'booking_booking-123');
      expect(response.body.data).toHaveProperty('canCommunicate', true);
      expect(response.body.data).toHaveProperty('emergencyContact');
      expect(response.body.data.emergencyContact).toHaveProperty('name', 'John Doe');
      expect(response.body.data.emergencyContact).toHaveProperty('phone', '+1234567890');
    });

    it('should deny access for unauthorized user', async () => {
      const unauthorizedUser = { uid: 'unauthorized-user' };
      admin.auth().verifyIdToken.mockResolvedValue(unauthorizedUser);

      const response = await request(app)
        .get('/api/bookings/booking-123/communication')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('PUT /api/bookings/:id/trip-status', () => {
    beforeEach(() => {
      // Mock user as driver
      mockUser.uid = mockBooking.driverId;
      admin.auth().verifyIdToken.mockResolvedValue(mockUser);
    });

    it('should update trip status to started with communication', async () => {
      MessagingService.sendTripStartedNotification.mockResolvedValue({
        id: 'message-123',
        content: 'Trip started',
        type: 'text'
      });

      const response = await request(app)
        .put('/api/bookings/booking-123/trip-status')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          status: 'started',
          estimatedArrival: '2:30 PM',
          message: 'On our way!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(MessagingService.sendTripStartedNotification).toHaveBeenCalled();
      expect(MessagingService.sendCustomMessage).toHaveBeenCalledWith(
        'booking_booking-123',
        mockUser.uid,
        mockBooking.passengerId,
        'On our way!'
      );
    });

    it('should update trip status to completed', async () => {
      MessagingService.sendTripCompletedNotification.mockResolvedValue({
        id: 'message-123',
        content: 'Trip completed',
        type: 'text'
      });

      const response = await request(app)
        .put('/api/bookings/booking-123/trip-status')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          status: 'completed'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(MessagingService.sendTripCompletedNotification).toHaveBeenCalled();
    });

    it('should reject trip status update from passenger', async () => {
      // Mock user as passenger
      mockUser.uid = mockBooking.passengerId;
      admin.auth().verifyIdToken.mockResolvedValue(mockUser);

      const response = await request(app)
        .put('/api/bookings/booking-123/trip-status')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          status: 'started'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Only the driver can update trip status');
    });
  });

  describe('POST /api/bookings/:id/share-location', () => {
    it('should share location successfully', async () => {
      MessagingService.sendLocationMessage.mockResolvedValue({
        id: 'message-123',
        content: 'Location shared',
        type: 'location'
      });

      const response = await request(app)
        .post('/api/bookings/booking-123/share-location')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          address: 'New York, NY',
          message: 'I am here'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(MessagingService.sendLocationMessage).toHaveBeenCalledWith(
        'booking_booking-123',
        mockUser.uid,
        expect.any(String),
        {
          latitude: 40.7128,
          longitude: -74.0060,
          address: 'New York, NY',
          message: 'I am here'
        }
      );
    });

    it('should validate location coordinates', async () => {
      const response = await request(app)
        .post('/api/bookings/booking-123/share-location')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          latitude: 'invalid',
          longitude: -74.0060
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Communication Preferences', () => {
    describe('GET /api/communication/preferences', () => {
      it('should get user communication preferences', async () => {
        const mockPreferences = {
          allowCalls: true,
          allowMessages: true,
          allowLocationSharing: true,
          autoResponseEnabled: false
        };

        admin.database().ref().once.mockResolvedValue({
          val: () => mockPreferences
        });

        const response = await request(app)
          .get('/api/communication/preferences')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockPreferences);
      });

      it('should initialize default preferences if none exist', async () => {
        admin.database().ref().once.mockResolvedValue({
          val: () => null
        });

        MessagingService.initializeCommunicationPreferences.mockResolvedValue({
          allowCalls: true,
          allowMessages: true,
          allowLocationSharing: true,
          autoResponseEnabled: false
        });

        const response = await request(app)
          .get('/api/communication/preferences')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(MessagingService.initializeCommunicationPreferences).toHaveBeenCalled();
      });
    });

    describe('PUT /api/communication/preferences', () => {
      it('should update communication preferences', async () => {
        const currentPreferences = {
          allowCalls: true,
          allowMessages: true,
          allowLocationSharing: true
        };

        const updates = {
          allowCalls: false,
          autoResponseEnabled: true,
          autoResponseMessage: 'I will respond soon!'
        };

        admin.database().ref().once.mockResolvedValue({
          val: () => currentPreferences
        });

        MessagingService.updateCommunicationPreferences.mockResolvedValue({
          ...currentPreferences,
          ...updates
        });

        const response = await request(app)
          .put('/api/communication/preferences')
          .set('Authorization', `Bearer ${mockToken}`)
          .send(updates);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject(updates);
        expect(MessagingService.updateCommunicationPreferences).toHaveBeenCalled();
      });
    });
  });

  describe('Emergency Contacts', () => {
    describe('POST /api/communication/emergency-contacts', () => {
      it('should add emergency contact', async () => {
        admin.database().ref().once.mockResolvedValue({
          val: () => []
        });

        const contactData = {
          name: 'John Emergency',
          phone: '+1234567890',
          relationship: 'Brother',
          isPrimary: true
        };

        const response = await request(app)
          .post('/api/communication/emergency-contacts')
          .set('Authorization', `Bearer ${mockToken}`)
          .send(contactData);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject(contactData);
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/communication/emergency-contacts')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            name: 'John Emergency'
            // Missing phone and relationship
          });

        expect(response.status).toBe(400);
        expect(response.body.errors).toBeDefined();
      });
    });
  });
});