const NotificationService = require('../services/notificationService');
const NotificationPreferencesService = require('../services/notificationPreferencesService');
const RealtimeService = require('../services/realtimeService');

// Mock external dependencies
jest.mock('twilio');
jest.mock('@sendgrid/mail');
jest.mock('firebase-admin');
jest.mock('../services/realtimeService');

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendSMS', () => {
    it('should send SMS successfully', async () => {
      const mockTwilioClient = {
        messages: {
          create: jest.fn().mockResolvedValue({
            sid: 'test-message-sid',
            status: 'sent',
          }),
        },
      };

      // Mock Twilio client
      NotificationService.twilioClient = mockTwilioClient;

      const result = await NotificationService.sendSMS('+1234567890', 'Test message');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-sid');
      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        body: 'Test message',
        from: process.env.TWILIO_PHONE_NUMBER,
        to: '+1234567890',
      });
    });

    it('should handle SMS sending failure', async () => {
      const mockTwilioClient = {
        messages: {
          create: jest.fn().mockRejectedValue(new Error('Twilio error')),
        },
      };

      NotificationService.twilioClient = mockTwilioClient;

      const result = await NotificationService.sendSMS('+1234567890', 'Test message');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Twilio error');
    });

    it('should format phone number correctly', async () => {
      const mockTwilioClient = {
        messages: {
          create: jest.fn().mockResolvedValue({
            sid: 'test-message-sid',
            status: 'sent',
          }),
        },
      };

      NotificationService.twilioClient = mockTwilioClient;

      await NotificationService.sendSMS('1234567890', 'Test message');

      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        body: 'Test message',
        from: process.env.TWILIO_PHONE_NUMBER,
        to: '+1234567890',
      });
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const mockSendGrid = {
        send: jest.fn().mockResolvedValue([{
          headers: { 'x-message-id': 'test-email-id' },
        }]),
      };

      // Mock SendGrid
      require('@sendgrid/mail').send = mockSendGrid.send;
      NotificationService.sendGridInitialized = true;

      const result = await NotificationService.sendEmail(
        'test@example.com',
        'Test Subject',
        '<p>Test HTML</p>',
        'Test Text'
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-email-id');
      expect(mockSendGrid.send).toHaveBeenCalled();
    });

    it('should handle email sending failure', async () => {
      const mockSendGrid = {
        send: jest.fn().mockRejectedValue(new Error('SendGrid error')),
      };

      require('@sendgrid/mail').send = mockSendGrid.send;
      NotificationService.sendGridInitialized = true;

      const result = await NotificationService.sendEmail(
        'test@example.com',
        'Test Subject',
        '<p>Test HTML</p>'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('SendGrid error');
    });
  });

  describe('sendPushNotification', () => {
    it('should send push notification to single token', async () => {
      const mockMessaging = {
        send: jest.fn().mockResolvedValue('test-message-id'),
      };

      const mockAdmin = {
        messaging: jest.fn().mockReturnValue(mockMessaging),
      };

      require('firebase-admin').messaging = mockAdmin.messaging;
      NotificationService.fcmInitialized = true;

      const result = await NotificationService.sendPushNotification(
        'test-token',
        { title: 'Test Title', body: 'Test Body' },
        { key: 'value' }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(mockMessaging.send).toHaveBeenCalled();
    });

    it('should send push notification to multiple tokens', async () => {
      const mockMessaging = {
        sendMulticast: jest.fn().mockResolvedValue({
          successCount: 2,
          failureCount: 0,
          responses: [{ success: true }, { success: true }],
        }),
      };

      const mockAdmin = {
        messaging: jest.fn().mockReturnValue(mockMessaging),
      };

      require('firebase-admin').messaging = mockAdmin.messaging;
      NotificationService.fcmInitialized = true;

      const result = await NotificationService.sendPushNotification(
        ['token1', 'token2'],
        { title: 'Test Title', body: 'Test Body' }
      );

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('sendComprehensiveNotification', () => {
    it('should send notifications through all enabled channels', async () => {
      // Mock all services
      NotificationService.twilioClient = {
        messages: {
          create: jest.fn().mockResolvedValue({ sid: 'sms-id', status: 'sent' }),
        },
      };
      NotificationService.sendGridInitialized = true;
      NotificationService.fcmInitialized = true;

      require('@sendgrid/mail').send = jest.fn().mockResolvedValue([{
        headers: { 'x-message-id': 'email-id' },
      }]);

      require('firebase-admin').messaging = jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue('push-id'),
      });

      RealtimeService.emitUserNotification = jest.fn();

      const notificationData = {
        type: 'test',
        title: 'Test Notification',
        message: 'Test message',
      };

      const userPreferences = {
        sms: true,
        email: true,
        push: true,
      };

      const userContact = {
        phoneNumber: '+1234567890',
        email: 'test@example.com',
        fcmToken: 'test-token',
      };

      const result = await NotificationService.sendComprehensiveNotification(
        'test-user-id',
        notificationData,
        userPreferences,
        userContact
      );

      expect(result.realtime).toBe(true);
      expect(result.sms).toBe(true);
      expect(result.email).toBe(true);
      expect(result.push).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle partial failures gracefully', async () => {
      // Mock services with some failures
      NotificationService.twilioClient = {
        messages: {
          create: jest.fn().mockRejectedValue(new Error('SMS failed')),
        },
      };
      NotificationService.sendGridInitialized = true;
      NotificationService.fcmInitialized = true;

      require('@sendgrid/mail').send = jest.fn().mockResolvedValue([{
        headers: { 'x-message-id': 'email-id' },
      }]);

      require('firebase-admin').messaging = jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue('push-id'),
      });

      RealtimeService.emitUserNotification = jest.fn();

      const result = await NotificationService.sendComprehensiveNotification(
        'test-user-id',
        { type: 'test', title: 'Test', message: 'Test' },
        { sms: true, email: true, push: true },
        {
          phoneNumber: '+1234567890',
          email: 'test@example.com',
          fcmToken: 'test-token',
        }
      );

      expect(result.realtime).toBe(true);
      expect(result.sms).toBe(false);
      expect(result.email).toBe(true);
      expect(result.push).toBe(true);
      expect(result.errors).toContain('SMS: SMS failed');
    });
  });

  describe('formatSMSMessage', () => {
    it('should format SMS message correctly', () => {
      const notificationData = {
        title: 'Test Title',
        message: 'Test message content',
      };

      const formatted = NotificationService.formatSMSMessage(notificationData);
      expect(formatted).toBe('TripO: Test Title - Test message content');
    });
  });

  describe('formatEmailHTML', () => {
    it('should format HTML email correctly', () => {
      const notificationData = {
        title: 'Test Title',
        message: 'Test message content',
      };

      const html = NotificationService.formatEmailHTML(notificationData);
      expect(html).toContain('Test Title');
      expect(html).toContain('Test message content');
      expect(html).toContain('TripO');
    });

    it('should include action URL if provided', () => {
      const notificationData = {
        title: 'Test Title',
        message: 'Test message content',
        data: {
          actionUrl: 'https://example.com/action',
        },
      };

      const html = NotificationService.formatEmailHTML(notificationData);
      expect(html).toContain('https://example.com/action');
      expect(html).toContain('View Details');
    });
  });

  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      const html = '<p>This is <strong>bold</strong> text</p>';
      const stripped = NotificationService.stripHtml(html);
      expect(stripped).toBe('This is bold text');
    });

    it('should handle multiple spaces', () => {
      const html = '<p>Text   with    spaces</p>';
      const stripped = NotificationService.stripHtml(html);
      expect(stripped).toBe('Text with spaces');
    });
  });

  describe('getServiceStatus', () => {
    it('should return correct service status', () => {
      NotificationService.twilioClient = { test: true };
      NotificationService.sendGridInitialized = true;
      NotificationService.fcmInitialized = true;

      const status = NotificationService.getServiceStatus();

      expect(status.twilio).toBe(true);
      expect(status.sendgrid).toBe(true);
      expect(status.fcm).toBe(true);
      expect(status.realtime).toBe(true);
    });
  });
});

