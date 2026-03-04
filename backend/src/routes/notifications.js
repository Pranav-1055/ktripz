const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const NotificationService = require('../services/notificationService');
const NotificationPreferencesService = require('../services/notificationPreferencesService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Standard API success response helper
 */
function sendSuccess(res, data = null, message = 'Success') {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
  };

  if (data !== null) {
    response.data = data;
  }

  res.json(response);
}

/**
 * Standard API error response helper
 */
function sendError(res, statusCode, code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  };

  if (details) {
    response.error.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * Get notification service status
 * GET /api/notifications/status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = NotificationService.getServiceStatus();
    sendSuccess(res, status, 'Notification service status retrieved successfully');
  } catch (error) {
    logger.error('Failed to get notification service status:', error);
    sendError(res, 500, 'SERVICE_STATUS_ERROR', 'Failed to retrieve service status');
  }
});

/**
 * Get user notification preferences
 * GET /api/notifications/preferences
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const preferences = await NotificationPreferencesService.getUserPreferences(req.user.uid);
    sendSuccess(res, preferences, 'Notification preferences retrieved successfully');
  } catch (error) {
    logger.error('Failed to get notification preferences:', error);
    sendError(res, 500, 'PREFERENCES_ERROR', 'Failed to retrieve notification preferences');
  }
});

/**
 * Update user notification preferences
 * PUT /api/notifications/preferences
 */
router.put('/preferences', 
  authenticateToken,
  [
    body('realtime').optional().isBoolean().withMessage('realtime must be a boolean'),
    body('email').optional().isBoolean().withMessage('email must be a boolean'),
    body('sms').optional().isBoolean().withMessage('sms must be a boolean'),
    body('push').optional().isBoolean().withMessage('push must be a boolean'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input data', errors.array());
      }

      // Validate preferences structure
      const validation = NotificationPreferencesService.validatePreferences(req.body);
      if (!validation.valid) {
        return sendError(res, 400, 'INVALID_PREFERENCES', 'Invalid preferences structure', validation.errors);
      }

      const updatedPreferences = await NotificationPreferencesService.updateUserPreferences(req.user.uid, req.body);
      sendSuccess(res, updatedPreferences, 'Notification preferences updated successfully');
    } catch (error) {
      logger.error('Failed to update notification preferences:', error);
      sendError(res, 500, 'UPDATE_PREFERENCES_ERROR', 'Failed to update notification preferences');
    }
  }
);

/**
 * Update FCM token
 * POST /api/notifications/fcm-token
 */
router.post('/fcm-token',
  authenticateToken,
  [
    body('token').notEmpty().withMessage('FCM token is required'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input data', errors.array());
      }

      await NotificationPreferencesService.updateFCMToken(req.user.uid, req.body.token);
      sendSuccess(res, null, 'FCM token updated successfully');
    } catch (error) {
      logger.error('Failed to update FCM token:', error);
      sendError(res, 500, 'FCM_TOKEN_ERROR', 'Failed to update FCM token');
    }
  }
);

/**
 * Send test notification
 * POST /api/notifications/test
 */
router.post('/test',
  authenticateToken,
  [
    body('type').optional().isString().withMessage('type must be a string'),
    body('title').optional().isString().withMessage('title must be a string'),
    body('message').optional().isString().withMessage('message must be a string'),
    body('channels').optional().isArray().withMessage('channels must be an array'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input data', errors.array());
      }

      const {
        type = 'test',
        title = 'Test Notification',
        message = 'This is a test notification from TripO',
        channels = ['realtime', 'push']
      } = req.body;

      const notificationData = {
        type,
        title,
        message,
        data: {
          testNotification: true,
          timestamp: new Date().toISOString(),
        },
        priority: 'low',
      };

      // Get user contact info (mock for test)
      const userContact = {
        email: req.user.email,
        phoneNumber: req.user.phoneNumber,
        fcmToken: await NotificationPreferencesService.getFCMToken(req.user.uid),
      };

      // Create preferences object based on requested channels
      const testPreferences = {};
      for (const channel of ['realtime', 'email', 'sms', 'push']) {
        testPreferences[channel] = channels.includes(channel);
      }

      const result = await NotificationService.sendComprehensiveNotification(
        req.user.uid,
        notificationData,
        testPreferences,
        userContact
      );

      sendSuccess(res, result, 'Test notification sent successfully');
    } catch (error) {
      logger.error('Failed to send test notification:', error);
      sendError(res, 500, 'TEST_NOTIFICATION_ERROR', 'Failed to send test notification');
    }
  }
);

/**
 * Send SMS notification
 * POST /api/notifications/sms
 */
