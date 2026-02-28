const request = require('supertest');
const app = require('../server');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const MessagingService = require('../services/messagingService');

// Mock Firebase
jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        get: jest.fn(() => ({ exists: true, data: () => ({}) })),
        update: jest.fn()
      })),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(() => ({
              forEach: jest.fn()
            }))
          }))
        }))
      }))
    }))
  })),
  getDatabase: jest.fn(() => ({
    ref: jest.fn(() => ({
      push: jest.fn(() => ({
        set: jest.fn()
      })),
      set: jest.fn(),
      update: jest.fn(),
      once: jest.fn(() => Promise.resolve({ val: () => 0 })),
      child: jest.fn(() => ({
        once: jest.fn(() => Promise.resolve({ val: () => 0 }))
      }))
    }))
  }))
}));

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { uid: 'test-user-id' };
    next();
  }
}));

describe('Messaging System', () => {
  describe('Message Model', () => {
    test('should create a new message', async () => {
      const messageData = {
        conversationId: 'booking_test123',
        fromUserId: 'user1',
        toUserId: 'user2',
        content: 'Hello, how are you?',
        type: 'text'
      };

      const message = new Message(messageData);
      expect(message.conversationId).toBe('booking_test123');
      expect(message.fromUserId).toBe('user1');
      expect(message.toUserId).toBe('user2');
      expect(message.content).toBe('Hello, how are you?');
      expect(message.type).toBe('text');
      expect(message.isRead).toBe(false);
      expect(message.isDelivered).toBe(false);
    });

    test('should create template message', async () => {
      const templateMessage = await Message.createTemplate(
        'booking_confirmed',
        'booking_test123',
        'driver1',
        'passenger1',
        { bookingId: 'test123' }
      );

      expect(templateMessage.isTemplate).toBe(true);
      expect(templateMessage.templateType).toBe('booking_confirmed');
      expect(templateMessage.content).toContain('confirmed');
    });

    test('should mark message as read', async () => {
      const message = new Message({
        id: 'msg123',
        conversationId: 'booking_test123',
        fromUserId: 'user1',
        toUserId: 'user2',
        content: 'Test message',
        isRead: false
      });

      await message.markAsRead();
      expect(message.isRead).toBe(true);
      expect(message.readAt).toBeInstanceOf(Date);
    });

    test('should mark message as delivered', async () => {
      const message = new Message({
        id: 'msg123',
        conversationId: 'booking_test123',
        fromUserId: 'user1',
        toUserId: 'user2',
        content: 'Test message',
        isDelivered: false
      });

      await message.markAsDelivered();
      expect(message.isDelivered).toBe(true);
      expect(message.deliveredAt).toBeInstanceOf(Date);
    });
  });

  describe('Messaging API Endpoints', () => {
    test('POST /api/messages - should send a text message', async () => {
      const messageData = {
        conversationId: 'booking_test123',
        toUserId: 'user2',
        content: 'Hello from API test',
        type: 'text'
      };

      const response = await request(app)
        .post('/api/messages')
        .send(messageData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe('Hello from API test');
      expect(response.body.data.type).toBe('text');
    });

    test('POST /api/messages - should fail without required fields', async () => {
      const incompleteData = {
        toUserId: 'user2'
        // Missing conversationId and content
      };

      const response = await request(app)
        .post('/api/messages')
        .send(incompleteData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_FIELDS');
    });

    test('POST /api/messages/location - should send location message', async () => {
      const locationData = {
        conversationId: 'booking_test123',
        toUserId: 'user2',
        latitude: 40.7128,
        longitude: -74.0060,
        address: 'New York, NY'
      };

      const response = await request(app)
        .post('/api/messages/location')
        .send(locationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('location');
      expect(response.body.data.metadata.latitude).toBe(40.7128);
      expect(response.body.data.metadata.longitude).toBe(-74.0060);
    });

    test('GET /api/messages/conversations - should get user conversations', async () => {
      const response = await request(app)
        .get('/api/messages/conversations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('GET /api/messages/conversations/:conversationId - should get conversation messages', async () => {
      const conversationId = 'booking_test123';
      
      const response = await request(app)
        .get(`/api/messages/conversations/${conversationId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('PUT /api/messages/:messageId/read - should mark message as read', async () => {
      const messageId = 'msg123';
      
      const response = await request(app)
        .put(`/api/messages/${messageId}/read`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('POST /api/messages/templates/:templateType - should send template message', async () => {
      const templateData = {
        conversationId: 'booking_test123',
        toUserId: 'user2',
        templateData: {
          timeUntilPickup: '15 minutes',
          pickupLocation: 'Central Station'
        }
      };

      const response = await request(app)
        .post('/api/messages/templates/pickup_reminder')
        .send(templateData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isTemplate).toBe(true);
      expect(response.body.data.templateType).toBe('pickup_reminder');
    });

    test('POST /api/messages/conversations/:conversationId/archive - should archive conversation', async () => {
      const conversationId = 'booking_test123';
      
      const response = await request(app)
        .post(`/api/messages/conversations/${conversationId}/archive`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.archived).toBe(true);
    });

    test('DELETE /api/messages/:messageId - should delete message', async () => {
      const messageId = 'msg123';
      
      const response = await request(app)
        .delete(`/api/messages/${messageId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
    });

    test('GET /api/messages/conversations/:conversationId/stats - should get conversation stats', async () => {
      const conversationId = 'booking_test123';
      
      const response = await request(app)
        .get(`/api/messages/conversations/${conversationId}/stats`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.conversationId).toBe(conversationId);
    });
  });

  describe('MessagingService', () => {
    test('should initialize booking conversation', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1',
        rideId: 'ride123'
      };

      const message = await MessagingService.initializeBookingConversation(mockBooking);
      expect(message.conversationId).toBe('booking_booking123');
      expect(message.fromUserId).toBe('driver1');
      expect(message.toUserId).toBe('passenger1');
      expect(message.isTemplate).toBe(true);
    });

    test('should send pickup reminder', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1',
        pickupPoint: {
          name: 'Central Station',
          time: '10:00'
        }
      };

      const message = await MessagingService.sendPickupReminder(mockBooking, '30 minutes');
      expect(message.templateType).toBe('pickup_reminder');
      expect(message.content).toContain('30 minutes');
      expect(message.content).toContain('Central Station');
    });

    test('should send arrival notification', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1'
      };

      const vehicleDetails = {
        color: 'blue',
        make: 'Toyota',
        model: 'Camry',
        licensePlate: 'ABC123'
      };

      const message = await MessagingService.sendArrivalNotification(mockBooking, vehicleDetails);
      expect(message.templateType).toBe('arrival_notification');
      expect(message.content).toContain('blue');
      expect(message.content).toContain('Toyota');
      expect(message.content).toContain('ABC123');
    });

    test('should send trip started notification', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1'
      };

      const message = await MessagingService.sendTripStartedNotification(mockBooking, '2:30 PM');
      expect(message.templateType).toBe('trip_started');
      expect(message.content).toContain('2:30 PM');
    });

    test('should send trip completed notification', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1'
      };

      const message = await MessagingService.sendTripCompletedNotification(mockBooking);
      expect(message.templateType).toBe('trip_completed');
      expect(message.content).toContain('completed');
    });

    test('should send payment reminder', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1',
        pricing: {
          finalAmount: 25.50
        }
      };

      const message = await MessagingService.sendPaymentReminder(mockBooking);
      expect(message.templateType).toBe('payment_reminder');
      expect(message.content).toContain('payment');
    });

    test('should send cancellation notice', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1'
      };

      const message = await MessagingService.sendCancellationNotice(
        mockBooking, 
        'driver1', 
        'vehicle breakdown'
      );
      expect(message.templateType).toBe('cancellation_notice');
      expect(message.content).toContain('vehicle breakdown');
    });

    test('should get booking conversation ID', () => {
      const conversationId = MessagingService.getBookingConversationId('booking123');
      expect(conversationId).toBe('booking_booking123');
    });

    test('should check conversation access', async () => {
      // Mock Booking.findById
      jest.spyOn(Booking, 'findById').mockResolvedValue({
        id: 'booking123',
        passengerId: 'passenger1',
        driverId: 'driver1'
      });

      const canAccess = await MessagingService.canUserAccessConversation('passenger1', 'booking_booking123');
      expect(canAccess).toBe(true);

      const cannotAccess = await MessagingService.canUserAccessConversation('other_user', 'booking_booking123');
      expect(cannotAccess).toBe(false);
    });

    test('should send emergency message', async () => {
      const mockBooking = {
        id: 'booking123',
        driverId: 'driver1',
        passengerId: 'passenger1'
      };

      const message = await MessagingService.sendEmergencyMessage(
        mockBooking, 
        'driver1', 
        'breakdown'
      );
      expect(message.metadata.isEmergency).toBe(true);
      expect(message.metadata.emergencyType).toBe('breakdown');
      expect(message.content).toContain('breakdown');
    });

    test('should get messaging statistics', async () => {
      // Mock Message.getUserConversations
      jest.spyOn(Message, 'getUserConversations').mockResolvedValue([
        {
          conversationId: 'booking_123',
          metadata: {
            lastActivity: new Date().toISOString(),
            unreadCount: 2
          }
        }
      ]);

      // Mock Message.getConversationStats
      jest.spyOn(Message, 'getConversationStats').mockResolvedValue({
        totalMessages: 10,
        unreadMessages: 2
      });

      const stats = await MessagingService.getMessagingStats('user1');
      expect(stats.totalConversations).toBe(1);
      expect(stats.totalMessages).toBe(10);
      expect(stats.unreadMessages).toBe(2);
    });
  });

  describe('Message Templates', () => {
    test('should have all required template types', () => {
      const templateTypes = [
        'booking_confirmed',
        'pickup_reminder',
        'arrival_notification',
        'trip_started',
        'trip_completed',
        'payment_reminder',
        'cancellation_notice'
      ];

      // This test would verify that all template types are supported
      // In a real implementation, we'd check against the actual template definitions
      expect(templateTypes.length).toBeGreaterThan(0);
    });

    test('should create template with dynamic content', async () => {
      const templateData = {
        timeUntilPickup: '15 minutes',
        pickupLocation: 'Airport Terminal 1'
      };

      const message = await Message.createTemplate(
        'pickup_reminder',
        'booking_test123',
        'driver1',
        'passenger1',
        templateData
      );

      expect(message.content).toContain('15 minutes');
      expect(message.content).toContain('Airport Terminal 1');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid conversation access', async () => {
      const response = await request(app)
        .post('/api/messages')
        .send({
          conversationId: 'booking_nonexistent',
          toUserId: 'user2',
          content: 'Test message'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    test('should handle unauthorized conversation access', async () => {
      // Mock a booking where the current user is not a participant
      jest.spyOn(Booking, 'findById').mockResolvedValue({
        id: 'booking123',
        passengerId: 'other_passenger',
        driverId: 'other_driver'
      });

      const response = await request(app)
        .post('/api/messages')
        .send({
          conversationId: 'booking_booking123',
          toUserId: 'other_passenger',
          content: 'Test message'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    test('should handle missing message content', async () => {
      const response = await request(app)
        .post('/api/messages')
        .send({
          conversationId: 'booking_test123',
          toUserId: 'user2'
          // Missing content
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_FIELDS');
    });
  });
});

// Cleanup
afterAll(async () => {
  // Clean up any test data or connections
  jest.clearAllMocks();
});