const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const RealtimeService = require('../services/realtimeService');
const { getSocketInstance, getUsersInRoom } = require('../config/socket');
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
 * Get real-time connection statistics
 * GET /api/realtime/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await RealtimeService.getRealtimeStats();
    sendSuccess(res, stats, 'Real-time statistics retrieved successfully');
  } catch (error) {
    logger.error('Failed to get realtime stats:', error);
    sendError(res, 500, 'STATS_ERROR', 'Failed to retrieve real-time statistics');
  }
});

/**
 * Get users in a specific room
 * GET /api/realtime/rooms/:roomName/users
 */
router.get('/rooms/:roomName/users', authenticateToken, async (req, res) => {
  try {
    const { roomName } = req.params;
    const users = await getUsersInRoom(roomName);
    
    sendSuccess(res, {
      room: roomName,
      userCount: users.size,
      users: Array.from(users),
    }, 'Room users retrieved successfully');
  } catch (error) {
    logger.error('Failed to get room users:', error);
    sendError(res, 500, 'ROOM_USERS_ERROR', 'Failed to retrieve room users');
  }
});

/**
 * Send a test notification to user
 * POST /api/realtime/test-notification
 */
router.post('/test-notification', authenticateToken, async (req, res) => {
  try {
    const { type = 'test', title = 'Test Notification', message = 'This is a test notification' } = req.body;
    
    const notification = {
      type,
      title,
      message,
      data: {
        testData: 'This is test data',
      },
      priority: 'low',
    };

    const io = getSocketInstance();
    io.to(`user_${req.user.uid}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });

    sendSuccess(res, { notification }, 'Test notification sent successfully');
  } catch (error) {
    logger.error('Failed to send test notification:', error);
    sendError(res, 500, 'NOTIFICATION_ERROR', 'Failed to send test notification');
  }
});

/**
 * Trigger a ride update for testing
 * POST /api/realtime/test-ride-update
 */
router.post('/test-ride-update', authenticateToken, async (req, res) => {
  try {
    const { rideId, updateType = 'availability_change', data = {} } = req.body;

    if (!rideId) {
      return sendError(res, 400, 'MISSING_RIDE_ID', 'Ride ID is required');
    }

    await RealtimeService.notifyRideUpdate(rideId, {
      type: updateType,
      ...data,
      testUpdate: true,
    });

    sendSuccess(res, { rideId, updateType }, 'Test ride update sent successfully');
  } catch (error) {
    logger.error('Failed to send test ride update:', error);
    sendError(res, 500, 'RIDE_UPDATE_ERROR', 'Failed to send test ride update');
  }
});

/**
 * Trigger a booking status change for testing
 * POST /api/realtime/test-booking-status
 */
router.post('/test-booking-status', authenticateToken, async (req, res) => {
  try {
    const { bookingId, passengerId, driverId, status = 'confirmed' } = req.body;

    if (!bookingId || !passengerId || !driverId) {
      return sendError(res, 400, 'MISSING_PARAMETERS', 'Booking ID, passenger ID, and driver ID are required');
    }

    await RealtimeService.notifyBookingStatusChange(bookingId, passengerId, driverId, status, {
      testUpdate: true,
    });

    sendSuccess(res, { bookingId, status }, 'Test booking status change sent successfully');
  } catch (error) {
    logger.error('Failed to send test booking status change:', error);
    sendError(res, 500, 'BOOKING_STATUS_ERROR', 'Failed to send test booking status change');
  }
});

/**
 * Send a test message
 * POST /api/realtime/test-message
 */
router.post('/test-message', authenticateToken, async (req, res) => {
  try {
    const { bookingId, receiverId, message = 'This is a test message' } = req.body;

    if (!bookingId || !receiverId) {
      return sendError(res, 400, 'MISSING_PARAMETERS', 'Booking ID and receiver ID are required');
    }

    await RealtimeService.sendMessage(bookingId, req.user.uid, receiverId, {
      type: 'text',
      content: message,
      testMessage: true,
    });

    sendSuccess(res, { bookingId, message }, 'Test message sent successfully');
  } catch (error) {
    logger.error('Failed to send test message:', error);
    sendError(res, 500, 'MESSAGE_ERROR', 'Failed to send test message');
  }
});

/**
 * Get WebSocket connection info
 * GET /api/realtime/connection-info
 */
router.get('/connection-info', authenticateToken, async (req, res) => {
  try {
    const io = getSocketInstance();
    const connectionInfo = {
      serverUrl: `${req.protocol}://${req.get('host')}`,
      namespace: '/',
      transports: ['websocket', 'polling'],
      auth: {
        required: true,
        method: 'Bearer token in auth.token or Authorization header',
      },
      events: {
        client_to_server: [
          'join_ride',
          'leave_ride',
          'join_booking',
          'leave_booking',
          'share_location',
          'typing_start',
          'typing_stop',
        ],
        server_to_client: [
          'ride_updated',
          'booking_status_changed',
          'trip_tracking_update',
          'notification',
          'message_received',
          'location_update',
          'user_typing',
        ],
      },
      rooms: {
        user_specific: 'user_{userId}',
        ride_specific: 'ride_{rideId}',
        booking_specific: 'booking_{bookingId}',
      },
    };

    sendSuccess(res, connectionInfo, 'WebSocket connection info retrieved successfully');
  } catch (error) {
    logger.error('Failed to get connection info:', error);
    sendError(res, 500, 'CONNECTION_INFO_ERROR', 'Failed to retrieve connection info');
  }
});

module.exports = router;