router.post('/sms',
  authenticateToken,
  [
    body('phoneNumber').notEmpty().withMessage('Phone number is required'),
    body('message').notEmpty().withMessage('Message is required'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input data', errors.array());
      }

      const { phoneNumber, message } = req.body;
      const result = await NotificationService.sendSMS(phoneNumber, message, { userId: req.user.uid });

      if (result.success) {
        sendSuccess(res, result, 'SMS sent successfully');
      } else {
        sendError(res, 500, 'SMS_ERROR', result.error);
      }
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      sendError(res, 500, 'SMS_ERROR', 'Failed to send SMS');
    }
  }
);

/**
 * Send email notification
 * POST /api/notifications/email
 */
router.post('/email',
  authenticateToken,
  [
    body('to').isEmail().withMessage('Valid email address is required'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('message').notEmpty().withMessage('Message is required'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input data', errors.array());
      }

      const { to, subject, message, html } = req.body;
      const result = await NotificationService.sendEmail(
        to,
        subject,
        html || `<p>${message}</p>`,
        message,
        { userId: req.user.uid }
      );

      if (result.success) {
        sendSuccess(res, result, 'Email sent successfully');
      } else {
        sendError(res, 500, 'EMAIL_ERROR', result.error);
      }
    } catch (error) {
      logger.error('Failed to send email:', error);
      sendError(res, 500, 'EMAIL_ERROR', 'Failed to send email');
    }
  }
);

/**
 * Send push notification
 * POST /api/notifications/push
 */
router.post('/push',
  authenticateToken,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('body').notEmpty().withMessage('Body is required'),
    body('token').optional().isString().withMessage('Token must be a string'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input data', errors.array());
      }

      const { title, body, token, data = {} } = req.body;
      
      // Use provided token or get user's token
      const fcmToken = token || await NotificationPreferencesService.getFCMToken(req.user.uid);
      
      if (!fcmToken) {
        return sendError(res, 400, 'NO_FCM_TOKEN', 'No FCM token available for user');
      }

      const result = await NotificationService.sendPushNotification(
        fcmToken,
        { title, body },
        { ...data, userId: req.user.uid }
      );

      if (result.success) {
        sendSuccess(res, result, 'Push notification sent successfully');
      } else {
        sendError(res, 500, 'PUSH_ERROR', result.error);
      }
    } catch (error) {
      logger.error('Failed to send push notification:', error);
      sendError(res, 500, 'PUSH_ERROR', 'Failed to send push notification');
    }
  }
);

/**
 * Get notification channels for a specific notification type
 * GET /api/notifications/channels/:notificationType
 */
router.get('/channels/:notificationType', authenticateToken, async (req, res) => {
  try {
    const { notificationType } = req.params;
    const channels = await NotificationPreferencesService.getNotificationChannels(req.user.uid, notificationType);
    
    sendSuccess(res, {
      notificationType,
      channels,
    }, 'Notification channels retrieved successfully');
  } catch (error) {
    logger.error('Failed to get notification channels:', error);
    sendError(res, 500, 'CHANNELS_ERROR', 'Failed to retrieve notification channels');
  }
});

/**
 * Test comprehensive notification for booking confirmation
 * POST /api/notifications/test-booking-confirmation
 */
router.post('/test-booking-confirmation', authenticateToken, async (req, res) => {
  try {
    const mockBookingData = {
      id: 'booking_test_123',
      rideId: 'ride_test_456',
      origin: 'New York',
      destination: 'Boston',
      departureTime: '2024-01-15T10:00:00Z',
      seatsBooked: 2,
    };

    const mockPassengerData = {
      id: req.user.uid,
      name: req.user.displayName || 'Test Passenger',
      email: req.user.email,
      phoneNumber: req.user.phoneNumber,
      fcmToken: await NotificationPreferencesService.getFCMToken(req.user.uid),
      preferences: {
        notifications: await NotificationPreferencesService.getUserPreferences(req.user.uid),
      },
    };

    const mockDriverData = {
      id: 'driver_test_789',
      name: 'Test Driver',
      email: 'driver@test.com',
      phoneNumber: '+1234567890',
      fcmToken: null,
      preferences: {
        notifications: NotificationPreferencesService.getDefaultPreferences(),
      },
    };

    await NotificationService.sendBookingConfirmationNotifications(
      mockBookingData,
      mockPassengerData,
      mockDriverData
    );

    sendSuccess(res, null, 'Test booking confirmation notifications sent successfully');
  } catch (error) {
    logger.error('Failed to send test booking confirmation notifications:', error);
    sendError(res, 500, 'TEST_BOOKING_ERROR', 'Failed to send test booking confirmation notifications');
  }
});

module.exports = router;