describe('NotificationPreferencesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDefaultPreferences', () => {
    it('should return default preferences with correct structure', () => {
      const defaults = NotificationPreferencesService.getDefaultPreferences();

      expect(defaults.realtime).toBe(true);
      expect(defaults.email).toBe(true);
      expect(defaults.sms).toBe(false);
      expect(defaults.push).toBe(true);
      expect(defaults.bookingRequests).toBeDefined();
      expect(defaults.quietHours).toBeDefined();
      expect(defaults.frequencyLimits).toBeDefined();
    });
  });

  describe('validatePreferences', () => {
    it('should validate correct preferences', () => {
      const preferences = {
        email: true,
        sms: false,
        bookingRequests: {
          email: true,
          sms: false,
        },
        quietHours: {
          start: '22:00',
          end: '08:00',
        },
      };

      const validation = NotificationPreferencesService.validatePreferences(preferences);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid time format', () => {
      const preferences = {
        quietHours: {
          start: '25:00', // Invalid hour
          end: '08:00',
        },
      };

      const validation = NotificationPreferencesService.validatePreferences(preferences);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('quietHours.start must be in HH:MM format');
    });

    it('should reject non-boolean channel preferences', () => {
      const preferences = {
        email: 'yes', // Should be boolean
        sms: false,
      };

      const validation = NotificationPreferencesService.validatePreferences(preferences);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('email must be a boolean');
    });
  });

  describe('isQuietHours', () => {
    it('should detect quiet hours correctly for overnight period', () => {
      const quietHours = {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
      };

      // Mock current time to be 23:00
      jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('23:00:00');

      const isQuiet = NotificationPreferencesService.isQuietHours(quietHours);
      expect(isQuiet).toBe(true);
    });

    it('should detect quiet hours correctly for same-day period', () => {
      const quietHours = {
        enabled: true,
        start: '12:00',
        end: '14:00',
        timezone: 'UTC',
      };

      // Mock current time to be 13:00
      jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('13:00:00');

      const isQuiet = NotificationPreferencesService.isQuietHours(quietHours);
      expect(isQuiet).toBe(true);
    });

    it('should return false when quiet hours are disabled', () => {
      const quietHours = {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
      };

      const isQuiet = NotificationPreferencesService.isQuietHours(quietHours);
      expect(isQuiet).toBe(false);
    });
  });
});